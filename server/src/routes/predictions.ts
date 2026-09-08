/**
 * Routes under /api/predictions — before-attempt pattern guesses.
 *
 * Predictions are resolved automatically when an attempt is logged (see
 * routes/attempts.ts), not through an endpoint here.
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../db";

export const predictionsRouter = Router();

// --- POST /api/predictions -------------------------------------------

const createSchema = z.object({
  problemId: z.number().int().positive(),
  // 1-10 topic slugs. Existence is checked against the DB below.
  predictedTopicSlugs: z.array(z.string().min(1)).min(1).max(10),
});

predictionsRouter.post("/", async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid prediction", details: z.treeifyError(parsed.error) });
  }
  const { problemId } = parsed.data;
  const slugs = [...new Set(parsed.data.predictedTopicSlugs)];

  const problem = await prisma.problem.findUnique({ where: { id: problemId } });
  if (!problem) {
    return res.status(404).json({ error: `No problem with id ${problemId}` });
  }

  // Every guessed slug must be a real topic.
  const known = await prisma.topic.findMany({
    where: { slug: { in: slugs } },
    select: { slug: true },
  });
  if (known.length !== slugs.length) {
    const knownSet = new Set(known.map((t) => t.slug));
    const unknown = slugs.filter((s) => !knownSet.has(s));
    return res.status(400).json({ error: `Unknown topic slug(s): ${unknown.join(", ")}` });
  }

  // One open (unresolved) prediction per problem: replace it if present.
  const open = await prisma.prediction.findFirst({
    where: { problemId, resolvedAt: null },
  });

  const prediction = open
    ? await prisma.prediction.update({
        where: { id: open.id },
        data: { predictedTopicSlugs: slugs, createdAt: new Date() },
      })
    : await prisma.prediction.create({
        data: { problemId, predictedTopicSlugs: slugs },
      });

  res.status(open ? 200 : 201).json(prediction);
});

// --- GET /api/predictions -----------------------------------------

const listSchema = z.object({
  problemId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

predictionsRouter.get("/", async (req: Request, res: Response) => {
  const parsed = listSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid query", details: z.treeifyError(parsed.error) });
  }
  const { problemId, limit } = parsed.data;

  const predictions = await prisma.prediction.findMany({
    where: problemId ? { problemId } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  res.json({ predictions });
});

// --- GET /api/predictions/accuracy ------------------------------

predictionsRouter.get("/accuracy", async (_req: Request, res: Response) => {
  const [resolved, hits] = await Promise.all([
    prisma.prediction.count({ where: { resolvedAt: { not: null } } }),
    prisma.prediction.count({ where: { hit: true } }),
  ]);

  res.json({
    resolved,
    hits,
    rate: resolved > 0 ? hits / resolved : null,
  });
});
