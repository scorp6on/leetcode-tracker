/**
 * The bridge between a logged attempt and its spaced-repetition schedule.
 *
 * `sm2.ts` is pure math. This file is where that math meets the database:
 * given an attempt, grade it, load the problem's current schedule (or the
 * default if it has none yet), compute the next state, and save it.
 */

import type { $Enums } from "@prisma/client";
import { prisma } from "../db";
import { computeNextReview, gradeFromAttempt, DEFAULT_REVIEW_STATE } from "./sm2";

/**
 * Update (or create) a problem's ReviewSchedule based on one attempt.
 *
 * @param problemId   which problem
 * @param outcome     the attempt's outcome
 * @param confidence  the attempt's confidence (null for imported attempts)
 * @param when        when the attempt happened — schedules are relative to this
 */
export async function applyAttemptToSchedule(
  problemId: number,
  outcome: $Enums.Outcome,
  confidence: number | null,
  when: Date = new Date(),
): Promise<void> {
  const grade = gradeFromAttempt(outcome, confidence);

  const current = await prisma.reviewSchedule.findUnique({ where: { problemId } });
  const next = computeNextReview(current ?? DEFAULT_REVIEW_STATE, grade, when);

  await prisma.reviewSchedule.upsert({
    where: { problemId },
    create: { problemId, ...next },
    update: next,
  });
}
