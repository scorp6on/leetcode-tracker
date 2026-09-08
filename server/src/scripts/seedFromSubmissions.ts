/**
 * Seed baseline attempts from imported LeetCode submissions.
 *
 * Run with:  npm run seed:from-submissions
 * Prereq:    npm run sync:submissions has been run at least once
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

async function main(): Promise<void> {
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
    console.log("No accepted submissions linked to catalog problems. Nothing to seed.");
    if (unmatched > 0) {
      console.log(`(${unmatched} accepted submissions had slugs not in the catalog.)`);
    }
    return;
  }

  // Which of those already have a baseline attempt?
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

  console.log("Done.");
  console.log(`  ${solvedProblemIds.length} solved problems in your history`);
  console.log(`  ${alreadySeeded.size} already had a baseline attempt`);
  console.log(`  ${result.count} baseline attempts created (with review schedules)`);
  if (unmatched > 0) {
    console.log(`  ${unmatched} accepted submissions skipped (slug not in catalog)`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
