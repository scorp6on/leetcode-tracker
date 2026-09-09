/**
 * Pure helper for the dashboard's per-topic breakdown.
 *
 * The route runs two GROUP BY queries — one for execution (clean solves per
 * topic), one for pattern-ID accuracy (prediction hits per topic) — and this
 * merges them by slug into the rows the frontend table wants.
 */

export interface ExecutionStatRow {
  slug: string;
  name: string;
  clean: number; // SOLVED attempts on problems with this topic
  total: number; // all manual attempts on problems with this topic
}

export interface IdAccuracyStatRow {
  slug: string;
  hits: number; // resolved predictions that hit, on problems with this topic
  resolved: number; // resolved predictions on problems with this topic
}

export interface TopicBreakdownRow {
  slug: string;
  name: string;
  /** Prediction hit rate for this topic, 0-1, or null if nothing resolved. */
  idAccuracy: number | null;
  /** Clean-solve rate for this topic, 0-1, or null if no attempts. */
  executionRate: number | null;
  attempts: number;
  predictionsResolved: number;
}

/**
 * Merge the two stat sets by slug, compute rates, drop topics with too little
 * data, and sort by attempt volume.
 */
export function buildTopicBreakdown(
  execution: ExecutionStatRow[],
  idAccuracy: IdAccuracyStatRow[],
  opts: { minAttempts?: number; limit?: number } = {},
): TopicBreakdownRow[] {
  const minAttempts = opts.minAttempts ?? 1;
  const limit = opts.limit ?? 15;

  const idBySlug = new Map(idAccuracy.map((r) => [r.slug, r]));

  const rows: TopicBreakdownRow[] = execution.map((e) => {
    const id = idBySlug.get(e.slug);
    return {
      slug: e.slug,
      name: e.name,
      executionRate: e.total > 0 ? e.clean / e.total : null,
      idAccuracy: id && id.resolved > 0 ? id.hits / id.resolved : null,
      attempts: e.total,
      predictionsResolved: id?.resolved ?? 0,
    };
  });

  return rows
    .filter((r) => r.attempts >= minAttempts)
    .sort((a, b) => b.attempts - a.attempts)
    .slice(0, limit);
}
