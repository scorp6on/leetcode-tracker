/**
 * Submission sync: import your LeetCode submission history into the `submissions`
 * table.
 *
 * Two entry points:
 *   - `npm run sync:submissions` runs the CLI wrapper at the bottom of this file.
 *   - The "Connect LeetCode" screen calls `runSubmissionSync()` from an endpoint.
 *
 * Idempotent — each submission is UPSERTed by its LeetCode id, so re-running
 * refreshes the catalog link and adds anything new. Your reflective `Attempt`
 * rows live in a different table and are untouched.
 */

import { prisma } from "../db";
import { leetcodeRestGet, LeetCodeAuthError } from "./client";
import { buildAuthHeaders, resolveLeetCodeAuth, type LeetCodeAuth } from "./auth";

// --- Tuning knobs --------------------------------------------------------
const PAGE_LIMIT = 20; // LeetCode caps this endpoint at 20 per request
const DELAY_MS = 1500; // this endpoint is rate-limit sensitive; go slow
const MAX_PAGES = 500; // safety valve: 500 * 20 = 10k submissions

// Shape of one entry in the REST response's `submissions_dump` array. LeetCode
// sends more fields than this; we only declare the ones we use.
interface RawSubmission {
  id: number;
  lang: string;
  timestamp: number | string; // unix SECONDS
  status_display: string; // "Accepted", "Wrong Answer", ...
  runtime: string;
  memory: string;
  title: string;
  title_slug: string;
  code: string;
}

interface SubmissionsPage {
  submissions_dump: RawSubmission[];
  has_next: boolean;
  last_key: string | null;
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

/**
 * Page through the submissions REST endpoint, upserting each row.
 *
 * @param auth        resolved LeetCode credentials
 * @param onProgress  optional callback after each page, for a live UI
 */
export async function runSubmissionSync(
  auth: LeetCodeAuth,
  onProgress?: (progress: { imported: number; accepted: number }) => void,
): Promise<SubmissionSyncResult> {
  const headers = buildAuthHeaders(auth);
  const problemIdBySlug = await loadProblemIdBySlug();

  let offset = 0;
  let pages = 0;
  let imported = 0;
  let accepted = 0;
  const unmatchedSlugs = new Set<string>();
  const solvedSlugs = new Set<string>();

  while (pages < MAX_PAGES) {
    const page = await leetcodeRestGet<SubmissionsPage>(
      `/api/submissions/?offset=${offset}&limit=${PAGE_LIMIT}`,
      headers,
    );

    const batch = page.submissions_dump ?? [];
    if (batch.length === 0) break;

    for (const s of batch) {
      const problemId = problemIdBySlug.get(s.title_slug) ?? null;
      if (problemId === null) unmatchedSlugs.add(s.title_slug);

      const isAccepted = s.status_display === "Accepted";
      if (isAccepted) {
        accepted += 1;
        solvedSlugs.add(s.title_slug);
      }

      await prisma.submission.upsert({
        where: { lcSubmissionId: String(s.id) },
        create: {
          lcSubmissionId: String(s.id),
          problemId,
          titleSlug: s.title_slug,
          lang: s.lang,
          statusDisplay: s.status_display,
          isAccepted,
          runtime: s.runtime || null,
          memory: s.memory || null,
          code: s.code ?? "",
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
    if (!page.has_next) break;
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

  const result = await runSubmissionSync(auth, ({ imported }) =>
    console.log(`  ...${imported} submissions`),
  );

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
