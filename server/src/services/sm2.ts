/**
 * SM-2 spaced-repetition algorithm (the SuperMemo 2 method, 1988).
 *
 * Everything here is PURE: no database, no `Date.now()`, no side effects. The
 * caller passes in the current state and "today", and gets back the next state.
 * That makes it trivial to unit-test (see sm2.test.ts).
 *
 * The idea: after you review an item you grade how well it went (0-5). A good
 * grade pushes the next review further out; a bad grade (< 3) resets it to
 * tomorrow. Each item also has an "ease factor" that stretches or compresses
 * its intervals over time based on your grade history.
 */

import type { $Enums } from "@prisma/client";

/** The part of a ReviewSchedule row the algorithm reads and rewrites. */
export interface ReviewState {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
}

/** ReviewState plus the computed date of the next review. */
export interface ReviewUpdate extends ReviewState {
  nextReviewDate: Date;
}

/** State for an item that has never been reviewed. Matches the DB defaults. */
export const DEFAULT_REVIEW_STATE: ReviewState = {
  easeFactor: 2.5,
  intervalDays: 0,
  repetitions: 0,
};

/** SM-2's hard floor for the ease factor. Below this, intervals barely grow. */
const MIN_EASE_FACTOR = 1.3;

/**
 * Turn a logged attempt into a 0-5 SM-2 quality grade.
 *
 *   SOLVED     -> your confidence (1-5), but never below 3 (it was still a
 *                 solve). Imported history has no confidence -> treat as 4.
 *   STRUGGLED  -> 2  (a lapse: you got there but recall was poor)
 *   FAILED     -> 1  (a lapse)
 */
export function gradeFromAttempt(
  outcome: $Enums.Outcome,
  confidence: number | null,
): number {
  switch (outcome) {
    case "SOLVED":
      return confidence === null ? 4 : Math.max(3, confidence);
    case "STRUGGLED":
      return 2;
    case "FAILED":
      return 1;
    default: {
      // If a new Outcome value is ever added, TypeScript flags this line
      // (a value that should be `never` isn't), forcing us to handle it.
      const unexpected: never = outcome;
      throw new Error(`Unhandled outcome: ${String(unexpected)}`);
    }
  }
}

/**
 * Compute the next review state from the current one and a grade.
 *
 * @param state  current schedule state (use DEFAULT_REVIEW_STATE for a new item)
 * @param grade  0-5 quality score, e.g. from `gradeFromAttempt`
 * @param today  the date to schedule relative to (passed in, not read from the clock)
 */
export function computeNextReview(
  state: ReviewState,
  grade: number,
  today: Date,
): ReviewUpdate {
  // Be defensive about out-of-range input.
  const q = Math.max(0, Math.min(5, Math.round(grade)));

  let { easeFactor, intervalDays, repetitions } = state;

  if (q < 3) {
    // A lapse. Start the ladder over: review again tomorrow. Per the original
    // SM-2, the ease factor is left UNCHANGED on a lapse.
    repetitions = 0;
    intervalDays = 1;
  } else {
    // A pass. Advance along the interval ladder: 1 day, then 6 days, then
    // grow by the ease factor each time.
    if (repetitions === 0) {
      intervalDays = 1;
    } else if (repetitions === 1) {
      intervalDays = 6;
    } else {
      intervalDays = Math.round(intervalDays * easeFactor);
    }
    repetitions += 1;

    // Adjust the ease factor by how this review went. Grade 4 leaves it
    // unchanged; 5 nudges it up; 3 pulls it down. Never below the floor.
    easeFactor += 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02);
    if (easeFactor < MIN_EASE_FACTOR) {
      easeFactor = MIN_EASE_FACTOR;
    }
  }

  return { easeFactor, intervalDays, repetitions, nextReviewDate: addDays(today, intervalDays) };
}

/** `date` + `days`, as a new Date. Uses UTC arithmetic to dodge DST edges. */
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}
