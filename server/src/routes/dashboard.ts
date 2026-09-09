/**
 * GET /api/dashboard — the "Your patterns" screen.
 *
 * Read-only aggregation. The per-topic merge is the pure `buildTopicBreakdown`;
 * everything else is a query.
 */

import { Router, type Request, type Response } from "express";
import type { $Enums } from "@prisma/client";
import { prisma } from "../db";
import {
  buildTopicBreakdown,
  type ExecutionStatRow,
  type IdAccuracyStatRow,
} from "../services/dashboard";

type FailureMode = $Enums.FailureMode;

export const dashboardRouter = Router();

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

dashboardRouter.get("/", async (_req: Request, res: Response) => {
  const since = new Date(Date.now() - THIRTY_DAYS_MS);

  const [
    problemsAttempted,
    manualByOutcome,
    predictionsResolved,
    predictionHits,
    failureGroups,
    executionRows,
    idAccuracyRows,
  ] = await Promise.all([
    prisma.problem.count({ where: { attempts: { some: {} } } }),
    // Clean-solve rate is about your practice here, so manual attempts only.
    prisma.attempt.groupBy({ by: ["outcome"], where: { source: "MANUAL" }, _count: true }),
    prisma.prediction.count({ where: { resolvedAt: { not: null } } }),
    prisma.prediction.count({ where: { hit: true } }),
    prisma.attempt.groupBy({
      by: ["failureMode"],
      where: { failureMode: { not: null }, attemptedAt: { gte: since } },
      _count: true,
    }),
    prisma.$queryRaw<ExecutionStatRow[]>`
      SELECT t.slug, t.name,
             count(*) FILTER (WHERE a.outcome = 'SOLVED')::int AS clean,
             count(*)::int AS total
      FROM attempts a
      JOIN problem_topics pt ON pt.problem_id = a.problem_id
      JOIN topics t ON t.id = pt.topic_id
      WHERE a.source = 'MANUAL'
      GROUP BY t.slug, t.name
    `,
    prisma.$queryRaw<IdAccuracyStatRow[]>`
      SELECT t.slug,
             count(*) FILTER (WHERE p.hit)::int AS hits,
             count(*)::int AS resolved
      FROM predictions p
      JOIN problem_topics pt ON pt.problem_id = p.problem_id
      JOIN topics t ON t.id = pt.topic_id
      WHERE p.resolved_at IS NOT NULL
      GROUP BY t.slug
    `,
  ]);

  const manualTotal = manualByOutcome.reduce((sum, g) => sum + g._count, 0);
  const manualClean = manualByOutcome.find((g) => g.outcome === "SOLVED")?._count ?? 0;

  const failureTotal = failureGroups.reduce((sum, g) => sum + g._count, 0);
  const failureModes30d = failureGroups
    .map((g) => ({
      mode: g.failureMode as FailureMode,
      count: g._count,
      pct: failureTotal > 0 ? g._count / failureTotal : 0,
    }))
    .sort((a, b) => b.count - a.count);

  res.json({
    totals: {
      problemsAttempted,
      cleanSolveRate: manualTotal > 0 ? manualClean / manualTotal : null,
      patternIdAccuracy: predictionsResolved > 0 ? predictionHits / predictionsResolved : null,
    },
    failureModes30d,
    byTopic: buildTopicBreakdown(executionRows, idAccuracyRows, { minAttempts: 2, limit: 15 }),
  });
});
