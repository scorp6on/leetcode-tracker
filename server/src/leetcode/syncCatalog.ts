/**
 * Catalog sync: pull the full LeetCode problem list into our database.
 *
 * Run with:  npm run sync:catalog
 *
 * It's idempotent — every problem/topic is UPSERTed by its stable slug, so
 * running it again just refreshes existing rows and adds any new problems.
 *
 * This is a standalone script, not part of the web server. It opens the same
 * Prisma client, does its work, disconnects, and exits.
 */

import type { Difficulty } from "@prisma/client";
import { prisma } from "../db";
import { leetcodeGraphQL } from "./client";

// --- Tuning knobs ----------------------------------------------------------
const PAGE_SIZE = 50; // how many problems per GraphQL request
const DELAY_MS = 400; // pause between pages, to be polite to LeetCode

// --- The GraphQL query ---------------------------------------------------
// `questionList` is the same call LeetCode's own problem-set page makes.
// The `alias: field` bits (e.g. `total: totalNum`) just rename fields in the
// response so our TypeScript types below read nicely.
const LIST_QUERY = `
  query problemsetQuestionList(
    $categorySlug: String
    $limit: Int
    $skip: Int
    $filters: QuestionListFilterInput
  ) {
    problemsetQuestionList: questionList(
      categorySlug: $categorySlug
      limit: $limit
      skip: $skip
      filters: $filters
    ) {
      total: totalNum
      questions: data {
        frontendId: questionFrontendId
        title
        titleSlug
        difficulty
        isPaidOnly
        topicTags {
          name
          slug
        }
      }
    }
  }
`;

// Shape of the data we expect back for one question.
interface LcQuestion {
  frontendId: string; // yes, LeetCode sends this as a string
  title: string;
  titleSlug: string;
  difficulty: "Easy" | "Medium" | "Hard";
  isPaidOnly: boolean;
  topicTags: { name: string; slug: string }[];
}

interface ListResponse {
  problemsetQuestionList: {
    total: number;
    questions: LcQuestion[];
  };
}

// LeetCode's capitalised difficulty -> our Prisma enum value.
const DIFFICULTY_MAP: Record<LcQuestion["difficulty"], Difficulty> = {
  Easy: "EASY",
  Medium: "MEDIUM",
  Hard: "HARD",
};

/** Promise that resolves after `ms` milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fetch one page of the problem list, starting at offset `skip`. */
async function fetchPage(skip: number): Promise<ListResponse["problemsetQuestionList"]> {
  const data = await leetcodeGraphQL<ListResponse>({
    query: LIST_QUERY,
    variables: { categorySlug: "", skip, limit: PAGE_SIZE, filters: {} },
  });
  return data.problemsetQuestionList;
}

// Topics repeat constantly across problems (there are only ~70). Cache their
// database ids by slug so we upsert each topic once, not thousands of times.
const topicIdBySlug = new Map<string, number>();

async function getTopicId(slug: string, name: string): Promise<number> {
  const cached = topicIdBySlug.get(slug);
  if (cached !== undefined) return cached;

  const topic = await prisma.topic.upsert({
    where: { slug },
    create: { slug, name },
    update: { name },
  });
  topicIdBySlug.set(slug, topic.id);
  return topic.id;
}

/** Insert or update one problem and its topic links. */
async function upsertQuestion(q: LcQuestion): Promise<void> {
  const difficulty = DIFFICULTY_MAP[q.difficulty];
  if (!difficulty) {
    throw new Error(`Unexpected difficulty "${q.difficulty}" on ${q.titleSlug}`);
  }

  const problem = await prisma.problem.upsert({
    where: { slug: q.titleSlug },
    create: {
      lcFrontendId: Number(q.frontendId),
      slug: q.titleSlug,
      title: q.title,
      difficulty,
      url: `https://leetcode.com/problems/${q.titleSlug}/`,
      isPremium: q.isPaidOnly,
    },
    update: {
      lcFrontendId: Number(q.frontendId),
      title: q.title,
      difficulty,
      isPremium: q.isPaidOnly,
      syncedAt: new Date(),
    },
  });

  for (const tag of q.topicTags) {
    const topicId = await getTopicId(tag.slug, tag.name);
    // Ensure the join row exists. `update: {}` = "if it's already there, leave
    // it" — there are no other columns to change.
    await prisma.problemTopic.upsert({
      where: { problemId_topicId: { problemId: problem.id, topicId } },
      create: { problemId: problem.id, topicId },
      update: {},
    });
  }
}

async function main(): Promise<void> {
  const firstPage = await fetchPage(0);
  const total = firstPage.total;
  console.log(`LeetCode reports ${total} problems. Starting sync...`);

  let processed = 0;
  let page = firstPage;
  let skip = 0;

  while (true) {
    for (const q of page.questions) {
      await upsertQuestion(q);
      processed += 1;
    }
    console.log(`  synced ${processed}/${total}`);

    skip += PAGE_SIZE;
    if (skip >= total) break;

    await sleep(DELAY_MS);
    page = await fetchPage(skip);
  }

  console.log(`Done. ${processed} problems, ${topicIdBySlug.size} topics.`);
}

// Run, then always disconnect. Exit code 1 on failure so `npm run` reports it.
main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
