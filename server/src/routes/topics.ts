/**
 * Routes under /api/topics — the list of LeetCode topic tags, for filter menus.
 */

import { Router, type Request, type Response } from "express";
import { prisma } from "../db";

export const topicsRouter = Router();

/**
 * GET /api/topics
 *
 * Every topic, alphabetical, with how many problems carry it. Small (~175 rows)
 * and rarely changes, so it's fine to return all at once.
 */
topicsRouter.get("/", async (_req: Request, res: Response) => {
  const topics = await prisma.topic.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { problems: true } } },
  });

  res.json({
    topics: topics.map((t) => ({
      slug: t.slug,
      name: t.name,
      problemCount: t._count.problems,
    })),
  });
});
