import { useEffect, useState } from 'react'
import { createAttempt, fetchAttempts, fetchPredictions } from '../api'
import type { Attempt, FailureMode, Outcome, Prediction, Problem } from '../types'

const OUTCOMES: Outcome[] = ['SOLVED', 'STRUGGLED', 'FAILED']
const OUTCOME_LABEL: Record<Outcome, string> = {
  SOLVED: 'Solved',
  STRUGGLED: 'Struggled',
  FAILED: 'Failed',
}

const FAILURE_MODES: { value: FailureMode; label: string }[] = [
  { value: 'OFF_BY_ONE', label: 'Off-by-one' },
  { value: 'MISSED_EDGE_CASE', label: 'Missed edge case' },
  { value: 'WRONG_COMPLEXITY', label: 'Wrong complexity assumption' },
  { value: 'MISREAD_CONSTRAINTS', label: 'Misread constraints' },
  { value: 'WRONG_APPROACH', label: 'Wrong approach' },
  { value: 'SYNTAX_ERROR', label: 'Syntax error' },
  { value: 'RAN_OUT_OF_TIME', label: 'Ran out of time' },
]
const FM_LABEL: Record<string, string> = Object.fromEntries(
  FAILURE_MODES.map((f) => [f.value, f.label]),
)

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

interface Props {
  // Needs only id + title + topics, so the queue's lighter problem object works.
  problem: Pick<Problem, 'id' | 'title' | 'topics'>
  onClose: () => void
  onSaved: () => void
}

/** The "Log attempt" modal (see mockup): prior history, then outcome, time,
 *  failure mode, confidence, notes. */
export function LogAttemptModal({ problem, onClose, onSaved }: Props) {
  const [outcome, setOutcome] = useState<Outcome>('SOLVED')
  const [minutes, setMinutes] = useState(15)
  const [failureMode, setFailureMode] = useState<FailureMode | ''>('')
  const [confidence, setConfidence] = useState(3)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [pastAttempts, setPastAttempts] = useState<Attempt[]>([])
  const [predictions, setPredictions] = useState<Prediction[]>([])

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Load this problem's history.
  useEffect(() => {
    fetchAttempts(problem.id)
      .then((r) => setPastAttempts(r.attempts))
      .catch(() => setPastAttempts([]))
    fetchPredictions(problem.id)
      .then((r) => setPredictions(r.predictions))
      .catch(() => setPredictions([]))
  }, [problem.id])

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await createAttempt({
        problemId: problem.id,
        outcome,
        minutes,
        confidence,
        failureMode: failureMode || null,
        notes: notes.trim() || null,
      })
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  const topicName = problem.topics[0]?.name ?? 'No topic'
  const openPrediction = predictions.find((p) => p.resolvedAt === null)
  const lastResolved = predictions.find((p) => p.resolvedAt !== null)
  const hasHistory = pastAttempts.length > 0 || openPrediction || lastResolved

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-line bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">Log attempt</h2>
        <p className="mt-0.5 text-sm text-muted">
          {problem.title} &middot; {topicName}
        </p>

        {/* History */}
        {hasHistory && (
          <div className="mt-4 rounded-lg border border-line bg-bg/40 p-3 text-xs">
            {openPrediction && (
              <p className="text-accent">
                Open prediction:{' '}
                {openPrediction.predictedTopicSlugs.join(', ')} — scored when you save
              </p>
            )}
            {lastResolved && (
              <p className={lastResolved.hit ? 'text-easy' : 'text-hard'}>
                Last prediction: {lastResolved.predictedTopicSlugs.join(', ')} —{' '}
                {lastResolved.hit ? 'hit' : 'missed'}
              </p>
            )}
            {pastAttempts.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-muted">
                {pastAttempts.slice(0, 4).map((a) => (
                  <li key={a.id}>
                    {shortDate(a.attemptedAt)} &middot; {OUTCOME_LABEL[a.outcome]}
                    {a.failureMode ? ` · ${FM_LABEL[a.failureMode]}` : ''}
                    {a.source === 'IMPORTED' ? ' (imported)' : ''}
                  </li>
                ))}
                {pastAttempts.length > 4 && <li>+{pastAttempts.length - 4} more</li>}
              </ul>
            )}
          </div>
        )}

        {/* Outcome — segmented control */}
        <fieldset className="mt-5">
          <legend className="text-sm text-muted">Outcome</legend>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {OUTCOMES.map((o) => {
              const active = o === outcome
              return (
                <button
                  key={o}
                  type="button"
                  onClick={() => setOutcome(o)}
                  className={
                    'rounded-lg border px-3 py-2 text-sm font-medium transition-colors ' +
                    (active
                      ? 'border-accent bg-accent-soft/40 text-accent'
                      : 'border-line text-ink hover:bg-surface-2')
                  }
                >
                  {OUTCOME_LABEL[o]}
                </button>
              )
            })}
          </div>
        </fieldset>

        {/* Time spent */}
        <div className="mt-5">
          <div className="flex items-baseline justify-between">
            <label htmlFor="minutes" className="text-sm text-muted">
              Time spent
            </label>
            <span className="text-sm font-semibold">{minutes} min</span>
          </div>
          <input
            id="minutes"
            type="range"
            min={0}
            max={120}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className="mt-2"
          />
        </div>

        {/* Failure mode */}
        <div className="mt-5">
          <label htmlFor="failureMode" className="text-sm text-muted">
            What went wrong first? (optional)
          </label>
          <select
            id="failureMode"
            value={failureMode}
            onChange={(e) => setFailureMode(e.target.value as FailureMode | '')}
            className="mt-2 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm"
          >
            <option value="">Nothing notable</option>
            {FAILURE_MODES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        {/* Confidence */}
        <div className="mt-5">
          <div className="flex items-baseline justify-between">
            <label htmlFor="confidence" className="text-sm text-muted">
              Confidence
            </label>
            <span className="text-sm font-semibold">{confidence} / 5</span>
          </div>
          <input
            id="confidence"
            type="range"
            min={1}
            max={5}
            value={confidence}
            onChange={(e) => setConfidence(Number(e.target.value))}
            className="mt-2"
          />
        </div>

        {/* Notes */}
        <div className="mt-5">
          <label htmlFor="notes" className="text-sm text-muted">
            Notes (optional)
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="What tripped you up, what to remember next time…"
            className="mt-2 w-full resize-y rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm placeholder:text-dim"
          />
        </div>

        {error && <p className="mt-4 text-sm text-hard">{error}</p>}

        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="mt-6 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save attempt'}
        </button>
      </div>
    </div>
  )
}
