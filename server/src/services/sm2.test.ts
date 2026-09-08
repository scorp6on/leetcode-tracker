/**
 * Unit tests for the pure SM-2 functions.
 *
 * Run with:  npm test
 * Uses Node's built-in test runner (`node:test`) and assertions (`node:assert`).
 * No framework, no config.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { computeNextReview, gradeFromAttempt, DEFAULT_REVIEW_STATE } from "./sm2";

const DAY = 24 * 60 * 60 * 1000;
const TODAY = new Date("2026-01-01T00:00:00.000Z");

test("gradeFromAttempt maps outcome + confidence to 0-5", () => {
  assert.equal(gradeFromAttempt("SOLVED", 5), 5);
  assert.equal(gradeFromAttempt("SOLVED", 3), 3);
  assert.equal(gradeFromAttempt("SOLVED", 1), 3, "a solve never grades below 3");
  assert.equal(gradeFromAttempt("SOLVED", null), 4, "imported solve with no confidence");
  assert.equal(gradeFromAttempt("STRUGGLED", 4), 2);
  assert.equal(gradeFromAttempt("FAILED", 5), 1);
});

test("first pass schedules 1 day out", () => {
  const r = computeNextReview(DEFAULT_REVIEW_STATE, 5, TODAY);
  assert.equal(r.repetitions, 1);
  assert.equal(r.intervalDays, 1);
  assert.equal(r.nextReviewDate.getTime(), TODAY.getTime() + 1 * DAY);
});

test("second pass schedules 6 days out", () => {
  const r = computeNextReview({ easeFactor: 2.5, intervalDays: 1, repetitions: 1 }, 5, TODAY);
  assert.equal(r.repetitions, 2);
  assert.equal(r.intervalDays, 6);
});

test("third+ pass grows the interval by the ease factor", () => {
  // grade 4 leaves EF at 2.5, so interval = round(6 * 2.5) = 15
  const r = computeNextReview({ easeFactor: 2.5, intervalDays: 6, repetitions: 2 }, 4, TODAY);
  assert.equal(r.repetitions, 3);
  assert.equal(r.intervalDays, 15);
  assert.equal(r.easeFactor, 2.5);
});

test("a lapse (grade < 3) resets repetitions and interval, keeps ease factor", () => {
  const r = computeNextReview({ easeFactor: 2.36, intervalDays: 40, repetitions: 6 }, 2, TODAY);
  assert.equal(r.repetitions, 0);
  assert.equal(r.intervalDays, 1);
  assert.equal(r.easeFactor, 2.36, "ease factor unchanged on a lapse");
});

test("ease factor is floored at 1.3 under repeated low-but-passing grades", () => {
  let state = { easeFactor: 1.5, intervalDays: 6, repetitions: 3 };
  for (let i = 0; i < 20; i++) {
    // grade 3 lowers EF by 0.14 each pass
    const r = computeNextReview(state, 3, TODAY);
    assert.ok(r.easeFactor >= 1.3, `ease factor ${r.easeFactor} dropped below 1.3`);
    state = { easeFactor: r.easeFactor, intervalDays: r.intervalDays, repetitions: r.repetitions };
  }
  assert.equal(state.easeFactor, 1.3);
});
