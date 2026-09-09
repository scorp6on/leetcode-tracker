/**
 * Seed baseline attempts from imported LeetCode submissions.
 *
 * Two entry points:
 *   - `npm run seed:from-submissions` runs the CLI wrapper at the bottom.
 *   - The "Connect LeetCode" screen calls `seedBaselineAttempts()` after a sync.
 *
 * For every problem you have an *accepted* submission for, this creates ONE
 * attempt row:
 *   - outcome:   SOLVED
 *   - source:    IMPORTED
 *   - attemptedAt: the date of your earliest accepted submission for it
 *   - minutes / confidence: null (unknown for historical solves)
 *
 * Idempotent: a problem that already has an IMPORTED attempt is skipped, so
 * re-running only picks up newly-synced solves.
 */

import { prisma } from "../db";
import { applyAttemptToSchedule } from "../services/scheduling";

export interface SeedResult {
  /** Distinct solved problems found in the submission history. */
  solvedProblems: number;
  /** Of those, how many already had a baseline attempt. */
  alreadySeeded: number;
  /** New baseline attempts (and review schedules) created this run. */
  created: number;
  /** Accepted submissions whose slug isn't in the catalog. */
  unmatched: number;
}

export async function seedBaselineAttempts(): Promise<SeedResult> {
  // One row per solved problem, with the earliest accepted-submission date.
  // `problemId: { not: null }` drops submissions whose slug isn't in the catalog.
  const solved = await prisma.submission.groupBy({
    by: ["problemId"],
    where: { isAccepted: true, problemId: { not: null } },
    _min: { submittedAt: true },
  });

  const unmatched = await prisma.submission.count({
    where: { isAccepted: true, problemId: null },
  });

  const solvedProblemIds = solved
    .map((g) => g.problemId)
    .filter((id): id is number => id !== null);

  if (solvedProblemIds.length === 0) {
    return { solvedProblems: 0, alreadySeeded: 0, created: 0, unmatched };
  }

  const existing = await prisma.attempt.findMany({
    where: { source: "IMPORTED", problemId: { in: solvedProblemIds } },
    select: { problemId: true },
  });
  const alreadySeeded = new Set(existing.map((a) => a.problemId));

  const toCreate = solved
    .filter((g) => g.problemId !== null && !alreadySeeded.has(g.problemId))
    .map((g) => ({
      problemId: g.problemId as number,
      source: "IMPORTED" as const,
      outcome: "SOLVED" as const,
      attemptedAt: g._min.submittedAt ?? new Date(),
    }));

  const result = await prisma.attempt.createMany({ data: toCreate });

  // Give each newly-seeded problem an initial review schedule, graded as a
  // solve. `toCreate` is empty on a re-run, so existing schedules aren't touched.
  for (const row of toCreate) {
    await applyAttemptToSchedule(row.problemId, "SOLVED", null, row.attemptedAt);
  }

  return {
    solvedProblems: solvedProblemIds.length,
    alreadySeeded: alreadySeeded.size,
    created: result.count,
    unmatched,
  };
}

// --- CLI wrapper -------------------------------------------------------

if (process.argv[1] && process.argv[1].endsWith("seedFromSubmissions.ts")) {
  seedBaselineAttempts()
    .then((r) => {
      console.log("Done.");
      console.log(`  ${r.solvedProblems} solved problems in your history`);
      console.log(`  ${r.alreadySeeded} already had a baseline attempt`);
      console.log(`  ${r.created} baseline attempts created (with review schedules)`);
      if (r.unmatched > 0) {
        console.log(`  ${r.unmatched} accepted submissions skipped (slug not in catalog)`);
      }
      return prisma.$disconnect();
    })
    .catch(async (err) => {
      console.error(err);
      await prisma.$disconnect();
      process.exit(1);
    });
}
