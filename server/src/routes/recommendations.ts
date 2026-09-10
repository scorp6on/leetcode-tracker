/**
 * GET /api/recommendations — the "Today's queue" screen.
 *
 * This route does the DB assembly; the ranking math is the pure `recommend()` /
 * `recommendRecent()` in services/recommendations.ts.
 *
 * Shape of the queue:
 *   - "due" only counts problems you've actually practised HERE. An imported
 *     solve seeds a schedule dated `last-solve + 1 day`, which would otherwise
 *     read as hundreds of days overdue and flood the queue.
 *   - When the engine can't fill the queue (a fresh account, few manual
 *     attempts), the remaining slots are topped up with your most recent solves.
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { $Enums } from "@prisma/client";
import { prisma } from "../db";
import {
  recommend,
  recommendRecent,
  type RecCandidate,
  type Recommendation,
} from "../services/recommendations";

type FailureMode = $Enums.FailureMode;

export const recommendationsRouter = Router();

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(30).default(8),
});

const PROBLEM_SELECT = {
  id: true,
  lcFrontendId: true,
  slug: true,
  title: true,
  difficulty: true,
  url: true,
  topics: { select: { topic: { select: { slug: true, name: true } } } },
} as const;

/** Turn ranked (problemId + score + reason) into the response's problem cards,
 *  preserving rank order. */
async function hydrate(ranked: Recommendation[]) {
  const problems = await prisma.problem.findMany({
    where: { id: { in: ranked.map((r) => r.problemId) } },
    select: PROBLEM_SELECT,
  });
  const byId = new Map(problems.map((p) => [p.id, p]));
  return ranked.flatMap((r) => {
    const p = byId.get(r.problemId);
    if (!p) return [];
    return [
      {
        score: r.score,
        components: r.components,
        reason: r.reason,
        problem: {
          id: p.id,
          lcFrontendId: p.lcFrontendId,
          slug: p.slug,
          title: p.title,
          difficulty: p.difficulty,
          url: p.url,
          topics: p.topics.map((t) => ({ slug: t.topic.slug, name: t.topic.name })),
        },
      },
    ];
  });
}

/** Your most recently solved problems, ranked recent-first, minus any excluded. */
async function recentSolveRanked(
  now: Date,
  limit: number,
  excludeIds: Set<number> = new Set(),
): Promise<Recommendation[]> {
  if (limit <= 0) return [];
  const groups = await prisma.submission.groupBy({
    by: ["problemId"],
    where: { isAccepted: true, problemId: { not: null } },
    _max: { submittedAt: true },
  });
  const candidates = groups
    .filter(
      (g): g is typeof g & { problemId: number } =>
        g.problemId !== null && !excludeIds.has(g.problemId),
    )
    .map((g) => ({ problemId: g.problemId, lastSolvedAt: g._max.submittedAt ?? now }));
  return recommendRecent(candidates, now, limit);
}

recommendationsRouter.get("/", async (req: Request, res: Response) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid query", details: z.treeifyError(parsed.error) });
  }
  const { limit } = parsed.data;
  const now = new Date();

  // --- Fresh account: nothing practised here yet -> pure recency. ----------
  const manualCount = await prisma.attempt.count({ where: { source: "MANUAL" } });
  if (manualCount === 0) {
    const ranked = await recentSolveRanked(now, limit);
    return res.json({
      recommendations: await hydrate(ranked),
      meta: await buildMeta(now),
      mode: "recency",
    });
  }

  // --- Engine candidates: due AND practised here, or failure-mode-tagged. --
  const candidateRows = await prisma.problem.findMany({
    where: {
      reviewSchedule: { isNot: null },
      OR: [
        {
          reviewSchedule: { nextReviewDate: { lte: now } },
          attempts: { some: { source: "MANUAL" } },
        },
        { failureModes: { some: {} } },
      ],
    },
    include: {
      reviewSchedule: { select: { nextReviewDate: true } },
      topics: { select: { topic: { select: { slug: true, name: true } } } },
      failureModes: { select: { failureMode: true, count: true } },
    },
  });

  const candidates: RecCandidate[] = candidateRows
    .filter((p) => p.reviewSchedule !== null)
    .map((p) => ({
      problemId: p.id,
      topicSlugs: p.topics.map((t) => t.topic.slug),
      failureModes: p.failureModes.map((f) => ({ mode: f.failureMode, count: f.count })),
      nextReviewDate: p.reviewSchedule!.nextReviewDate,
    }));

  // Your recent failure modes (most recent first).
  const recentRows = await prisma.attempt.findMany({
    where: { failureMode: { not: null } },
    orderBy: { attemptedAt: "desc" },
    take: 20,
    select: { failureMode: true },
  });
  const recentFailures = recentRows
    .map((r) => r.failureMode)
    .filter((m): m is FailureMode => m !== null);

  // Where you usually hit each failure mode (top 2 topics per mode).
  const pfmRows = await prisma.problemFailureMode.findMany({
    select: {
      failureMode: true,
      count: true,
      problem: { select: { topics: { select: { topic: { select: { slug: true } } } } } },
    },
  });
  const tally = new Map<FailureMode, Map<string, number>>();
  for (const row of pfmRows) {
    const perTopic = tally.get(row.failureMode) ?? new Map<string, number>();
    for (const t of row.problem.topics) {
      perTopic.set(t.topic.slug, (perTopic.get(t.topic.slug) ?? 0) + row.count);
    }
    tally.set(row.failureMode, perTopic);
  }
  const homeTopicsByMode: Partial<Record<FailureMode, string[]>> = {};
  for (const [mode, perTopic] of tally) {
    homeTopicsByMode[mode] = [...perTopic.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([slug]) => slug);
  }

  const engineRanked = recommend({
    candidates,
    recentFailures,
    homeTopicsByMode,
    today: now,
    limit,
  });

  // Top up any empty slots with recent solves (not ones the engine already picked).
  const chosen = new Set(engineRanked.map((r) => r.problemId));
  const topUp = await recentSolveRanked(now, limit - engineRanked.length, chosen);

  res.json({
    recommendations: await hydrate([...engineRanked, ...topUp]),
    meta: await buildMeta(now),
    mode: engineRanked.length > 0 ? "engine" : "recency",
  });
});

/** The stat tiles under the queue: streak, solved count, top failure mode,
 *  pattern-ID accuracy. */
async function buildMeta(now: Date) {
  const [problemsSolved, topModeGroup, resolvedPredictions, hitPredictions, dayRows] =
    await Promise.all([
      prisma.problem.count({ where: { attempts: { some: { outcome: "SOLVED" } } } }),
      prisma.attempt.groupBy({
        by: ["failureMode"],
        where: { failureMode: { not: null } },
        _count: { failureMode: true },
        orderBy: { _count: { failureMode: "desc" } },
        take: 1,
      }),
      prisma.prediction.count({ where: { resolvedAt: { not: null } } }),
      prisma.prediction.count({ where: { hit: true } }),
      prisma.$queryRaw<{ day: Date }[]>`
        SELECT DISTINCT date_trunc('day', attempted_at) AS day
        FROM attempts
        ORDER BY day DESC
      `,
    ]);

  const days = new Set(dayRows.map((r) => r.day.toISOString().slice(0, 10)));
  const cursor = new Date(now);
  cursor.setUTCHours(0, 0, 0, 0);
  const iso = () => cursor.toISOString().slice(0, 10);
  // A streak stays alive if you practised today or yesterday.
  if (!days.has(iso())) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let dayStreak = 0;
  while (days.has(iso())) {
    dayStreak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return {
    dayStreak,
    problemsSolved,
    topFailureMode: topModeGroup[0]?.failureMode ?? null,
    patternAccuracy: resolvedPredictions > 0 ? hitPredictions / resolvedPredictions : null,
  };
}
