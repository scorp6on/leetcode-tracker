/** Human-readable labels for the enum values the API uses. Shared so the queue,
 *  dashboard, log modal, and history screen all say the same thing. */

import type { FailureMode, Outcome } from './types'

/** Display order for the outcome segmented control. */
export const OUTCOMES: Outcome[] = ['SOLVED', 'STRUGGLED', 'FAILED']

export const OUTCOME_LABEL: Record<Outcome, string> = {
  SOLVED: 'Solved',
  STRUGGLED: 'Struggled',
  FAILED: 'Failed',
}

export const FAILURE_MODE_LABEL: Record<FailureMode, string> = {
  OFF_BY_ONE: 'Off-by-one',
  MISSED_EDGE_CASE: 'Missed edge case',
  WRONG_COMPLEXITY: 'Wrong complexity assumption',
  MISREAD_CONSTRAINTS: 'Misread constraints',
  WRONG_APPROACH: 'Wrong approach',
  SYNTAX_ERROR: 'Syntax error',
  RAN_OUT_OF_TIME: 'Ran out of time',
}

/** `{ value, label }[]` for `<select>` / chip lists, in a sensible order. */
export const FAILURE_MODES: { value: FailureMode; label: string }[] = (
  Object.keys(FAILURE_MODE_LABEL) as FailureMode[]
).map((value) => ({ value, label: FAILURE_MODE_LABEL[value] }))
