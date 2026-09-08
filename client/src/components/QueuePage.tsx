import { useEffect, useState } from 'react'
import { fetchRecommendations } from '../api'
import type { FailureMode, Recommendation, RecommendationsResponse } from '../types'
import { PredictModal } from './PredictModal'

const FAILURE_MODE_LABEL: Record<FailureMode, string> = {
  OFF_BY_ONE: 'Off-by-one',
  MISSED_EDGE_CASE: 'Missed edge case',
  WRONG_COMPLEXITY: 'Wrong complexity',
  MISREAD_CONSTRAINTS: 'Misread constraints',
  WRONG_APPROACH: 'Wrong approach',
  SYNTAX_ERROR: 'Syntax error',
  RAN_OUT_OF_TIME: 'Ran out of time',
}

const today = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

export function QueuePage() {
  const [data, setData] = useState<RecommendationsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [predictFor, setPredictFor] = useState<Recommendation['problem'] | null>(null)

  useEffect(() => {
    fetchRecommendations()
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  const recs = data?.recommendations ?? []
  const meta = data?.meta

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-4xl font-bold">Today&rsquo;s queue</h1>
          <p className="mt-1 text-sm text-muted">
            {recs.length} problem{recs.length === 1 ? '' : 's'} recommended &middot; {today}
          </p>
        </div>
        {meta && (
          <div className="text-right">
            <div className="font-display text-3xl font-bold">{meta.dayStreak}</div>
            <div className="text-xs text-muted">day streak</div>
          </div>
        )}
      </div>

      {error && <p className="mt-6 text-sm text-hard">Error: {error}</p>}

      {data && recs.length === 0 && (
        <p className="mt-8 text-sm text-muted">
          Nothing queued yet. Log a few attempts (especially ones that didn&rsquo;t go cleanly)
          and the queue fills in.
        </p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {recs.map((r) => (
          <article
            key={r.problem.id}
            className="flex flex-col rounded-xl border border-line bg-surface p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-base font-semibold">{r.problem.title}</h2>
              {r.problem.topics[0] && (
                <span className="shrink-0 rounded-full bg-accent-soft/40 px-2.5 py-0.5 text-xs text-accent">
                  {r.problem.topics[0].name}
                </span>
              )}
            </div>

            <p className="mt-2 flex-1 text-sm text-muted">{r.reason.join(' · ')}</p>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setPredictFor(r.problem)}
                className="rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium hover:bg-line"
              >
                Predict approach
              </button>
              <a
                href={r.problem.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-line px-3 py-2 text-sm text-muted hover:text-ink"
              >
                Open on LeetCode &#8599;
              </a>
            </div>
          </article>
        ))}
      </div>

      {meta && (
        <div className="mt-10 grid grid-cols-3 gap-4 border-t border-line pt-6">
          <Stat
            label="Top failure mode"
            value={meta.topFailureMode ? FAILURE_MODE_LABEL[meta.topFailureMode] : '—'}
          />
          <Stat
            label="Pattern ID accuracy"
            value={meta.patternAccuracy == null ? '—' : `${Math.round(meta.patternAccuracy * 100)}%`}
          />
          <Stat label="Problems solved" value={String(meta.problemsSolved)} />
        </div>
      )}

      {predictFor && (
        <PredictModal
          problem={predictFor}
          onClose={() => setPredictFor(null)}
          onSaved={() => setPredictFor(null)}
        />
      )}
    </main>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-1 font-display text-2xl font-semibold">{value}</div>
    </div>
  )
}
