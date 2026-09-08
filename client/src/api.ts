/**
 * Thin wrappers around the backend API.
 *
 * Every call goes to a `/api/...` path, which Vite's dev proxy forwards to the
 * Express server (see vite.config.ts). In production you'd serve both from the
 * same origin, so the relative paths keep working.
 */

import type {
  Attempt,
  NewAttempt,
  ProblemsQuery,
  ProblemsResponse,
  TopicOption,
} from './types'

/** Turn a params object into a query string, skipping empty values. */
function toQueryString(params: Record<string, unknown>): string {
  const usable = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== '',
  )
  if (usable.length === 0) return ''
  const sp = new URLSearchParams()
  for (const [k, v] of usable) sp.set(k, String(v))
  return `?${sp.toString()}`
}

/** GET, parse JSON, throw a useful error on a non-2xx response. */
async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) {
    throw new Error(`GET ${path} failed: ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as T
}

/** POST a JSON body, parse JSON, surface the server's error message if any. */
async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const message =
      (data && typeof data === 'object' && 'error' in data && String(data.error)) ||
      `${res.status} ${res.statusText}`
    throw new Error(`POST ${path} failed: ${message}`)
  }
  return data as T
}

export function fetchProblems(query: ProblemsQuery): Promise<ProblemsResponse> {
  return getJson<ProblemsResponse>(`/api/problems${toQueryString({ ...query })}`)
}

export function fetchAttempts(problemId: number): Promise<{ attempts: Attempt[] }> {
  return getJson<{ attempts: Attempt[] }>(`/api/attempts?problemId=${problemId}`)
}

export function createAttempt(body: NewAttempt): Promise<Attempt> {
  return postJson<Attempt>('/api/attempts', body)
}

export function fetchTopics(): Promise<{ topics: TopicOption[] }> {
  return getJson<{ topics: TopicOption[] }>('/api/topics')
}
