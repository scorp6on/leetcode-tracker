/**
 * DB bridge for prediction scoring: find a problem's open prediction and settle
 * it against the real topic tags. Called when an attempt is logged.
 *
 * (Pure scoring lives in predictions.ts; this is the part that touches the DB,
 * mirroring the sm2.ts / scheduling.ts split.)
 */

import { prisma } from "../db";
import { scorePrediction } from "./predictions";

/**
 * If the problem has an unresolved prediction, score it against the problem's
 * current topic tags and mark it resolved. No-op if there's no open prediction.
 */
export async function resolveOpenPrediction(
  problemId: number,
  when: Date = new Date(),
): Promise<void> {
  const open = await prisma.prediction.findFirst({
    where: { problemId, resolvedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!open) return;

  const links = await prisma.problemTopic.findMany({
    where: { problemId },
    include: { topic: { select: { slug: true } } },
  });
  const actualSlugs = links.map((link) => link.topic.slug);

  const { hit, matched } = scorePrediction(open.predictedTopicSlugs, actualSlugs);

  await prisma.prediction.update({
    where: { id: open.id },
    data: { resolvedAt: when, hit, matchedTopicSlugs: matched },
  });
}
