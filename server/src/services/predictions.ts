/**
 * Scoring a pattern prediction against a problem's real topic tags.
 *
 * Pure function — no DB, no dates. The endpoint layer loads the slugs and
 * persists the result.
 */

export interface PredictionScore {
  /** True if at least one predicted slug is a real tag. */
  hit: boolean;
  /** The predicted slugs that turned out to be real tags (order preserved). */
  matched: string[];
}

/**
 * Compare guessed topic slugs to the problem's actual topic slugs.
 *
 * "hit" is deliberately lenient — any overlap counts — because the point is
 * "did you recognise the shape of the problem", not "did you list every tag".
 * The full `matched` set is kept so the dashboard can show precision later.
 */
export function scorePrediction(predicted: string[], actual: string[]): PredictionScore {
  const actualSet = new Set(actual);
  // De-dupe predictions while preserving order.
  const seen = new Set<string>();
  const matched: string[] = [];
  for (const slug of predicted) {
    if (seen.has(slug)) continue;
    seen.add(slug);
    if (actualSet.has(slug)) matched.push(slug);
  }
  return { hit: matched.length > 0, matched };
}
