import { test } from "node:test";
import assert from "node:assert/strict";

import { scorePrediction } from "./predictions";

test("hit when any predicted slug is a real tag", () => {
  const r = scorePrediction(["two-pointers", "greedy"], ["array", "two-pointers"]);
  assert.equal(r.hit, true);
  assert.deepEqual(r.matched, ["two-pointers"]);
});

test("miss when no overlap", () => {
  const r = scorePrediction(["dynamic-programming"], ["array", "hash-table"]);
  assert.equal(r.hit, false);
  assert.deepEqual(r.matched, []);
});

test("all predicted slugs matched", () => {
  const r = scorePrediction(["graph", "bfs"], ["graph", "bfs", "matrix"]);
  assert.equal(r.hit, true);
  assert.deepEqual(r.matched, ["graph", "bfs"]);
});

test("duplicate predictions are collapsed", () => {
  const r = scorePrediction(["dfs", "dfs", "dfs"], ["dfs", "tree"]);
  assert.deepEqual(r.matched, ["dfs"]);
});

test("empty prediction never hits", () => {
  const r = scorePrediction([], ["array"]);
  assert.equal(r.hit, false);
  assert.deepEqual(r.matched, []);
});
