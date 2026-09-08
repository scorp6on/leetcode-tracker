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
