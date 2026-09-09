import { useEffect, useState } from 'react'
import { fetchProblemDescription } from '../api'
import type { Difficulty, ProblemDescription, Topic } from '../types'
import { DifficultyBadge } from './DifficultyBadge'
import { LogAttemptModal } from './LogAttemptModal'
import { PredictModal } from './PredictModal'

/** The subset of a problem this modal needs — satisfied by the queue's
 *  recommendation.problem and by the full Problem from the list. */
export interface DetailProblem {
  id: number
  lcFrontendId: number
  slug: string
  title: string
  difficulty: Difficulty
  url: string
  topics: Topic[]
}

interface Props {
  problem: DetailProblem
  onClose: () => void
  /** An attempt was logged from here — let the parent refresh. */
  onLogged?: () => void
}

/** Problem statement view opened from a queue card: the LeetCode description
 *  plus Predict approach / Log attempt / Open on LeetCode. */
export function ProblemDetailModal({ problem, onClose, onLogged }: Props) {
  const [desc, setDesc] = useState<ProblemDescription | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [child, setChild] = useState<null | 'predict' | 'log'>(null)
  // Hidden by default so they don't spoil the "predict the approach" challenge.
  const [showTags, setShowTags] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && child === null) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, child])

  useEffect(() => {
    setDesc(null)
    setError(null)
    fetchProblemDescription(problem.slug)
      .then(setDesc)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [problem.slug])

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:p-10"
      onClick={onClose}
    >
      <div
        className="flex max-h-[calc(100vh-5rem)] w-full max-w-2xl flex-col rounded-xl border border-line bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 rounded-t-xl border-b border-line bg-surface px-5 pt-4 pb-3">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-[17px] font-semibold">
              <span className="text-dim">{problem.lcFrontendId}.</span> {problem.title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex-none rounded border border-line px-2 py-0.5 text-muted hover:text-ink"
            >
              ✕
            </button>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <DifficultyBadge difficulty={problem.difficulty} />
            {problem.topics.length > 0 &&
              (showTags ? (
                <>
                  {problem.topics.map((t) => (
                    <span
                      key={t.slug}
                      className="rounded-full border border-line px-2 py-0.5 text-[11.5px] text-muted"
                    >
                      {t.name}
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={() => setShowTags(false)}
                    className="text-[11.5px] text-dim hover:text-muted"
                  >
                    hide
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowTags(true)}
                  className="rounded-full border border-dashed border-line px-2 py-0.5 text-[11.5px] text-dim hover:text-muted"
                >
                  Reveal topic tags (spoiler)
                </button>
              ))}
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-5 py-4">
          {error && <p className="text-sm text-hard">Couldn’t load the statement: {error}</p>}
          {!error && !desc && <p className="text-sm text-muted">Loading the problem statement…</p>}
          {desc && desc.html && (
            // Trusted content from LeetCode's official API, single-user tool.
            <div className="lc-content" dangerouslySetInnerHTML={{ __html: desc.html }} />
          )}
          {desc && !desc.html && (
            <p className="text-sm text-muted">
              {desc.isPremium
                ? 'This is a LeetCode Premium problem — its statement isn’t public. Open it on LeetCode to read it.'
                : 'No statement available for this problem.'}
            </p>
          )}
        </div>

        {/* Footer actions */}
        <div className="sticky bottom-0 flex flex-wrap gap-2.5 rounded-b-xl border-t border-line bg-surface px-5 py-3.5">
          <button
            type="button"
            onClick={() => setChild('predict')}
            className="rounded-lg bg-surface-2 px-3.5 py-2 text-[13.5px] font-semibold hover:bg-line"
          >
            Predict approach
          </button>
          <button
            type="button"
            onClick={() => setChild('log')}
            className="rounded-lg bg-accent px-3.5 py-2 text-[13.5px] font-semibold text-white hover:bg-accent/90"
          >
            Log attempt
          </button>
          <span className="flex-1" />
          <a
            href={problem.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-line px-3.5 py-2 text-[13.5px] text-muted hover:text-ink"
          >
            Open on LeetCode ↗
          </a>
        </div>
      </div>

      {child === 'predict' && (
        <PredictModal
          problem={problem}
          onClose={() => setChild(null)}
          onSaved={() => setChild(null)}
        />
      )}
      {child === 'log' && (
        <LogAttemptModal
          problem={problem}
          onClose={() => setChild(null)}
          onSaved={() => {
            setChild(null)
            onLogged?.()
          }}
        />
      )}
    </div>
  )
}
