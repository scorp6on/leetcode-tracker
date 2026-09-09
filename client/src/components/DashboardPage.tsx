import { useEffect, useState } from 'react'
import { fetchDashboard } from '../api'
import type { DashboardResponse, FailureMode } from '../types'
import { Stat } from './Stat'

const FAILURE_MODE_LABEL: Record<FailureMode, string> = {
  OFF_BY_ONE: 'Off-by-one',
  MISSED_EDGE_CASE: 'Missed edge case',
  WRONG_COMPLEXITY: 'Wrong complexity',
  MISREAD_CONSTRAINTS: 'Misread constraints',
  WRONG_APPROACH: 'Wrong approach',
  SYNTAX_ERROR: 'Syntax error',
  RAN_OUT_OF_TIME: 'Ran out of time',
}

const pct = (n: number | null) => (n == null ? '—' : `${Math.round(n * 100)}%`)

export function DashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchDashboard()
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="font-display text-4xl font-bold">Your patterns</h1>

      {error && <p className="mt-6 text-sm text-hard">Error: {error}</p>}

      {data && (
        <>
          <div className="mt-6 grid grid-cols-3 gap-4">
            <Stat label="Problems attempted" value={String(data.totals.problemsAttempted)} />
            <Stat label="Clean solve rate" value={pct(data.totals.cleanSolveRate)} />
            <Stat label="Pattern ID accuracy" value={pct(data.totals.patternIdAccuracy)} />
          </div>

          <section className="mt-10">
            <h2 className="text-sm text-muted">Failure modes, last 30 days</h2>
            {data.failureModes30d.length === 0 ? (
              <p className="mt-3 text-sm text-dim">No failure modes logged in the last 30 days.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {data.failureModes30d.map((f) => (
                  <li key={f.mode} className="flex items-center gap-3 text-sm">
                    <span className="w-40 shrink-0">{FAILURE_MODE_LABEL[f.mode]}</span>
                    <span className="h-3 flex-1 rounded-sm bg-surface-2">
                      <span
                        className="block h-full rounded-sm bg-hard/60"
                        style={{ width: `${Math.round(f.pct * 100)}%` }}
                      />
                    </span>
                    <span className="w-10 shrink-0 text-right text-muted">
                      {Math.round(f.pct * 100)}%
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-10">
            <h2 className="text-sm text-muted">Pattern recognition vs. execution, by topic</h2>
            {data.byTopic.length === 0 ? (
              <p className="mt-3 text-sm text-dim">
                Not enough data yet — log a couple of attempts per topic.
              </p>
            ) : (
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-muted">
                    <th className="py-2 font-normal">Topic</th>
                    <th className="py-2 text-right font-normal">ID accuracy</th>
                    <th className="py-2 text-right font-normal">Execution rate</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byTopic.map((t) => (
                    <tr key={t.slug} className="border-b border-line/60">
                      <td className="py-2">{t.name}</td>
                      <td className="py-2 text-right">{pct(t.idAccuracy)}</td>
                      <td className="py-2 text-right">{pct(t.executionRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </main>
  )
}
