import type { Difficulty } from '../types'

const LABEL: Record<Difficulty, string> = {
  EASY: 'Easy',
  MEDIUM: 'Med.',
  HARD: 'Hard',
}

const COLOR: Record<Difficulty, string> = {
  EASY: 'text-easy',
  MEDIUM: 'text-medium',
  HARD: 'text-hard',
}

/** LeetCode-style difficulty label: abbreviated, color-coded. */
export function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  return <span className={`text-sm font-medium ${COLOR[difficulty]}`}>{LABEL[difficulty]}</span>
}
