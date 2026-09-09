import { test } from "node:test";
import assert from "node:assert/strict";

import {
  recommend,
  recommendRecent,
  DEFAULT_WEIGHTS,
  type RecCandidate,
} from "./recommendations";

const TODAY = new Date("2026-03-01T00:00:00.000Z");
const daysAgo = (n: number) => new Date(TODAY.getTime() - n * 86_400_000);
const daysAhead = (n: number) => new Date(TODAY.getTime() + n * 86_400_000);

function candidate(over: Partial<RecCandidate> & { problemId: number }): RecCandidate {
  return {
    topicSlugs: [],
    failureModes: [],
    nextReviewDate: TODAY,
    ...over,
  }
}

test("more overdue ranks higher, all else equal", () => {
  const recs = recommend({
    candidates: [
      candidate({ problemId: 1, nextReviewDate: daysAgo(1) }),
      candidate({ problemId: 2, nextReviewDate: daysAgo(6) }),
      candidate({ problemId: 3, nextReviewDate: daysAhead(3) }),
    ],
    recentFailures: [],
    homeTopicsByMode: {},
    today: TODAY,
  });
  assert.deepEqual(
    recs.map((r) => r.problemId),
    [2, 1, 3],
  );
  assert.equal(recs[2].components.dueness, 0, "not-yet-due scores 0 dueness");
});

test("dueness saturates at the 7-day horizon", () => {
  const [r] = recommend({
    candidates: [candidate({ problemId: 1, nextReviewDate: daysAgo(30) })],
    recentFailures: [],
    homeTopicsByMode: {},
    today: TODAY,
  });
  assert.equal(r.components.dueness, 1);
});

test("failureRelevance follows the recent-failure profile", () => {
  const [r] = recommend({
    candidates: [
      candidate({
        problemId: 1,
        nextReviewDate: TODAY,
        failureModes: [{ mode: "OFF_BY_ONE", count: 2 }],
      }),
    ],
    recentFailures: ["OFF_BY_ONE", "OFF_BY_ONE", "MISSED_EDGE_CASE"],
    homeTopicsByMode: {},
    today: TODAY,
  });
  assert.equal(r.components.failureRelevance, 1, "top recent mode -> relevance 1");
});

test("transfer is 1 when the topic differs from the failure mode's home turf", () => {
  const [r] = recommend({
    candidates: [
      candidate({
        problemId: 1,
        topicSlugs: ["binary-search"],
        failureModes: [{ mode: "OFF_BY_ONE", count: 1 }],
      }),
    ],
    recentFailures: ["OFF_BY_ONE"],
    homeTopicsByMode: { OFF_BY_ONE: ["arrays", "sliding-window"] },
    today: TODAY,
  });
  assert.equal(r.components.transfer, 1);
});

test("transfer is 0 when the topic IS the home turf", () => {
  const [r] = recommend({
    candidates: [
      candidate({
        problemId: 1,
        topicSlugs: ["sliding-window"],
        failureModes: [{ mode: "OFF_BY_ONE", count: 1 }],
      }),
    ],
    recentFailures: ["OFF_BY_ONE"],
    homeTopicsByMode: { OFF_BY_ONE: ["sliding-window"] },
    today: TODAY,
  });
  assert.equal(r.components.transfer, 0);
});

test("score uses the configured weights and limit", () => {
  const recs = recommend({
    candidates: [
      candidate({ problemId: 1, nextReviewDate: daysAgo(7) }),
      candidate({ problemId: 2, nextReviewDate: daysAgo(7) }),
      candidate({ problemId: 3, nextReviewDate: daysAgo(7) }),
    ],
    recentFailures: [],
    homeTopicsByMode: {},
    today: TODAY,
    limit: 2,
  });
  assert.equal(recs.length, 2);
  assert.equal(recs[0].score, DEFAULT_WEIGHTS.dueness * 1);
});

test("recommendRecent orders by most recently solved and limits", () => {
  const recs = recommendRecent(
    [
      { problemId: 1, lastSolvedAt: daysAgo(400) },
      { problemId: 2, lastSolvedAt: daysAgo(2) },
      { problemId: 3, lastSolvedAt: daysAgo(40) },
    ],
    TODAY,
    2,
  );
  assert.deepEqual(
    recs.map((r) => r.problemId),
    [2, 3],
  );
  assert.equal(recs[0].reason[0], "Solved 2 days ago");
  assert.match(recs[1].reason[0], /month/);
});

test("reason string mentions due timing and the driving failure mode", () => {
  const [r] = recommend({
    candidates: [
      candidate({
        problemId: 1,
        topicSlugs: ["binary-search"],
        nextReviewDate: daysAgo(2),
        failureModes: [{ mode: "OFF_BY_ONE", count: 3 }],
      }),
    ],
    recentFailures: ["OFF_BY_ONE", "OFF_BY_ONE"],
    homeTopicsByMode: { OFF_BY_ONE: ["arrays"] },
    today: TODAY,
  });
  assert.equal(r.reason[0], "Due 2d ago");
  assert.match(r.reason.join(" "), /off-by-one/);
});
