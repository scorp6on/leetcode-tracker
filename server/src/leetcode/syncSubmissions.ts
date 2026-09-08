/**
 * Submission sync: import your LeetCode submission history into the `submissions`
 * table.
 *
 * Run with:  npm run sync:submissions
 * Requires:  LEETCODE_SESSION, LEETCODE_CSRF, LEETCODE_USERNAME in server/.env
 *            (see server/.env.example)
 *
 * Idempotent — each submission is UPSERTed by its LeetCode id, so re-running
 * refreshes the catalog link and adds anything new. Your reflective `Attempt`
 * rows live in a different table and are untouched.
 *
 * This is raw import. Turning it into "these are the problems I've solved" (and
 * seeding the review schedule) happens in the attempts milestone, which reads
 * this table.
 */

import { prisma } from "../db";
import { leetcodeRestGet, LeetCodeAuthError } from "./client";
import { buildAuthHeaders, loadLeetCodeAuth } from "./auth";

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** slug -> our Problem.id, for linking submissions to the catalog. */
async function loadProblemIdBySlug(): Promise<Map<string, number>> {
  const rows = await prisma.problem.findMany({ select: { id: true, slug: true } });
  return new Map(rows.map((row) => [row.slug, row.id]));
}

async function main(): Promise<void> {
  const auth = loadLeetCodeAuth();
  const headers = buildAuthHeaders(auth);

  const problemIdBySlug = await loadProblemIdBySlug();
  console.log(`Catalog has ${problemIdBySlug.size} problems to match against.`);
  console.log(`Fetching submissions for "${auth.username}"...`);

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

    console.log(`  ...${imported} submissions (offset ${offset})`);

    pages += 1;
    if (!page.has_next) break;
    offset += PAGE_LIMIT;
    await sleep(DELAY_MS);
  }

  console.log(`\nDone.`);
  console.log(`  ${imported} submissions stored`);
  console.log(`  ${accepted} accepted, across ${solvedSlugs.size} distinct problems`);
  if (unmatchedSlugs.size > 0) {
    console.log(
      `  ${unmatchedSlugs.size} submissions were for slugs not in the catalog ` +
        `(run sync:catalog if that seems high): ${[...unmatchedSlugs].slice(0, 10).join(", ")}` +
        (unmatchedSlugs.size > 10 ? ", ..." : ""),
    );
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    // Auth failures get a clean one-line message; everything else prints in full.
    if (err instanceof LeetCodeAuthError) {
      console.error(`\n${err.message}`);
    } else {
      console.error(err);
    }
    await prisma.$disconnect();
    process.exit(1);
  });
