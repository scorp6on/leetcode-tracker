/**
 * Thin wrappers around the backend API.
 *
 * Every call goes to a `/api/...` path, which Vite's dev proxy forwards to the
 * Express server (see vite.config.ts). In production you'd serve both from the
 * same origin, so the relative paths keep working.
 */

import type {
  Attempt,
  DashboardResponse,
  NewAttempt,
  NewPrediction,
  Prediction,
  PredictionAccuracy,
  LeetCodeSyncResult,
  ProblemsQuery,
  ProblemsResponse,
  RecommendationsResponse,
  SettingsResponse,
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

/**
 * PUT/DELETE with an optional JSON body. Throws the server's `error` message
 * verbatim (no wrapper prefix) so it can be shown to the user directly.
 */
async function sendJson<T>(method: 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const message =
      (data && typeof data === 'object' && 'error' in data && String(data.error)) ||
      `${res.status} ${res.statusText}`
    throw new Error(message)
  }
  return data as T
}

export function fetchProblems(query: ProblemsQuery): Promise<ProblemsResponse> {
  return getJson<ProblemsResponse>(`/api/problems${toQueryString({ ...query })}`)
}

// --- Settings / LeetCode connection ---------------------------------

export function fetchSettings(): Promise<SettingsResponse> {
  return getJson<SettingsResponse>('/api/settings')
}

export function connectLeetCode(session: string, csrf: string): Promise<{ connected: true; username: string }> {
  return sendJson('PUT', '/api/settings/leetcode', { session, csrf })
}

export function disconnectLeetCode(): Promise<{ connected: boolean }> {
  return sendJson('DELETE', '/api/settings/leetcode')
}

export function syncLeetCode(): Promise<LeetCodeSyncResult> {
  return postJson<LeetCodeSyncResult>('/api/settings/leetcode/sync', {})
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

export function fetchPredictions(problemId: number): Promise<{ predictions: Prediction[] }> {
  return getJson<{ predictions: Prediction[] }>(`/api/predictions?problemId=${problemId}`)
}

export function createPrediction(body: NewPrediction): Promise<Prediction> {
  return postJson<Prediction>('/api/predictions', body)
}

export function fetchPredictionAccuracy(): Promise<PredictionAccuracy> {
  return getJson<PredictionAccuracy>('/api/predictions/accuracy')
}

export function fetchRecommendations(): Promise<RecommendationsResponse> {
  return getJson<RecommendationsResponse>('/api/recommendations')
}

export function fetchDashboard(): Promise<DashboardResponse> {
  return getJson<DashboardResponse>('/api/dashboard')
}
