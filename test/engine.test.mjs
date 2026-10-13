import assert from "node:assert/strict";
import { test } from "node:test";
import { makeSchedule, daysIn, periodOn } from "../src/engine/schedule.js";
import { bet, blockDiffs, confidenceSequence, tTestP, verdict } from "../src/engine/stats.js";
import { blocksNeeded, power, resolutionCheck } from "../src/engine/planner.js";
import { normal, rng } from "../src/engine/rng.js";

test("schedule is reproducible from its seed, and each block has one A and one B period", () => {
  const s1 = makeSchedule({ seed: "x", blocks: 10, periodDays: 3, start: "2026-10-05" });
  assert.deepEqual(s1, makeSchedule({ seed: "x", blocks: 10, periodDays: 3, start: "2026-10-05" }));
  for (let b = 0; b < 10; b++) assert.deepEqual(s1.filter((p) => p.block === b).map((p) => p.arm).sort(), ["A", "B"]);
  assert.equal(daysIn(s1[0]).length, 3);
  assert.equal(periodOn(s1, "2026-10-05").block, 0);
  assert.equal(s1.at(-1).end, "2026-12-03"); // 10 blocks × 2 periods × 3 days = 60 days
});

test("days are averaged inside a period first (pseudoreplication guard)", () => {
  const s = [{ block: 0, arm: "A", start: "2026-01-01", end: "2026-01-03" }, { block: 0, arm: "B", start: "2026-01-04", end: "2026-01-04" }];
  const d = blockDiffs(s, { "2026-01-01": 1, "2026-01-02": 2, "2026-01-03": 3, "2026-01-04": 10 });
  assert.deepEqual(d, [{ block: 0, d: 8 }]); // 10 − mean(1,2,3); three days are one observation, not three
  assert.deepEqual(blockDiffs(s, { "2026-01-01": 1 }), []); // an incomplete block contributes nothing
});

test("anytime-valid: under no effect, peeking after every block rarely rejects", () => {
  const r = rng(99);
  let fp = 0;
  for (let i = 0; i < 800; i++) if (bet(Array.from({ length: 30 }, () => normal(r))).rejected) fp++;
  assert.ok(fp / 800 < 0.05, `false-positive rate ${fp / 800}`);
});

test("a large real effect is detected, and the interval contains it", () => {
  const r = rng(5), ds = Array.from({ length: 30 }, () => 2 + normal(r));
  assert.ok(bet(ds).rejected);
  const cs = confidenceSequence(ds);
  assert.ok(cs.lower < 2 && 2 < cs.upper && cs.lower > 0, JSON.stringify(cs));
});

test("verdict compares the interval with the smallest change that matters", () => {
  const v = (lower, upper, blocks = 5) => verdict({ lower, upper }, 1, { blocks, plannedBlocks: 10 }).key;
  assert.equal(v(-Infinity, Infinity), "collecting");
  assert.equal(v(1.2, 3), "meaningful-benefit");
  assert.equal(v(0.2, 3), "benefit-unclear-size");
  assert.equal(v(-0.5, 0.5), "no-meaningful-effect");
  assert.equal(v(-3, -1.1), "meaningful-harm");
  assert.equal(v(-2, 2), "keep-going");
  assert.equal(v(-2, 2, 10), "inconclusive");
});

test("t-test p-values match reference values (comparison baseline)", () => {
  const mk = (t, n) => { const base = Array.from({ length: n }, (_, i) => (i % 2 ? 1 : -1)); const sd = Math.sqrt(base.reduce((a, b) => a + b * b, 0) / (n - 1)); return base.map((x) => x / sd + t / Math.sqrt(n)); };
  for (const [t, df, p] of [[2.262, 9, 0.05], [2.0, 9, 0.0766], [1.0, 9, 0.3434], [2.0, 29, 0.0549]])
    assert.ok(Math.abs(tTestP(mk(t, df + 1)) - p) < 0.0006, `t=${t} df=${df}`);
});

test("planner: more blocks never lowers power; resolution check flags coarse instruments", () => {
  const a = power({ blocks: 8, mme: 1, daySd: 1, periodDays: 3 }), b = power({ blocks: 24, mme: 1, daySd: 1, periodDays: 3 });
  assert.ok(b >= a);
  assert.ok(blocksNeeded({ mme: 1, daySd: 1, periodDays: 3 }).blocks <= 40);
  assert.equal(resolutionCheck(1, 1).ok, false);
  assert.equal(resolutionCheck(0.1, 1).ok, true);
});
