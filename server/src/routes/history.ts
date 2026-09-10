/**
 * GET /api/history — the History screen's merged activity timeline.
 *
 * Two kinds of event, interleaved by date:
 *   - "attempt"     — a row you logged (MANUAL) or a seeded baseline (IMPORTED)
 *   - "submission"  — a raw accepted solve pulled from LeetCode
 *
 * At this scale (a few hundred rows total) it's simplest to load both fully,
 * merge, and page in memory. `GET /api/attempts` is left alone — the modals
 * still use it for a single problem's attempt list.
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { $Enums } from "@prisma/client";
import { prisma } from "../db";

export const historyRouter = Router();

const MAX_ROWS = 2000; // defensive cap per source

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  kind: z.enum(["all", "attempt", "submission"]).default("all"),
  source: z.enum($Enums.AttemptSource).optional(),
  outcome: z.enum($Enums.Outcome).optional(),
});

interface EventProblem {
  id: number;
  lcFrontendId: number;
  title: string;
  slug: string;
  difficulty: $Enums.Difficulty;
  url: string;
  topics: { slug: string; name: string }[];
}

type HistoryEvent =
  | {
      kind: "attempt";
      id: string;
      at: string;
      problem: EventProblem;
      outcome: $Enums.Outcome;
      source: $Enums.AttemptSource;
      minutes: number | null;
      confidence: number | null;
      failureMode: $Enums.FailureMode | null;
      notes: string | null;
    }
  | {
      kind: "submission";
      id: string;
      at: string;
      problem: EventProblem;
      statusDisplay: string;
    };

historyRouter.get("/", async (req: Request, res: Response) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid query", details: z.treeifyError(parsed.error) });
  }
  const { page, pageSize, kind, source, outcome } = parsed.data;

  const problemSelect = {
    select: {
      id: true,
      lcFrontendId: true,
      title: true,
      slug: true,
      difficulty: true,
      url: true,
      topics: { select: { topic: { select: { slug: true, name: true } } } },
    },
  };

  const flatProblem = (p: {
    id: number;
    lcFrontendId: number;
    title: string;
    slug: string;
    difficulty: $Enums.Difficulty;
    url: string;
    topics: { topic: { slug: string; name: string } }[];
  }): EventProblem => ({
    id: p.id,
    lcFrontendId: p.lcFrontendId,
    title: p.title,
    slug: p.slug,
    difficulty: p.difficulty,
    url: p.url,
    topics: p.topics.map((t) => t.topic),
  });

  const wantAttempts = kind !== "submission";
  // A source filter or a non-SOLVED outcome filter both exclude submissions.
  const wantSubmissions = kind !== "attempt" && !source && (!outcome || outcome === "SOLVED");

  const [attempts, submissions] = await Promise.all([
    wantAttempts
      ? prisma.attempt.findMany({
          where: {
            ...(source ? { source } : {}),
            ...(outcome ? { outcome } : {}),
          },
          orderBy: { attemptedAt: "desc" },
          take: MAX_ROWS,
          include: { problem: problemSelect },
        })
      : [],
    wantSubmissions
      ? prisma.submission.findMany({
          where: { problemId: { not: null } },
          orderBy: { submittedAt: "desc" },
          take: MAX_ROWS,
          include: { problem: problemSelect },
        })
      : [],
  ]);

  const events: HistoryEvent[] = [
    ...attempts.map(
      (a): HistoryEvent => ({
        kind: "attempt",
        id: `a${a.id}`,
        at: a.attemptedAt.toISOString(),
        problem: flatProblem(a.problem),
        outcome: a.outcome,
        source: a.source,
        minutes: a.minutes,
        confidence: a.confidence,
        failureMode: a.failureMode,
        notes: a.notes,
      }),
    ),
    ...submissions.flatMap((s): HistoryEvent[] =>
      s.problem
        ? [
            {
              kind: "submission",
              id: `s${s.lcSubmissionId}`,
              at: s.submittedAt.toISOString(),
              problem: flatProblem(s.problem),
              statusDisplay: s.statusDisplay,
            },
          ]
        : [],
    ),
  ];

  events.sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0));

  const total = events.length;
  const start = (page - 1) * pageSize;

  res.json({
    events: events.slice(start, start + pageSize),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
});
