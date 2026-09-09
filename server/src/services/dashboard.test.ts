import { test } from "node:test";
import assert from "node:assert/strict";

import { buildTopicBreakdown } from "./dashboard";

test("merges execution and id-accuracy rows by slug", () => {
  const rows = buildTopicBreakdown(
    [
      { slug: "dp", name: "Dynamic Programming", clean: 6, total: 10 },
      { slug: "graph", name: "Graph", clean: 8, total: 11 },
    ],
    [
      { slug: "dp", hits: 9, resolved: 10 },
      { slug: "graph", hits: 2, resolved: 5 },
    ],
  );

  const dp = rows.find((r) => r.slug === "dp")!;
  assert.equal(dp.executionRate, 0.6);
  assert.equal(dp.idAccuracy, 0.9);
});

test("null rates when a side has no data", () => {
  const [row] = buildTopicBreakdown([{ slug: "trie", name: "Trie", clean: 0, total: 2 }], []);
  assert.equal(row.executionRate, 0);
  assert.equal(row.idAccuracy, null);
  assert.equal(row.predictionsResolved, 0);
});

test("drops topics below the attempt threshold and sorts by volume", () => {
  const rows = buildTopicBreakdown(
    [
      { slug: "a", name: "A", clean: 1, total: 1 },
      { slug: "b", name: "B", clean: 3, total: 9 },
      { slug: "c", name: "C", clean: 2, total: 4 },
    ],
    [],
    { minAttempts: 3 },
  );
  assert.deepEqual(
    rows.map((r) => r.slug),
    ["b", "c"],
  );
});
