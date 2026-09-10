import { useEffect, useState } from 'react'
import { fetchHistory } from '../api'
import type { HistoryEvent, HistoryResponse, Outcome } from '../types'
import { FAILURE_MODE_LABEL, OUTCOME_LABEL, OUTCOMES } from '../labels'
import { ProblemDetailModal, type DetailProblem } from './ProblemDetailModal'

const PAGE_SIZE = 50

type KindFilter = 'all' | 'attempt' | 'submission'
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
  const [kind, setKind] = useState<KindFilter>('all')
  const [source, setSource] = useState<SourceFilter>('')
  const [outcome, setOutcome] = useState<OutcomeFilter>('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<HistoryResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [detailFor, setDetailFor] = useState<DetailProblem | null>(null)

  useEffect(() => setPage(1), [kind, source, outcome])

  useEffect(() => {
    let cancelled = false
    fetchHistory({
      kind: kind === 'all' ? undefined : kind,
      source: source || undefined,
      outcome: outcome || undefined,
      page,
      pageSize: PAGE_SIZE,
    })
      .then((r) => !cancelled && setData(r))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      cancelled = true
    }
  }, [kind, source, outcome, page])

  const events = data?.events ?? []
  const totalPages = data?.totalPages ?? 1
  const filtered = kind !== 'all' || source !== '' || outcome !== ''

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-display text-4xl font-bold">History</h1>
      <p className="mt-1.5 text-sm text-muted">
        {data ? (
          <>
            <span className="tabular-nums text-ink">{data.total.toLocaleString()}</span> event
            {data.total === 1 ? '' : 's'}
            {filtered ? ' matching these filters' : ' · attempts you logged + solves from LeetCode'}
          </>
        ) : (
          ' '
        )}
      </p>

      <div className="mt-5 flex flex-wrap gap-6">
        <Segmented<KindFilter>
          label="Type"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'all', label: 'All' },
            { value: 'attempt', label: 'Attempts' },
            { value: 'submission', label: 'LeetCode solves' },
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
        <Segmented<OutcomeFilter>
          label="Outcome"
          value={outcome}
          onChange={setOutcome}
          options={[
            { value: '', label: 'All' },
            ...OUTCOMES.map((o) => ({ value: o as OutcomeFilter, label: OUTCOME_LABEL[o] })),
          ]}
        />
      </div>

      {error && <p className="mt-6 text-sm text-hard">Error: {error}</p>}

      <div className="mt-5 overflow-hidden rounded-xl border border-line bg-surface">
        {data && events.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-muted">
            Nothing matches these filters.
          </p>
        )}
        <ul>
          {events.map((e) => (
            <HistoryRow key={e.id} event={e} onOpenProblem={setDetailFor} />
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
  event: e,
  onOpenProblem,
}: {
  event: HistoryEvent
  onOpenProblem: (p: DetailProblem) => void
}) {
  const title = (
    <button
      type="button"
      onClick={() => onOpenProblem(e.problem)}
      className={
        'text-left hover:text-white hover:underline ' +
        (e.kind === 'submission' ? 'text-[14.5px] font-medium' : 'text-[14.5px] font-semibold')
      }
    >
      <span className="text-dim">{e.problem.lcFrontendId}.</span> {e.problem.title}
    </button>
  )

  if (e.kind === 'submission') {
    return (
      <li className="grid grid-cols-[3.5rem_1fr_auto] gap-4 border-b border-line px-4 py-3.5 last:border-0 hover:bg-surface-2">
        <span className="flex items-start gap-1.5 pt-0.5 text-[13px] tabular-nums text-muted">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#ffa116]" title="LeetCode" />
          {shortDate(e.at)}
        </span>
        <div className="min-w-0">
          {title}
          <div className="mt-0.5 text-[12.5px] text-dim">Solved on LeetCode</div>
        </div>
        <span className="h-fit rounded-full border border-line px-2.5 py-0.5 text-xs font-semibold text-muted">
          {e.statusDisplay}
        </span>
      </li>
    )
  }

  const meta: string[] = []
  if (e.failureMode) meta.push(FAILURE_MODE_LABEL[e.failureMode])
  if (e.minutes != null) meta.push(`${e.minutes} min`)
  if (e.confidence != null) meta.push(`confidence ${e.confidence}/5`)
  if (e.source === 'IMPORTED') meta.push('imported')

  return (
    <li className="grid grid-cols-[3.5rem_1fr_auto] gap-4 border-b border-line px-4 py-3.5 last:border-0 hover:bg-surface-2">
      <span className="pt-0.5 text-[13px] tabular-nums text-muted">{shortDate(e.at)}</span>
      <div className="min-w-0">
        {title}
        {meta.length > 0 && (
          <div className="mt-1 text-[12.5px] text-muted">
            {meta.map((m, i) => (
              <span key={m}>
                {i > 0 && <span className="mx-1.5 text-dim">·</span>}
                {/* failure mode is always the first item when present */}
                <span className={i === 0 && e.failureMode ? 'text-medium' : ''}>{m}</span>
              </span>
            ))}
          </div>
        )}
        {e.notes && (
          <p className="mt-1.5 border-l-2 border-line pl-2.5 text-[13px] text-muted">{e.notes}</p>
        )}
      </div>
      <span
        className={`h-fit rounded-full px-2.5 py-0.5 text-xs font-semibold ${OUTCOME_PILL[e.outcome]}`}
      >
        {OUTCOME_LABEL[e.outcome]}
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
