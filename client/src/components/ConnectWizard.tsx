import { useState } from 'react'
import { connectLeetCode, syncLeetCode } from '../api'
import type { LeetCodeSyncResult } from '../types'

type Step = 'welcome' | 'form' | 'verifying' | 'importing' | 'done'

interface Props {
  /** User chose "Skip for now". */
  onSkip: () => void
  /** Connection (and optional import) finished — refresh app state. */
  onComplete: () => void
}

/** First-run "Connect LeetCode" flow. Mirrors the approved mock:
 *  welcome → paste session → verify → import → done. */
export function ConnectWizard({ onSkip, onComplete }: Props) {
  const [step, setStep] = useState<Step>('welcome')
  const [session, setSession] = useState('')
  const [csrf, setCsrf] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [username, setUsername] = useState('')
  const [result, setResult] = useState<LeetCodeSyncResult | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  async function connect() {
    setError(null)
    setStep('verifying')
    try {
      const r = await connectLeetCode(session.trim(), csrf.trim())
      setUsername(r.username)
      runImport()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStep('form')
    }
  }

  async function runImport() {
    setStep('importing')
    setImportError(null)
    try {
      setResult(await syncLeetCode())
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e))
    }
    setStep('done')
  }

  const stepIndex = { welcome: 0, form: 1, verifying: 2, importing: 3, done: 4 }[step]

  return (
    <div className="flex min-h-screen flex-col items-center px-5 py-12">
      <p className="w-full max-w-md text-xs tracking-widest text-dim uppercase">
        First-run setup
      </p>

      <div className="mt-4 w-full max-w-md">
        {/* progress rail */}
        <div className="mb-4 flex gap-1.5" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className={
                'h-[3px] flex-1 rounded-full ' +
                (i < stepIndex ? 'bg-accent' : i === stepIndex ? 'bg-accent/50' : 'bg-surface-2')
              }
            />
          ))}
        </div>

        <div className="rounded-xl border border-line bg-surface p-6">
          {step === 'welcome' && (
            <>
              <h1 className="font-display text-2xl font-bold">Connect LeetCode</h1>
              <p className="mt-2 text-sm text-muted">
                Pull in your submission history so the daily queue and the patterns dashboard
                reflect your real practice. You can also skip this and log every attempt by hand.
              </p>
              <div className="mt-6 flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setStep('form')}
                  className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent/90"
                >
                  Connect LeetCode
                </button>
                <button
                  type="button"
                  onClick={onSkip}
                  className="rounded-lg border border-line px-4 py-2.5 text-sm text-muted hover:bg-surface-2 hover:text-ink"
                >
                  Skip for now
                </button>
              </div>
            </>
          )}

          {step === 'form' && (
            <>
              <h1 className="font-display text-2xl font-bold">Paste your session</h1>
              <p className="mt-2 text-sm text-muted">
                LeetCode has no API keys, so the tracker reuses your logged-in browser session —
                two cookie values.
              </p>

              <div className="mt-5 grid gap-4">
                <label className="grid gap-1.5 text-xs text-muted">
                  LEETCODE_SESSION cookie
                  <textarea
                    value={session}
                    onChange={(e) => setSession(e.target.value)}
                    spellCheck={false}
                    rows={3}
                    placeholder="eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9…"
                    className="resize-y rounded-lg border border-line bg-surface-2 px-3 py-2 font-mono text-[13px] text-ink placeholder:text-dim"
                  />
                </label>
                <label className="grid gap-1.5 text-xs text-muted">
                  csrftoken cookie
                  <input
                    value={csrf}
                    onChange={(e) => setCsrf(e.target.value)}
                    spellCheck={false}
                    placeholder="9Qb2…Xa1"
                    className="rounded-lg border border-line bg-surface-2 px-3 py-2 font-mono text-[13px] text-ink placeholder:text-dim"
                  />
                </label>
              </div>

              <p className="mt-4 rounded-lg border border-line bg-bg/50 px-3 py-2.5 text-[12.5px] text-muted">
                <span className="text-ink">leetcode.com</span> → DevTools →{' '}
                <span className="text-ink">Application</span> → Cookies →{' '}
                <span className="font-mono text-ink">https://leetcode.com</span>. Copy the values of{' '}
                <span className="font-mono text-ink">LEETCODE_SESSION</span> and{' '}
                <span className="font-mono text-ink">csrftoken</span>.
              </p>
              <p className="mt-3 border-l-2 border-line pl-2.5 text-[13px] text-muted">
                Stored locally in your database, the same trust level as a password in{' '}
                <span className="font-mono">.env</span>. Sessions expire every few weeks — you'll be
                asked to reconnect when one does.
              </p>
              {error && (
                <p className="mt-3 border-l-2 border-hard pl-2.5 text-[13px] text-hard">{error}</p>
              )}

              <div className="mt-6 flex justify-between">
                <button
                  type="button"
                  onClick={() => setStep('welcome')}
                  className="rounded-lg border border-line px-4 py-2.5 text-sm text-muted hover:bg-surface-2 hover:text-ink"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={connect}
                  disabled={!session.trim() || !csrf.trim()}
                  className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-60"
                >
                  Connect
                </button>
              </div>
            </>
          )}

          {step === 'verifying' && (
            <>
              <h1 className="font-display text-2xl font-bold">Checking your session</h1>
              <p className="mt-2 text-sm text-muted">
                Making one signed request to LeetCode to confirm the cookies work.
              </p>
              <div className="mt-5 flex items-center gap-3 text-sm text-muted">
                <Spinner /> Verifying with leetcode.com…
              </div>
            </>
          )}

          {step === 'importing' && (
            <>
              <h1 className="font-display text-2xl font-bold">Importing your history</h1>
              <p className="mt-2 text-sm text-muted">
                Paging through your submissions — this can take a few minutes for a large history.
                Keep this open.
              </p>
              <div className="mt-5 flex items-center gap-3 text-sm text-muted">
                <Spinner /> Importing…
              </div>
            </>
          )}

          {step === 'done' && (
            <>
              <div className="mb-3 grid h-10 w-10 place-items-center rounded-full bg-easy/15 text-xl text-easy">
                ✓
              </div>
              <h1 className="font-display text-2xl font-bold">You're connected</h1>
              {importError ? (
                <p className="mt-2 text-sm text-muted">
                  Connected as <span className="text-ink">{username}</span>, but the import didn't
                  finish: {importError} You can retry it from the connection menu.
                </p>
              ) : (
                <>
                  <p className="mt-2 text-sm text-muted">
                    Your history is in. The queue is built from it now.
                  </p>
                  <ul className="mt-4 border-t border-line text-sm">
                    <Row label="Connected as" value={username} />
                    <Row label="Submissions imported" value={String(result?.sync.imported ?? 0)} />
                    <Row
                      label="Solved problems seeded"
                      value={String(result?.sync.distinctSolved ?? 0)}
                    />
                    <Row
                      label="Baseline reviews scheduled"
                      value={String(result?.seed.created ?? 0)}
                    />
                  </ul>
                </>
              )}
              <div className="mt-6">
                <button
                  type="button"
                  onClick={onComplete}
                  className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent/90"
                >
                  See my queue
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <span className="h-4 w-4 flex-none animate-spin rounded-full border-2 border-surface-2 border-t-accent motion-reduce:animate-none" />
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex justify-between gap-4 border-b border-line py-2.5">
      <span className="text-muted">{label}</span>
      <span className="tabular-nums text-ink">{value}</span>
    </li>
  )
}
