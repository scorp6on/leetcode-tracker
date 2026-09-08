import type { Difficulty, TopicOption } from '../types'

export interface Filters {
  topic: string
  difficulty: Difficulty | ''
  status: '' | 'solved' | 'attempted' | 'unattempted' | 'due'
}

export const EMPTY_FILTERS: Filters = { topic: '', difficulty: '', status: '' }

const STATUS_OPTIONS: { value: Filters['status']; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'solved', label: 'Solved' },
  { value: 'attempted', label: 'Attempted' },
  { value: 'unattempted', label: 'Not attempted' },
  { value: 'due', label: 'Due for review' },
]

interface Props {
  draft: Filters
  topics: TopicOption[]
  onChange: (next: Filters) => void
  onApply: () => void
  onClear: () => void
}

const selectClass =
  'mt-1 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm'

/** The expandable filter row from the mockup: Topic / Difficulty / Status. */
export function FilterPanel({ draft, topics, onChange, onApply, onClear }: Props) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block text-sm text-muted">
          Topic
          <select
            className={selectClass}
            value={draft.topic}
            onChange={(e) => onChange({ ...draft, topic: e.target.value })}
          >
            <option value="">All topics</option>
            {topics.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.name} ({t.problemCount})
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm text-muted">
          Difficulty
          <select
            className={selectClass}
            value={draft.difficulty}
            onChange={(e) =>
              onChange({ ...draft, difficulty: e.target.value as Difficulty | '' })
            }
          >
            <option value="">All difficulty</option>
            <option value="EASY">Easy</option>
            <option value="MEDIUM">Medium</option>
            <option value="HARD">Hard</option>
          </select>
        </label>

        <label className="block text-sm text-muted">
          Status
          <select
            className={selectClass}
            value={draft.status}
            onChange={(e) =>
              onChange({ ...draft, status: e.target.value as Filters['status'] })
            }
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClear}
          className="rounded-lg border border-line px-4 py-2 text-sm hover:bg-surface-2"
        >
          Clear filters
        </button>
        <button
          type="button"
          onClick={onApply}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90"
        >
          Apply
        </button>
      </div>
    </div>
  )
}
