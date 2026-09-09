/**
 * Shapes returned by / sent to the API.
 *
 * These are hand-kept copies of what the server produces (server/src/routes/*).
 * There is no shared package yet, so if you change a response shape on the
 * server, update it here too.
 */

export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD'

export type Outcome = 'SOLVED' | 'STRUGGLED' | 'FAILED'

export type FailureMode =
  | 'OFF_BY_ONE'
  | 'MISSED_EDGE_CASE'
  | 'WRONG_COMPLEXITY'
  | 'MISREAD_CONSTRAINTS'
  | 'WRONG_APPROACH'
  | 'SYNTAX_ERROR'
  | 'RAN_OUT_OF_TIME'

export interface Topic {
  slug: string
  name: string
}

/** One row in the problem list. */
export interface Problem {
  id: number
  lcFrontendId: number
  slug: string
  title: string
  difficulty: Difficulty
  acRate: number | null // acceptance rate %, e.g. 38.6
  url: string
  isPremium: boolean
  topics: Topic[]
  attemptCount: number
  solved: boolean
  lastOutcome: Outcome | null
  nextReviewDate: string | null // ISO date string
}

/** Response of GET /api/problems/:slug/description. */
export interface ProblemDescription {
  slug: string
  title: string
  difficulty: Difficulty
  url: string
  isPremium: boolean
  /** Problem statement as HTML. Null for premium problems. */
  html: string | null
}

/** One entry from GET /api/topics. */
export interface TopicOption {
  slug: string
  name: string
  problemCount: number
}

/** Response body of GET /api/problems. */
export interface ProblemsResponse {
  page: number
  pageSize: number
  total: number
  totalPages: number
  summary: { solved: number; total: number }
  problems: Problem[]
}

/** Query params accepted by GET /api/problems. */
export interface ProblemsQuery {
  search?: string
  difficulty?: Difficulty
  topic?: string
  status?: 'solved' | 'attempted' | 'unattempted' | 'due'
  sort?: 'lcFrontendId' | 'title' | 'difficulty'
  page?: number
  pageSize?: number
}

/** Body of POST /api/attempts. */
export interface NewAttempt {
  problemId: number
  outcome: Outcome
  minutes: number
  confidence: number // 1-5
  failureMode?: FailureMode | null
  notes?: string | null
}

/** Body of POST /api/predictions. */
export interface NewPrediction {
  problemId: number
  predictedTopicSlugs: string[]
}

/** A stored prediction, as returned by the API. */
export interface Prediction {
  id: number
  problemId: number
  predictedTopicSlugs: string[]
  createdAt: string
  resolvedAt: string | null
  hit: boolean | null
  matchedTopicSlugs: string[]
}

/** Response of GET /api/predictions/accuracy. */
export interface PredictionAccuracy {
  resolved: number
  hits: number
  rate: number | null // 0-1, or null when nothing resolved yet
}

/** One card in the "Today's queue" screen. */
export interface Recommendation {
  score: number
  components: { dueness: number; failureRelevance: number; transfer: number }
  reason: string[] // fragments, joined for display
  problem: {
    id: number
    lcFrontendId: number
    slug: string
    title: string
    difficulty: Difficulty
    url: string
    topics: Topic[]
  }
}

/** Response of GET /api/recommendations. */
export interface RecommendationsResponse {
  recommendations: Recommendation[]
  /** "recency" = first-sign-in mode (most recent solves); "engine" = normal ranking. */
  mode: 'recency' | 'engine'
  meta: {
    dayStreak: number
    problemsSolved: number
    topFailureMode: FailureMode | null
    patternAccuracy: number | null // 0-1
  }
}

/** Response of GET /api/dashboard — the "Your patterns" screen. */
export interface DashboardResponse {
  totals: {
    problemsAttempted: number
    cleanSolveRate: number | null // 0-1
    patternIdAccuracy: number | null // 0-1
  }
  failureModes30d: { mode: FailureMode; count: number; pct: number }[]
  byTopic: {
    slug: string
    name: string
    idAccuracy: number | null // 0-1
    executionRate: number | null // 0-1
    attempts: number
    predictionsResolved: number
  }[]
}

/** Response of GET /api/settings. */
export interface SettingsResponse {
  connected: boolean
  username: string | null
  avatarUrl: string | null
  submissionsSyncedAt: string | null
  /** Credentials come only from server .env — the app can't disconnect those. */
  viaEnvOnly: boolean
}

/** Result of POST /api/settings/leetcode/sync. */
export interface LeetCodeSyncResult {
  sync: { imported: number; accepted: number; distinctSolved: number; unmatched: string[] }
  seed: { solvedProblems: number; alreadySeeded: number; created: number; unmatched: number }
}

/** A stored attempt, as returned by the API. */
export interface Attempt {
  id: number
  problemId: number
  attemptedAt: string
  source: 'MANUAL' | 'IMPORTED'
  outcome: Outcome
  minutes: number | null
  confidence: number | null
  failureMode: FailureMode | null
  notes: string | null
}

/** An attempt with its problem attached — the History screen's row shape. */
export interface HistoryAttempt extends Attempt {
  problem: {
    lcFrontendId: number
    title: string
    slug: string
    difficulty: Difficulty
    url: string
    topics: Topic[]
  }
}

export interface HistoryQuery {
  outcome?: Outcome
  source?: 'MANUAL' | 'IMPORTED'
  page?: number
  pageSize?: number
}

export interface HistoryResponse {
  attempts: HistoryAttempt[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}
