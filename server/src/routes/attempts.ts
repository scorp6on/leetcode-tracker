/**
 * Routes under /api/attempts — logging and reading practice attempts.
 *
 * Request bodies are validated with zod. The pattern in each handler:
 *   1. `schema.safeParse(input)` -> a tagged result
 *   2. if `!success`, return 400 with the structured error
 *   3. otherwise `result.data` is fully typed and safe to use
 */

import { Router, type Request, type Response } from "express";
import { $Enums } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db";
import { applyAttemptToSchedule } from "../services/scheduling";
import { resolveOpenPrediction } from "../services/predictionResolution";

export const attemptsRouter = Router();

// --- POST /api/attempts -------------------------------------------------

const createAttemptSchema = z.object({
  problemId: z.number().int().positive(),
  outcome: z.enum($Enums.Outcome),
  // 0-600 minutes is a generous bound that still rejects nonsense.
  minutes: z.number().int().min(0).max(600),
  confidence: z.number().int().min(1).max(5),
  // Optional on any outcome — you might note "almost made an off-by-one" even
  // on a clean solve. `.nullish()` = the key may be omitted, or explicitly null.
  failureMode: z.enum($Enums.FailureMode).nullish(),
  notes: z.string().trim().max(2000).nullish(),
});

attemptsRouter.post("/", async (req: Request, res: Response) => {
  const parsed = createAttemptSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid attempt",
      details: z.treeifyError(parsed.error),
    });
  }
  const body = parsed.data;

  // zod checked the shape; the database checks that the problem is real.
  const problem = await prisma.problem.findUnique({ where: { id: body.problemId } });
  if (!problem) {
    return res.status(404).json({ error: `No problem with id ${body.problemId}` });
  }

  const attempt = await prisma.attempt.create({
    data: {
      problemId: body.problemId,
      source: "MANUAL",
      outcome: body.outcome,
      minutes: body.minutes,
      confidence: body.confidence,
      failureMode: body.failureMode ?? null,
      notes: body.notes ?? null,
    },
  });

  // Logging an attempt advances (or starts) the problem's review schedule,
  // and settles any open pattern prediction for the problem.
  await applyAttemptToSchedule(
    attempt.problemId,
    attempt.outcome,
    attempt.confidence,
    attempt.attemptedAt,
  );
  await resolveOpenPrediction(attempt.problemId, attempt.attemptedAt);

  // Lazily grow this problem's failure-mode tags — the recommendation engine
  // reads them. Only manual attempts carry a failure mode.
  if (attempt.failureMode) {
    await prisma.problemFailureMode.upsert({
      where: {
        problemId_failureMode: {
          problemId: attempt.problemId,
          failureMode: attempt.failureMode,
        },
      },
      create: {
        problemId: attempt.problemId,
        failureMode: attempt.failureMode,
        count: 1,
        lastSeenAt: attempt.attemptedAt,
      },
      update: { count: { increment: 1 }, lastSeenAt: attempt.attemptedAt },
    });
  }

  res.status(201).json(attempt);
});

// --- GET /api/attempts ------------------------------------------------
//
// Callers: the log / detail modals pass `problemId` for a problem's recent few;
// the History screen pages through everything with filters. The response always
// carries `total` / `totalPages` for a pager.

const listAttemptsSchema = z.object({
  // query-string values arrive as strings; `z.coerce` converts before checking.
  problemId: z.coerce.number().int().positive().optional(),
  outcome: z.enum($Enums.Outcome).optional(),
  source: z.enum($Enums.AttemptSource).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

attemptsRouter.get("/", async (req: Request, res: Response) => {
  const parsed = listAttemptsSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid query", details: z.treeifyError(parsed.error) });
  }
  const { problemId, outcome, source, page, pageSize } = parsed.data;

  const where = {
    ...(problemId ? { problemId } : {}),
    ...(outcome ? { outcome } : {}),
    ...(source ? { source } : {}),
  };

  const [total, attempts] = await Promise.all([
    prisma.attempt.count({ where }),
    prisma.attempt.findMany({
      where,
      orderBy: { attemptedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        problem: {
          select: {
            lcFrontendId: true,
            title: true,
            slug: true,
            difficulty: true,
            url: true,
            topics: { select: { topic: { select: { slug: true, name: true } } } },
          },
        },
      },
    }),
  ]);

  res.json({
    attempts: attempts.map((a) => ({
      ...a,
      problem: {
        lcFrontendId: a.problem.lcFrontendId,
        title: a.problem.title,
        slug: a.problem.slug,
        difficulty: a.problem.difficulty,
        url: a.problem.url,
        topics: a.problem.topics.map((t) => ({ slug: t.topic.slug, name: t.topic.name })),
      },
    })),
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  });
});
