/**
 * Submission sync: pull your recent LeetCode solves into the `submissions` table.
 *
 * Entry points:
 *   - `npm run sync:submissions` runs the CLI wrapper at the bottom.
 *   - The "Connect LeetCode" screen / auto-sync call `runSubmissionSync()`.
 *
 * Uses the PUBLIC GraphQL `recentAcSubmissionList(username, limit)` query. It
 * works from any IP — including a datacenter host — unlike LeetCode's
 * `/api/submissions/` REST endpoint and the authenticated `submissionList`
 * query, which both return nothing to cloud IPs.
 *
 * Trade-offs of the public endpoint:
 *   - accepted submissions only (no Wrong Answer / TLE rows — but those never
 *     produced anything downstream anyway)
 *   - roughly the last 20, so it keeps you current rather than importing a full
 *     back-catalogue
 *   - no language / runtime / memory / source code
 *
 * Idempotent — each submission is UPSERTed by its LeetCode id.
 */

import { prisma } from "../db";
import { leetcodeGraphQL, LeetCodeAuthError } from "./client";
import { buildAuthHeaders, resolveLeetCodeAuth, type LeetCodeAuth } from "./auth";

// LeetCode caps this endpoint around 20 regardless of what we ask for.
const RECENT_LIMIT = 20;

const RECENT_AC_QUERY = `
  query recentAcSubmissions($username: String!, $limit: Int!) {
    recentAcSubmissionList(username: $username, limit: $limit) {
      id
      titleSlug
      timestamp
    }
  }
`;

interface RecentAcSubmission {
  id: string;
  titleSlug: string;
  timestamp: string; // unix SECONDS, as a string
}

interface RecentAcResponse {
  // null when the username is unknown.
  recentAcSubmissionList: RecentAcSubmission[] | null;
}

export interface SubmissionSyncResult {
  /** Submissions newly stored this run. */
  imported: number;
  /** Accepted submissions seen (all of them, with this endpoint). */
  accepted: number;
  /** Distinct problems across the returned submissions. */
  distinctSolved: number;
  /** Slugs not found in the catalog. */
  unmatched: string[];
}

export interface SyncOptions {
  onProgress?: (progress: { imported: number; accepted: number }) => void;
}

/** slug -> our Problem.id, for linking submissions to the catalog. */
async function loadProblemIdBySlug(): Promise<Map<string, number>> {
  const rows = await prisma.problem.findMany({ select: { id: true, slug: true } });
  return new Map(rows.map((row) => [row.slug, row.id]));
}

export async function runSubmissionSync(
  auth: LeetCodeAuth,
  options: SyncOptions = {},
): Promise<SubmissionSyncResult> {
  if (!auth.username) {
    throw new LeetCodeAuthError(
      "No LeetCode username on record — reconnect your account.",
    );
  }

  const problemIdBySlug = await loadProblemIdBySlug();
  const knownIds = new Set(
    (await prisma.submission.findMany({ select: { lcSubmissionId: true } })).map(
      (r) => r.lcSubmissionId,
    ),
  );

  const data = await leetcodeGraphQL<RecentAcResponse>(
    { query: RECENT_AC_QUERY, variables: { username: auth.username, limit: RECENT_LIMIT } },
    buildAuthHeaders(auth),
  );

  const list = data.recentAcSubmissionList;
  if (list === null) {
    throw new LeetCodeAuthError(
      `LeetCode has no submissions for "${auth.username}". Check the connected username, or reconnect.`,
    );
  }

  let imported = 0;
  const unmatchedSlugs = new Set<string>();
  const solvedSlugs = new Set<string>();

  for (const s of list) {
    const problemId = problemIdBySlug.get(s.titleSlug) ?? null;
    if (problemId === null) unmatchedSlugs.add(s.titleSlug);
    solvedSlugs.add(s.titleSlug);

    const isNew = !knownIds.has(s.id);
    await prisma.submission.upsert({
      where: { lcSubmissionId: s.id },
      create: {
        lcSubmissionId: s.id,
        problemId,
        titleSlug: s.titleSlug,
        lang: "",
        statusDisplay: "Accepted",
        isAccepted: true,
        runtime: null,
        memory: null,
        code: "",
        submittedAt: new Date(Number(s.timestamp) * 1000),
      },
      // Only worth refreshing the catalog link (if the catalog was synced later).
      update: { problemId },
    });
    if (isNew) imported += 1;
  }

  options.onProgress?.({ imported, accepted: list.length });

  return {
    imported,
    accepted: list.length,
    distinctSolved: solvedSlugs.size,
    unmatched: [...unmatchedSlugs],
  };
}

// --- CLI wrapper -------------------------------------------------------

async function main(): Promise<void> {
  const auth = await resolveLeetCodeAuth();
  console.log(`Fetching recent solves for "${auth.username || "connected account"}"...`);

  const result = await runSubmissionSync(auth);

  console.log(`\nDone.`);
  console.log(`  ${result.imported} new (of ${result.accepted} recent accepted)`);
  console.log(`  across ${result.distinctSolved} distinct problems`);
  if (result.unmatched.length > 0) {
    console.log(
      `  ${result.unmatched.length} not in the catalog ` +
        `(run sync:catalog if that seems high): ${result.unmatched.slice(0, 10).join(", ")}`,
    );
  }
}

// Only run the CLI flow when executed directly, not when imported by a route.
if (process.argv[1] && process.argv[1].endsWith("syncSubmissions.ts")) {
  main()
    .then(() => prisma.$disconnect())
    .catch(async (err) => {
      if (err instanceof LeetCodeAuthError) console.error(`\n${err.message}`);
      else console.error(err);
      await prisma.$disconnect();
      process.exit(1);
    });
}
