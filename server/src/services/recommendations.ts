/**
 * The recommendation scorer — "what should I practice next".
 *
 * Pure: it takes plain data (candidates, your recent failure history, today's
 * date) and returns a ranked list with a human reason for each. The route layer
 * does all the DB work to assemble the inputs.
 *
 * Each candidate gets a score from three parts, each in [0, 1]:
 *
 *   dueness           how overdue its spaced-repetition review is
 *   failureRelevance  does it exercise a failure mode you've hit a lot lately
 *   transfer          would it test that failure mode in a DIFFERENT topic than
 *                     where you usually hit it (real transfer, not memory)
 *
 *   score = wDue·dueness + wFail·failureRelevance + wTransfer·transfer
 */

import type { $Enums } from "@prisma/client";

type FailureMode = $Enums.FailureMode;

export interface RecWeights {
  dueness: number;
  failureRelevance: number;
  transfer: number;
}

export const DEFAULT_WEIGHTS: RecWeights = {
  dueness: 0.5,
  failureRelevance: 0.3,
  transfer: 0.2,
};

/** How many days overdue counts as "maximally due". */
const DUE_HORIZON_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** One problem eligible for recommendation (it has a review schedule). */
export interface RecCandidate {
  problemId: number;
  topicSlugs: string[];
  /** Failure modes you've hit on THIS problem, with counts. */
  failureModes: { mode: FailureMode; count: number }[];
  nextReviewDate: Date;
}

export interface RecInput {
  candidates: RecCandidate[];
  /** Your recent failure-mode occurrences, most recent first (already capped). */
  recentFailures: FailureMode[];
  /** For each failure mode, the topic slugs where you most often hit it. */
  homeTopicsByMode: Partial<Record<FailureMode, string[]>>;
  today: Date;
  weights?: RecWeights;
  limit?: number;
}

export interface Recommendation {
  problemId: number;
  score: number;
  components: { dueness: number; failureRelevance: number; transfer: number };
  /** Reason fragments, e.g. ["Due 2d ago", "targets your recent off-by-one errors"].
   *  The client joins these for display. */
  reason: string[];
}

const FAILURE_LABEL: Record<FailureMode, string> = {
  OFF_BY_ONE: "off-by-one",
  MISSED_EDGE_CASE: "edge-case",
  WRONG_COMPLEXITY: "complexity",
  MISREAD_CONSTRAINTS: "constraint-reading",
  WRONG_APPROACH: "wrong-approach",
  SYNTAX_ERROR: "syntax",
  RAN_OUT_OF_TIME: "time-pressure",
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * Build a { mode -> weight } profile from your recent failures, most-recent
 * weighted highest (exponential decay), scaled so the top mode is 1.
 */
function buildFailureProfile(recentFailures: FailureMode[]): Map<FailureMode, number> {
  const raw = new Map<FailureMode, number>();
  recentFailures.forEach((mode, i) => {
    raw.set(mode, (raw.get(mode) ?? 0) + 0.85 ** i);
  });
  const max = Math.max(0, ...raw.values());
  if (max === 0) return raw;
  const scaled = new Map<FailureMode, number>();
  for (const [mode, value] of raw) scaled.set(mode, value / max);
  return scaled;
}

function dueness(candidate: RecCandidate, today: Date): number {
  const daysOverdue = (today.getTime() - candidate.nextReviewDate.getTime()) / MS_PER_DAY;
  return clamp01(daysOverdue / DUE_HORIZON_DAYS);
}

/** The candidate's strongest match against your recent failure profile. */
function failureRelevance(candidate: RecCandidate, profile: Map<FailureMode, number>): number {
  let best = 0;
  for (const fm of candidate.failureModes) {
    best = Math.max(best, profile.get(fm.mode) ?? 0);
  }
  return best;
}

/**
 * Of the candidate's failure modes that matter to you right now, the fraction
 * whose topic is NOT where you usually hit that mode.
 */
function transfer(
  candidate: RecCandidate,
  profile: Map<FailureMode, number>,
  homeTopicsByMode: Partial<Record<FailureMode, string[]>>,
): number {
  const relevant = candidate.failureModes.filter((fm) => (profile.get(fm.mode) ?? 0) > 0);
  if (relevant.length === 0) return 0;

  const topics = new Set(candidate.topicSlugs);
  let disjoint = 0;
  for (const fm of relevant) {
    const home = homeTopicsByMode[fm.mode] ?? [];
    if (!home.some((t) => topics.has(t))) disjoint += 1;
  }
  return disjoint / relevant.length;
}

function buildReason(
  c: RecCandidate,
  today: Date,
  parts: { dueness: number; failureRelevance: number; transfer: number },
  profile: Map<FailureMode, number>,
): string[] {
  const bits: string[] = [];

  const daysOverdue = (today.getTime() - c.nextReviewDate.getTime()) / MS_PER_DAY;
  if (daysOverdue >= 1) bits.push(`Due ${Math.round(daysOverdue)}d ago`);
  else if (daysOverdue >= -1) bits.push("Due today");
  else bits.push(`Review in ${Math.abs(Math.round(daysOverdue))}d`);

  // The failure mode driving the recommendation, if any.
  const topMode = c.failureModes
    .filter((fm) => (profile.get(fm.mode) ?? 0) > 0)
    .sort((a, b) => (profile.get(b.mode) ?? 0) - (profile.get(a.mode) ?? 0))[0];

  if (topMode && parts.failureRelevance >= 0.34) {
    bits.push(`targets your recent ${FAILURE_LABEL[topMode.mode]} errors`);
  }
  if (topMode && parts.transfer >= 0.5) {
    bits.push(`transfer test - same ${FAILURE_LABEL[topMode.mode]} pattern, new topic`);
  }

  return bits;
}

export function recommend(input: RecInput): Recommendation[] {
  const weights = input.weights ?? DEFAULT_WEIGHTS;
  const limit = input.limit ?? 8;
  const profile = buildFailureProfile(input.recentFailures);

  const scored = input.candidates.map((c) => {
    const components = {
      dueness: dueness(c, input.today),
      failureRelevance: failureRelevance(c, profile),
      transfer: transfer(c, profile, input.homeTopicsByMode),
    };
    const score =
      weights.dueness * components.dueness +
      weights.failureRelevance * components.failureRelevance +
      weights.transfer * components.transfer;
    return {
      problemId: c.problemId,
      score,
      components,
      reason: buildReason(c, input.today, components, profile),
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
