import { useCallback, useEffect, useState } from 'react'
import { fetchRecommendations } from '../api'
import type { Recommendation, RecommendationsResponse } from '../types'
import { FAILURE_MODE_LABEL } from '../labels'
import { PredictModal } from './PredictModal'
import { ProblemDetailModal } from './ProblemDetailModal'
import { Stat } from './Stat'

const today = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

export function QueuePage() {
  const [data, setData] = useState<RecommendationsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [predictFor, setPredictFor] = useState<Recommendation['problem'] | null>(null)
  const [detailFor, setDetailFor] = useState<Recommendation['problem'] | null>(null)

  const load = useCallback(() => {
    fetchRecommendations()
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  useEffect(load, [load])

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

      {data?.mode === 'recency' && recs.length > 0 && (
        <p className="mt-4 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-muted">
          Starting from your most recent LeetCode solves. Once you log your first attempt here,
          this switches to spaced-repetition scheduling.
        </p>
      )}

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
            <button
              type="button"
              onClick={() => setDetailFor(r.problem)}
              className="-m-1 flex flex-1 flex-col items-stretch rounded-lg p-1 text-left hover:bg-surface-2"
            >
              {/* No topic tag here on purpose — it would give away the pattern
                  before you predict it. */}
              <span className="text-base font-semibold">{r.problem.title}</span>
              <span className="mt-2 flex-1 text-sm text-muted">{r.reason.join(' · ')}</span>
            </button>

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

      {detailFor && (
        <ProblemDetailModal
          problem={detailFor}
          onClose={() => setDetailFor(null)}
          onLogged={() => {
            setDetailFor(null)
            load()
          }}
        />
      )}
    </main>
  )
}
