/**
 * Submission sync: import your LeetCode submission history into the `submissions`
 * table.
 *
 * Two entry points:
 *   - `npm run sync:submissions` runs the CLI wrapper at the bottom of this file.
 *   - The "Connect LeetCode" screen / auto-sync call `runSubmissionSync()`.
 *
 * Uses LeetCode's GraphQL `submissionList` query (not the `/api/submissions/`
 * REST endpoint, which LeetCode blocks from datacenter IPs like a host's). The
 * trade-off: GraphQL doesn't return the submission source, so `code` is stored
 * empty. Nothing in the app displays it.
 *
 * Idempotent — each submission is UPSERTed by its LeetCode id, so re-running
 * refreshes the catalog link and adds anything new. Your reflective `Attempt`
 * rows live in a different table and are untouched.
 */

import { prisma } from "../db";
import { leetcodeGraphQL, LeetCodeAuthError } from "./client";
import { buildAuthHeaders, resolveLeetCodeAuth, type LeetCodeAuth } from "./auth";

// --- Tuning knobs --------------------------------------------------------
const PAGE_LIMIT = 20; // LeetCode caps submissionList at 20 per request
const DELAY_MS = 1200; // be polite between pages
const MAX_PAGES = 500; // safety valve: 500 * 20 = 10k submissions

const SUBMISSION_LIST_QUERY = `
  query submissionList($offset: Int!, $limit: Int!) {
    submissionList(offset: $offset, limit: $limit) {
      hasNext
      submissions {
        id
        titleSlug
        statusDisplay
        lang
        runtime
        memory
        timestamp
      }
    }
  }
`;

/** One entry from the GraphQL submissionList response. */
interface GqlSubmission {
  id: string;
  titleSlug: string;
  statusDisplay: string; // "Accepted", "Wrong Answer", ...
  lang: string;
  runtime: string;
  memory: string;
  timestamp: string; // unix SECONDS, as a string
}

interface SubmissionListResponse {
  submissionList: {
    hasNext: boolean | null;
    // null when the session isn't valid.
    submissions: GqlSubmission[] | null;
  } | null;
}

export interface SubmissionSyncResult {
  /** Total submissions stored (created or refreshed). */
  imported: number;
  /** How many of those were "Accepted". */
  accepted: number;
  /** Distinct problems with at least one accepted submission. */
  distinctSolved: number;
  /** Slugs seen in submissions but missing from the catalog. */
  unmatched: string[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** slug -> our Problem.id, for linking submissions to the catalog. */
async function loadProblemIdBySlug(): Promise<Map<string, number>> {
  const rows = await prisma.problem.findMany({ select: { id: true, slug: true } });
  return new Map(rows.map((row) => [row.slug, row.id]));
}

export interface SyncOptions {
  onProgress?: (progress: { imported: number; accepted: number }) => void;
  /**
   * Stop as soon as a whole page contains only submissions we already have.
   * The endpoint is newest-first, so new submissions are always at the front —
   * this makes a routine sync fetch roughly one page.
   */
  incremental?: boolean;
}

/**
 * Page through GraphQL `submissionList`, upserting each row.
 */
export async function runSubmissionSync(
  auth: LeetCodeAuth,
  options: SyncOptions = {},
): Promise<SubmissionSyncResult> {
  const { onProgress, incremental = false } = options;
  const headers = buildAuthHeaders(auth);
  const problemIdBySlug = await loadProblemIdBySlug();

  // For an incremental run, the ids we already hold — so we can stop early.
  const knownIds = incremental
    ? new Set(
        (await prisma.submission.findMany({ select: { lcSubmissionId: true } })).map(
          (r) => r.lcSubmissionId,
        ),
      )
    : new Set<string>();

  let offset = 0;
  let pages = 0;
  let imported = 0;
  let accepted = 0;
  const unmatchedSlugs = new Set<string>();
  const solvedSlugs = new Set<string>();

  while (pages < MAX_PAGES) {
    const data = await leetcodeGraphQL<SubmissionListResponse>(
      { query: SUBMISSION_LIST_QUERY, variables: { offset, limit: PAGE_LIMIT } },
      headers,
    );

    const list = data.submissionList;
    if (!list || list.submissions === null) {
      throw new LeetCodeAuthError(
        "LeetCode rejected the request — your session has likely expired. Reconnect it.",
      );
    }

    const batch = list.submissions;
    if (batch.length === 0) break;

    // Incremental: if every row here is already stored, we've caught up.
    if (incremental && batch.every((s) => knownIds.has(s.id))) break;

    for (const s of batch) {
      const problemId = problemIdBySlug.get(s.titleSlug) ?? null;
      if (problemId === null) unmatchedSlugs.add(s.titleSlug);

      const isAccepted = s.statusDisplay === "Accepted";
      if (isAccepted) {
        accepted += 1;
        solvedSlugs.add(s.titleSlug);
      }

      await prisma.submission.upsert({
        where: { lcSubmissionId: s.id },
        create: {
          lcSubmissionId: s.id,
          problemId,
          titleSlug: s.titleSlug,
          lang: s.lang,
          statusDisplay: s.statusDisplay,
          isAccepted,
          runtime: s.runtime || null,
          memory: s.memory || null,
          code: "", // GraphQL submissionList doesn't return the source
          submittedAt: new Date(Number(s.timestamp) * 1000),
        },
        // A submission is immutable on LeetCode; the only thing worth refreshing
        // is the catalog link (in case the catalog was synced after this row).
        update: { problemId },
      });
      imported += 1;
    }

    onProgress?.({ imported, accepted });

    pages += 1;
    if (!list.hasNext) break;
    offset += PAGE_LIMIT;
    await sleep(DELAY_MS);
  }

  return {
    imported,
    accepted,
    distinctSolved: solvedSlugs.size,
    unmatched: [...unmatchedSlugs],
  };
}

// --- CLI wrapper -------------------------------------------------------

async function main(): Promise<void> {
  const auth = await resolveLeetCodeAuth();
  console.log(`Fetching submissions for "${auth.username || "connected account"}"...`);

  const result = await runSubmissionSync(auth, {
    onProgress: ({ imported }) => console.log(`  ...${imported} submissions`),
  });

  console.log(`\nDone.`);
  console.log(`  ${result.imported} submissions stored`);
  console.log(`  ${result.accepted} accepted, across ${result.distinctSolved} distinct problems`);
  if (result.unmatched.length > 0) {
    console.log(
      `  ${result.unmatched.length} submissions were for slugs not in the catalog ` +
        `(run sync:catalog if that seems high): ${result.unmatched.slice(0, 10).join(", ")}` +
        (result.unmatched.length > 10 ? ", ..." : ""),
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
