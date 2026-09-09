import { useEffect, useState } from 'react'
import { fetchHistory } from '../api'
import type { HistoryAttempt, HistoryResponse, Outcome } from '../types'
import { FAILURE_MODE_LABEL, OUTCOME_LABEL, OUTCOMES } from '../labels'
import { ProblemDetailModal, type DetailProblem } from './ProblemDetailModal'

const PAGE_SIZE = 50

type SourceFilter = '' | 'MANUAL' | 'IMPORTED'
type OutcomeFilter = '' | Outcome

const OUTCOME_PILL: Record<Outcome, string> = {
  SOLVED: 'bg-easy/15 text-easy',
  STRUGGLED: 'bg-medium/15 text-medium',
  FAILED: 'bg-hard/15 text-hard',
}

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

export function HistoryPage() {
  const [outcome, setOutcome] = useState<OutcomeFilter>('')
  const [source, setSource] = useState<SourceFilter>('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<HistoryResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [detailFor, setDetailFor] = useState<DetailProblem | null>(null)

  useEffect(() => setPage(1), [outcome, source])

  useEffect(() => {
    let cancelled = false
    fetchHistory({
      outcome: outcome || undefined,
      source: source || undefined,
      page,
      pageSize: PAGE_SIZE,
    })
      .then((r) => !cancelled && setData(r))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      cancelled = true
    }
  }, [outcome, source, page])

  const rows = data?.attempts ?? []
  const totalPages = data?.totalPages ?? 1

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-display text-4xl font-bold">History</h1>
      <p className="mt-1.5 text-sm text-muted">
        {data ? (
          <>
            <span className="tabular-nums text-ink">{data.total.toLocaleString()}</span> attempt
            {data.total === 1 ? '' : 's'}
            {(outcome || source) && ' matching these filters'}
          </>
        ) : (
          ' '
        )}
      </p>

      <div className="mt-5 flex flex-wrap gap-6">
        <Segmented<OutcomeFilter>
          label="Outcome"
          value={outcome}
          onChange={setOutcome}
          options={[
            { value: '', label: 'All' },
            ...OUTCOMES.map((o) => ({ value: o as OutcomeFilter, label: OUTCOME_LABEL[o] })),
          ]}
        />
        <Segmented<SourceFilter>
          label="Source"
          value={source}
          onChange={setSource}
          options={[
            { value: '', label: 'All' },
            { value: 'MANUAL', label: 'Logged here' },
            { value: 'IMPORTED', label: 'Imported' },
          ]}
        />
      </div>

      {error && <p className="mt-6 text-sm text-hard">Error: {error}</p>}

      <div className="mt-5 overflow-hidden rounded-xl border border-line bg-surface">
        {data && rows.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-muted">
            No attempts match these filters.
          </p>
        )}
        <ul>
          {rows.map((a) => (
            <HistoryRow key={a.id} attempt={a} onOpenProblem={setDetailFor} />
          ))}
        </ul>
      </div>

      {data && totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((n) => n - 1)}
            className="rounded-lg border border-line px-3 py-1.5 hover:bg-surface disabled:opacity-40"
          >
            ← Newer
          </button>
          <span>
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((n) => n + 1)}
            className="rounded-lg border border-line px-3 py-1.5 hover:bg-surface disabled:opacity-40"
          >
            Older →
          </button>
        </div>
      )}

      {detailFor && (
        <ProblemDetailModal problem={detailFor} onClose={() => setDetailFor(null)} />
      )}
    </main>
  )
}

function HistoryRow({
  attempt: a,
  onOpenProblem,
}: {
  attempt: HistoryAttempt
  onOpenProblem: (p: DetailProblem) => void
}) {
  const meta: string[] = []
  if (a.failureMode) meta.push(FAILURE_MODE_LABEL[a.failureMode])
  if (a.minutes != null) meta.push(`${a.minutes} min`)
  if (a.confidence != null) meta.push(`confidence ${a.confidence}/5`)
  if (a.source === 'IMPORTED') meta.push('imported')

  return (
    <li className="grid grid-cols-[3.5rem_1fr_auto] gap-4 border-b border-line px-4 py-3.5 last:border-0 hover:bg-surface-2">
      <span className="pt-0.5 text-[13px] tabular-nums text-muted">{shortDate(a.attemptedAt)}</span>
      <div className="min-w-0">
        <button
          type="button"
          onClick={() => onOpenProblem({ id: a.problemId, ...a.problem })}
          className="text-left text-[14.5px] font-semibold hover:text-white hover:underline"
        >
          <span className="text-dim">{a.problem.lcFrontendId}.</span> {a.problem.title}
        </button>
        {meta.length > 0 && (
          <div className="mt-1 text-[12.5px] text-muted">
            {meta.map((m, i) => (
              <span key={m}>
                {i > 0 && <span className="mx-1.5 text-dim">·</span>}
                {/* failure mode is always the first item when present */}
                <span className={i === 0 && a.failureMode ? 'text-medium' : ''}>{m}</span>
              </span>
            ))}
          </div>
        )}
        {a.notes && (
          <p className="mt-1.5 border-l-2 border-line pl-2.5 text-[13px] text-muted">{a.notes}</p>
        )}
      </div>
      <span
        className={`h-fit rounded-full px-2.5 py-0.5 text-xs font-semibold ${OUTCOME_PILL[a.outcome]}`}
      >
        {OUTCOME_LABEL[a.outcome]}
      </span>
    </li>
  )
}

function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] tracking-wider text-dim uppercase">{label}</span>
      <div className="flex gap-1.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={
              'rounded-lg border px-3 py-1.5 text-[13px] ' +
              (value === o.value
                ? 'border-accent bg-accent-soft text-ink'
                : 'border-line bg-surface text-muted hover:text-ink')
            }
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
