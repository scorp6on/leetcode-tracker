/**
 * Routes under /api/problems — the browsable problem catalog.
 *
 * An Express `Router` is a mini-app: you attach routes to it here, then the
 * main app "mounts" it at a path prefix (see src/index.ts). So `router.get("/")`
 * below actually answers `GET /api/problems`.
 */

import { Router, type Request, type Response } from "express";
import type { Difficulty, Prisma } from "@prisma/client";
import { prisma } from "../db";

export const problemsRouter = Router();

// Columns we allow the client to sort by. A whitelist, because we drop the
// value straight into a Prisma `orderBy` and don't want arbitrary input there.
const SORTABLE_FIELDS = ["lcFrontendId", "title", "difficulty"] as const;
type SortField = (typeof SORTABLE_FIELDS)[number];

const DIFFICULTIES: Difficulty[] = ["EASY", "MEDIUM", "HARD"];

/**
 * GET /api/problems
 *
 * Query parameters (all optional):
 *   search      substring match on the title (case-insensitive)
 *   difficulty  EASY | MEDIUM | HARD
 *   topic       a topic slug, e.g. "dynamic-programming"
 *   sort        lcFrontendId (default) | title | difficulty
 *   page        1-based page number (default 1)
 *   pageSize    rows per page (default 50, max 100)
 *
 * Everything in req.query is a string (or undefined), so each value is parsed
 * and bounded before use.
 */
problemsRouter.get("/", async (req: Request, res: Response) => {
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const topic = typeof req.query.topic === "string" ? req.query.topic.trim() : "";

  const difficultyRaw =
    typeof req.query.difficulty === "string" ? req.query.difficulty.toUpperCase() : "";
  const difficulty = DIFFICULTIES.find((d) => d === difficultyRaw);

  const sortRaw = typeof req.query.sort === "string" ? req.query.sort : "";
  const sort: SortField = SORTABLE_FIELDS.find((f) => f === sortRaw) ?? "lcFrontendId";

  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 50));

  // Build the WHERE clause piece by piece. `Prisma.ProblemWhereInput` is the
  // generated type describing every valid filter for the Problem model.
  const where: Prisma.ProblemWhereInput = {};
  if (search) {
    where.title = { contains: search, mode: "insensitive" };
  }
  if (difficulty) {
    where.difficulty = difficulty;
  }
  if (topic) {
    // "problems that have at least one topic link whose topic has this slug"
    where.topics = { some: { topic: { slug: topic } } };
  }

  // Run the count and the page query together.
  const [total, rows] = await Promise.all([
    prisma.problem.count({ where }),
    prisma.problem.findMany({
      where,
      orderBy: { [sort]: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      // Pull the linked topics in the same query.
      include: { topics: { include: { topic: true } } },
    }),
  ]);

  res.json({
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
    // Reshape Prisma's nested rows into a flat, frontend-friendly object.
    problems: rows.map((p) => ({
      id: p.id,
      lcFrontendId: p.lcFrontendId,
      slug: p.slug,
      title: p.title,
      difficulty: p.difficulty,
      url: p.url,
      isPremium: p.isPremium,
      topics: p.topics.map((link) => ({ slug: link.topic.slug, name: link.topic.name })),
    })),
  });
});
