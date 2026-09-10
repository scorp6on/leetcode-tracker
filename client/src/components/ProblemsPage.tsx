import { useEffect, useMemo, useState } from 'react'
import { fetchProblems, fetchTopics } from '../api'
import type { Problem, ProblemsQuery, ProblemsResponse, TopicOption } from '../types'
import { DifficultyBadge } from './DifficultyBadge'
import { EMPTY_FILTERS, FilterPanel, type Filters } from './FilterPanel'
import { PredictModal } from './PredictModal'
import { ProblemDetailModal } from './ProblemDetailModal'

const PAGE_SIZE = 50

export function ProblemsPage() {
  // Search is live; the panel filters are staged in `draft` and copied to
  // `applied` on "Apply".
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS)
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS)
  const [page, setPage] = useState(1)

  const [showFilters, setShowFilters] = useState(false)
  const [topics, setTopics] = useState<TopicOption[]>([])
  const [data, setData] = useState<ProblemsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [detailTarget, setDetailTarget] = useState<Problem | null>(null)
  const [predictTarget, setPredictTarget] = useState<Problem | null>(null)

  // Topics list — fetched once.
  useEffect(() => {
    fetchTopics()
      .then((r) => setTopics(r.topics))
      .catch(() => setTopics([]))
  }, [])

  // Debounce the search box so we don't fetch on every keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(id)
  }, [search])

  // Reset to page 1 whenever the query changes.
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, applied])

  const query = useMemo<ProblemsQuery>(
    () => ({
      search: debouncedSearch || undefined,
      topic: applied.topic || undefined,
      difficulty: applied.difficulty || undefined,
      status: applied.status || undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    [debouncedSearch, applied, page],
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchProblems(query)
      .then((r) => {
        if (!cancelled) setData(r)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [query])

  function reloadCurrentPage() {
    // Re-run the effect by producing a new query object reference.
    setApplied((f) => ({ ...f }))
  }

  const summary = data?.summary
  const totalPages = data?.totalPages ?? 1

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="font-display text-3xl font-bold">Problems</h1>

      {/* Toolbar */}
      <div className="mt-5 flex items-center gap-3">
        <div className="relative flex-1">
          <svg
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-dim"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.45 4.39l3.08 3.08a1 1 0 01-1.42 1.42l-3.08-3.08A7 7 0 012 9z"
              clipRule="evenodd"
            />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search questions"
            className="w-full rounded-lg border border-line bg-surface py-2.5 pr-3 pl-9 text-sm placeholder:text-dim"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          className={
            'rounded-lg border px-3 py-2.5 text-sm ' +
            (showFilters ? 'border-accent text-accent' : 'border-line text-muted hover:bg-surface')
          }
        >
          Filters
        </button>
        <span className="shrink-0 text-sm text-muted">
          {summary ? `${summary.solved} / ${summary.total} solved` : ' '}
        </span>
      </div>

      {showFilters && (
        <div className="mt-3">
          <FilterPanel
            draft={draft}
            topics={topics}
            onChange={setDraft}
            onApply={() => setApplied(draft)}
            onClear={() => {
              setDraft(EMPTY_FILTERS)
              setApplied(EMPTY_FILTERS)
            }}
          />
        </div>
      )}

      {/* List */}
      <div className="mt-5 overflow-hidden rounded-xl border border-line bg-surface">
        {error && <p className="px-4 py-6 text-sm text-hard">Error: {error}</p>}
        {!error && data && data.problems.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted">No problems match these filters.</p>
        )}
        <ul className={loading ? 'opacity-50 transition-opacity' : 'transition-opacity'}>
          {data?.problems.map((p) => (
            <li key={p.id} className="border-b border-line last:border-0">
              <div className="group flex items-center gap-4 px-4 py-3 hover:bg-surface-2">
                <span className="w-6 shrink-0 text-center text-sm text-easy">
                  {p.solved ? '✓' : ''}
                </span>
                <button
                  type="button"
                  onClick={() => setDetailTarget(p)}
                  className="flex-1 text-left text-sm"
                >
                  <span className="text-dim">{p.lcFrontendId}.</span> {p.title}
                  {p.isPremium && <span className="ml-2 text-xs text-medium">Premium</span>}
                  {p.reviewDue && (
                    <span className="ml-2 rounded bg-medium/15 px-1.5 py-0.5 text-xs text-medium">
                      Due
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setPredictTarget(p)}
                  className="shrink-0 rounded border border-line px-2 py-1 text-xs text-muted opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-ink"
                >
                  Predict
                </button>
                <a
                  href={p.url}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 rounded border border-line px-2 py-1 text-xs text-muted opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-ink"
                >
                  LeetCode ↗
                </a>
                <span className="w-14 shrink-0 text-right text-sm text-dim">
                  {p.acRate != null ? `${p.acRate.toFixed(1)}%` : '—'}
                </span>
                <span className="w-12 shrink-0 text-right">
                  <DifficultyBadge difficulty={p.difficulty} />
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Pagination */}
      {data && totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((n) => n - 1)}
            className="rounded-lg border border-line px-3 py-1.5 hover:bg-surface disabled:opacity-40"
          >
            Previous
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
            Next
          </button>
        </div>
      )}

      {detailTarget && (
        <ProblemDetailModal
          problem={detailTarget}
          onClose={() => setDetailTarget(null)}
          onLogged={reloadCurrentPage}
        />
      )}

      {predictTarget && (
        <PredictModal
          problem={predictTarget}
          onClose={() => setPredictTarget(null)}
          onSaved={() => setPredictTarget(null)}
        />
      )}
    </main>
  )
}
