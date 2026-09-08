import { useEffect, useState } from 'react'
import { createPrediction, fetchPredictions } from '../api'
import type { Prediction, Problem } from '../types'

/** Common LeetCode patterns to guess from. Values are real topic slugs, which
 *  the server validates. */
const PATTERNS: { slug: string; label: string }[] = [
  { slug: 'array', label: 'Array' },
  { slug: 'string', label: 'String' },
  { slug: 'hash-table', label: 'Hash table' },
  { slug: 'two-pointers', label: 'Two pointers' },
  { slug: 'sliding-window', label: 'Sliding window' },
  { slug: 'binary-search', label: 'Binary search' },
  { slug: 'sorting', label: 'Sorting' },
  { slug: 'stack', label: 'Stack' },
  { slug: 'monotonic-stack', label: 'Monotonic stack' },
  { slug: 'heap-priority-queue', label: 'Heap' },
  { slug: 'linked-list', label: 'Linked list' },
  { slug: 'tree', label: 'Tree' },
  { slug: 'depth-first-search', label: 'DFS' },
  { slug: 'breadth-first-search', label: 'BFS' },
  { slug: 'graph', label: 'Graph' },
  { slug: 'union-find', label: 'Union-find' },
  { slug: 'dynamic-programming', label: 'DP' },
  { slug: 'greedy', label: 'Greedy' },
  { slug: 'backtracking', label: 'Backtracking' },
  { slug: 'bit-manipulation', label: 'Bit manipulation' },
  { slug: 'math', label: 'Math' },
  { slug: 'prefix-sum', label: 'Prefix sum' },
]

interface Props {
  // Only needs an id + title, so both the problem list and the queue can open it.
  problem: Pick<Problem, 'id' | 'title'>
  onClose: () => void
  onSaved: () => void
}

/** "Predict approach" — pick the pattern(s) you think the problem needs, before
 *  attempting. Scored automatically once you log an attempt. */
export function PredictModal({ problem, onClose, onSaved }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [priorOpen, setPriorOpen] = useState<Prediction | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // If there's an unresolved prediction already, pre-select it.
  useEffect(() => {
    fetchPredictions(problem.id)
      .then((r) => {
        const open = r.predictions.find((p) => p.resolvedAt === null)
        if (open) {
          setPriorOpen(open)
          setSelected(new Set(open.predictedTopicSlugs))
        }
      })
      .catch(() => {})
  }, [problem.id])

  function toggle(slug: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await createPrediction({
        problemId: problem.id,
        predictedTopicSlugs: [...selected],
      })
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-line bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">Predict approach</h2>
        <p className="mt-0.5 text-sm text-muted">
          {problem.title} &middot; which pattern(s) does this need?
        </p>

        {priorOpen && (
          <p className="mt-2 text-xs text-accent">
            Updating your existing guess. It's scored when you log an attempt.
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {PATTERNS.map((p) => {
            const on = selected.has(p.slug)
            return (
              <button
                key={p.slug}
                type="button"
                onClick={() => toggle(p.slug)}
                className={
                  'rounded-full border px-3 py-1 text-sm transition-colors ' +
                  (on
                    ? 'border-accent bg-accent-soft/40 text-accent'
                    : 'border-line text-ink hover:bg-surface-2')
                }
              >
                {p.label}
              </button>
            )
          })}
        </div>

        {error && <p className="mt-4 text-sm text-hard">{error}</p>}

        <button
          type="button"
          onClick={save}
          disabled={saving || selected.size === 0}
          className="mt-6 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-60"
        >
          {saving ? 'Saving…' : `Save prediction${selected.size ? ` (${selected.size})` : ''}`}
        </button>
      </div>
    </div>
  )
}
