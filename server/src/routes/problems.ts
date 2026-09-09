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
import { leetcodeGraphQL } from "../leetcode/client";

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
 *   status      solved | attempted | unattempted
 *   sort        lcFrontendId (default) | title | difficulty
 *   page        1-based page number (default 1)
 *   pageSize    rows per page (default 50, max 100)
 *
 * Everything in req.query is a string (or undefined), so each value is parsed
 * and bounded before use.
 *
 * The response also carries a `summary` with your overall solved / total count
 * across the whole catalog (it ignores the filters above), for the "X / Y
 * solved" counter.
 */
problemsRouter.get("/", async (req: Request, res: Response) => {
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const topic = typeof req.query.topic === "string" ? req.query.topic.trim() : "";

  const difficultyRaw =
    typeof req.query.difficulty === "string" ? req.query.difficulty.toUpperCase() : "";
  const difficulty = DIFFICULTIES.find((d) => d === difficultyRaw);

  const status = typeof req.query.status === "string" ? req.query.status.toLowerCase() : "";

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
  if (status === "solved") {
    where.attempts = { some: { outcome: "SOLVED" } };
  } else if (status === "attempted") {
    where.attempts = { some: {} };
  } else if (status === "unattempted") {
    where.attempts = { none: {} };
  } else if (status === "due") {
    // Due for review AND you've actually practised it here — an imported solve
    // alone doesn't put a problem in the review rotation.
    where.reviewSchedule = { nextReviewDate: { lte: new Date() } };
    where.attempts = { some: { source: "MANUAL" } };
  }

  const [total, rows, solvedCount, catalogTotal] = await Promise.all([
    prisma.problem.count({ where }),
    prisma.problem.findMany({
      where,
      orderBy: { [sort]: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        topics: { include: { topic: true } },
        // Total attempts per problem, computed by the database.
        _count: { select: { attempts: true } },
        // Outcomes + source, newest first — enough to derive "solved?",
        // "last outcome", and whether it's been practised here.
        attempts: { orderBy: { attemptedAt: "desc" }, select: { outcome: true, source: true } },
        // The next review date, if this problem is on the SM-2 schedule.
        reviewSchedule: { select: { nextReviewDate: true, intervalDays: true } },
      },
    }),
    // Overall progress — deliberately unfiltered.
    prisma.problem.count({ where: { attempts: { some: { outcome: "SOLVED" } } } }),
    prisma.problem.count(),
  ]);

  res.json({
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
    summary: { solved: solvedCount, total: catalogTotal },
    // Reshape Prisma's nested rows into a flat, frontend-friendly object.
    problems: rows.map((p) => {
      const outcomes = p.attempts.map((a) => a.outcome);
      const practisedHere = p.attempts.some((a) => a.source === "MANUAL");
      const nextReviewDate = p.reviewSchedule?.nextReviewDate ?? null;
      return {
        id: p.id,
        lcFrontendId: p.lcFrontendId,
        slug: p.slug,
        title: p.title,
        difficulty: p.difficulty,
        acRate: p.acRate,
        url: p.url,
        isPremium: p.isPremium,
        topics: p.topics.map((link) => ({ slug: link.topic.slug, name: link.topic.name })),
        attemptCount: p._count.attempts,
        solved: outcomes.includes("SOLVED"),
        lastOutcome: outcomes[0] ?? null,
        nextReviewDate,
        // Only true once you've logged an attempt here — imported solves don't
        // put a problem in the review rotation.
        reviewDue: practisedHere && nextReviewDate !== null && nextReviewDate <= new Date(),
      };
    }),
  });
});

/**
 * GET /api/problems/:slug/description
 *
 * The full problem statement as HTML. Lazily cached: on a miss we fetch it from
 * LeetCode's public `question` query, store it on the row, and return it.
 * Premium problems have no public statement — `html` comes back null.
 */
interface QuestionContent {
  question: { content: string | null; isPaidOnly: boolean } | null;
}

problemsRouter.get("/:slug/description", async (req: Request, res: Response) => {
  const slug = String(req.params.slug);

  const problem = await prisma.problem.findUnique({ where: { slug } });
  if (!problem) {
    return res.status(404).json({ error: `No problem with slug "${slug}"` });
  }

  const base = {
    slug,
    title: problem.title,
    difficulty: problem.difficulty,
    url: problem.url,
  };

  if (problem.descriptionHtml) {
    return res.json({ ...base, isPremium: problem.isPremium, html: problem.descriptionHtml });
  }

  let data: QuestionContent;
  try {
    data = await leetcodeGraphQL<QuestionContent>({
      query: "query ($s: String!) { question(titleSlug: $s) { content isPaidOnly } }",
      variables: { s: slug },
    });
  } catch {
    return res
      .status(502)
      .json({ error: "Couldn't fetch the problem statement from LeetCode." });
  }

  const html = data.question?.content ?? null;
  const isPremium = problem.isPremium || Boolean(data.question?.isPaidOnly);

  if (html) {
    await prisma.problem.update({
      where: { slug },
      data: { descriptionHtml: html, descriptionSyncedAt: new Date() },
    });
  }

  res.json({ ...base, isPremium, html });
});
