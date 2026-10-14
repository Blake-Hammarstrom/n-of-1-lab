import assert from "node:assert/strict";
import { test } from "node:test";
import { bet, confidenceSequence, minBlocksForInterval } from "../src/engine/stats.js";
import { historyChart, intervalChart } from "../src/app/charts.js";

test("minBlocksForInterval matches the engine's best possible wealth", () => {
  assert.equal(minBlocksForInterval(), 8);
  assert.equal(minBlocksForInterval(0.05), 8);
  assert.equal(minBlocksForInterval(0.1), 7);
  assert.equal(minBlocksForInterval(0.01), 11);
});

test("the floor is real", () => {
  const ds = Array.from({ length: 8 }, (_, i) => 10 * 2 ** i);
  assert.equal(bet(ds.slice(0, 7)).rejected, false);
  assert.equal(bet(ds).rejected, true);
  assert.equal(bet(ds.slice(0, 7).map((d) => -d)).rejected, false);
  for (const cs of [confidenceSequence(ds.slice(0, 7)), ...[2, 3, 7].map((n) => confidenceSequence(Array(n).fill(5)))]) {
    assert.equal(cs.lower, -Infinity);
    assert.equal(cs.upper, Infinity);
  }
});

test("placeholders state the real minimum", () => {
  const open = intervalChart({ lower: -Infinity, upper: Infinity }, 0.5, "pts");
  assert.equal(open, `<div class="chart-empty">No interval yet: it can appear from block 8 at the earliest.</div>`);
  const hist = historyChart([], 0.5);
  assert.equal(hist, `<div class="chart-empty">Evidence over time appears from block 9 at the earliest.</div>`);
  assert.doesNotMatch(open + hist, /two|three/);
});
