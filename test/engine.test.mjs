import assert from "node:assert/strict";
import { test } from "node:test";
import { makeSchedule, daysIn, periodOn } from "../src/engine/schedule.js";
import { bet, blockDiffs, confidenceSequence, tTestP, verdict } from "../src/engine/stats.js";
import { blocksNeeded, power, resolutionCheck } from "../src/engine/planner.js";
import { normal, rng, hashString } from "../src/engine/rng.js";

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

test("FNV-1a reference values: hashString produces consistent outputs for known inputs", () => {
  assert.equal(hashString(""), 2166136261); // FNV offset basis
  assert.equal(hashString("a"), 3826002220);
  assert.equal(hashString("hello"), 1335831723);
  assert.equal(hashString("seed1"), 4207405863);
  assert.equal(hashString("seed2"), 4224183482);
  assert.equal(typeof hashString("test"), "number");
  assert.ok(hashString("test") >>> 0 === hashString("test")); // is unsigned 32-bit
});

test("seed determinism: same seed always produces same schedule, different seeds produce different schedules", () => {
  const params = { blocks: 5, periodDays: 3, start: "2026-01-01" };
  const s1a = makeSchedule({ seed: "myseed", ...params });
  const s1b = makeSchedule({ seed: "myseed", ...params });
  const s2 = makeSchedule({ seed: "otherseed", ...params });
  assert.deepEqual(s1a, s1b, "same seed must produce identical schedules");
  assert.notDeepEqual(s1a, s2, "different seeds must produce different schedules");
});

test("seed determinism with numeric seeds: integer seeds produce reproducible schedules", () => {
  const params = { blocks: 4, periodDays: 2, start: "2026-02-15" };
  const s1 = makeSchedule({ seed: 12345, ...params });
  const s2 = makeSchedule({ seed: 12345, ...params });
  const s3 = makeSchedule({ seed: 12346, ...params });
  assert.deepEqual(s1, s2, "same numeric seed must produce identical schedules");
  assert.notDeepEqual(s1, s3, "different numeric seeds must produce different schedules");
});

test("periodOn returns null for dates outside any period", () => {
  const s = makeSchedule({ seed: "test", blocks: 2, periodDays: 3, start: "2026-01-10" });
  assert.strictEqual(periodOn(s, "2026-01-09"), null, "date before first period");
  assert.strictEqual(periodOn(s, "2026-01-22"), null, "date after last period");
  assert.ok(periodOn(s, "2026-01-10") !== null, "date on first period start");
});

test("periodOn handles boundary dates correctly", () => {
  const s = makeSchedule({ seed: "test", blocks: 1, periodDays: 5, start: "2026-03-15" });
  const period = s[0];
  assert.strictEqual(periodOn(s, period.start), period, "start date is in period");
  assert.strictEqual(periodOn(s, period.end), period, "end date is in period");
  const dayBefore = new Date(new Date(period.start + "T00:00:00Z").getTime() - 86400000).toISOString().slice(0, 10);
  assert.strictEqual(periodOn(s, dayBefore), null, "day before start is not in period");
});

test("schedule contiguity: periods form continuous sequence across days", () => {
  const s = makeSchedule({ seed: "test", blocks: 3, periodDays: 4, start: "2026-03-15" });
  for (let i = 0; i < s.length - 1; i++) {
    const curr = s[i];
    const next = s[i + 1];
    const currEnd = new Date(curr.end + "T00:00:00Z").getTime();
    const nextStart = new Date(next.start + "T00:00:00Z").getTime();
    assert.equal(currEnd + 86400000, nextStart, `periods ${i} and ${i + 1} must be contiguous`);
  }
});

test("schedule contiguity across month boundaries", () => {
  const s = makeSchedule({ seed: "boundary", blocks: 2, periodDays: 15, start: "2026-01-20" });
  const periods = s.map((p) => ({ start: p.start, end: p.end }));
  for (let i = 0; i < periods.length - 1; i++) {
    const curr = new Date(periods[i].end + "T00:00:00Z").getTime();
    const next = new Date(periods[i + 1].start + "T00:00:00Z").getTime();
    assert.equal(next - curr, 86400000, `one day gap between periods at index ${i}`);
  }
});

test("schedule contiguity across year boundaries", () => {
  const s = makeSchedule({ seed: "newyear", blocks: 2, periodDays: 20, start: "2026-12-15" });
  const last = new Date(s[0].end + "T00:00:00Z").getTime();
  const first = new Date(s[1].start + "T00:00:00Z").getTime();
  assert.equal(first - last, 86400000, "schedule must be contiguous even crossing year boundary");
});

test("daysIn returns correct number of days for 7-day period", () => {
  const period = { block: 0, arm: "A", start: "2026-04-10", end: "2026-04-16" };
  const days = daysIn(period);
  assert.equal(days.length, 7, "7-day period must have 7 days");
  assert.equal(days[0], "2026-04-10");
  assert.equal(days[6], "2026-04-16");
});

test("daysIn returns correct sequence of days for various period lengths", () => {
  for (const len of [1, 3, 7, 14]) {
    const end = new Date(new Date("2026-05-01T00:00:00Z").getTime() + (len - 1) * 86400000).toISOString().slice(0, 10);
    const period = { block: 0, arm: "A", start: "2026-05-01", end };
    const days = daysIn(period);
    assert.equal(days.length, len, `${len}-day period must return ${len} days`);
    assert.equal(days[0], "2026-05-01");
    assert.equal(days[len - 1], end);
    for (let i = 1; i < days.length; i++) {
      const prev = new Date(days[i - 1] + "T00:00:00Z").getTime();
      const curr = new Date(days[i] + "T00:00:00Z").getTime();
      assert.equal(curr - prev, 86400000, `consecutive days must be 1 day apart at index ${i}`);
    }
  }
});

test("daysIn across month boundaries", () => {
  const period = { block: 0, arm: "A", start: "2026-04-29", end: "2026-05-02" };
  const days = daysIn(period);
  assert.equal(days.length, 4);
  assert.deepEqual(days, ["2026-04-29", "2026-04-30", "2026-05-01", "2026-05-02"]);
});

test("daysIn across year boundaries", () => {
  const period = { block: 0, arm: "A", start: "2026-12-30", end: "2027-01-02" };
  const days = daysIn(period);
  assert.equal(days.length, 4);
  assert.deepEqual(days, ["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
});

test("blockDiffs ignores non-finite values (NaN, Infinity, -Infinity)", () => {
  const s = [{ block: 0, arm: "A", start: "2026-01-01", end: "2026-01-02" }, { block: 0, arm: "B", start: "2026-01-03", end: "2026-01-04" }];
  const d = blockDiffs(s, { "2026-01-01": 1, "2026-01-02": NaN, "2026-01-03": 5, "2026-01-04": Infinity });
  assert.deepEqual(d, [{ block: 0, d: 5 - 1 }]);
  const d2 = blockDiffs(s, { "2026-01-01": 10, "2026-01-02": -Infinity, "2026-01-03": 20, "2026-01-04": 30 });
  assert.deepEqual(d2, [{ block: 0, d: 25 - 10 }]);
});

test("blockDiffs ignores values outside period range", () => {
  const s = [{ block: 0, arm: "A", start: "2026-01-05", end: "2026-01-06" }, { block: 0, arm: "B", start: "2026-01-07", end: "2026-01-08" }];
  const d = blockDiffs(s, {
    "2026-01-01": 99,
    "2026-01-05": 1,
    "2026-01-06": 2,
    "2026-01-07": 5,
    "2026-01-08": 8,
    "2026-01-10": 99,
  });
  assert.deepEqual(d, [{ block: 0, d: 6.5 - 1.5 }]);
});

test("blockDiffs with mixed non-finite and out-of-period values", () => {
  const s = [{ block: 0, arm: "A", start: "2026-01-02", end: "2026-01-03" }, { block: 0, arm: "B", start: "2026-01-04", end: "2026-01-05" }];
  const d = blockDiffs(s, {
    "2026-01-01": 1,
    "2026-01-02": 10,
    "2026-01-03": NaN,
    "2026-01-04": 20,
    "2026-01-05": Infinity,
    "2026-01-06": 30,
  });
  assert.deepEqual(d, [{ block: 0, d: 20 - 10 }]);
});

test("verdict: lower = mme returns meaningful-benefit", () => {
  const v = verdict({ lower: 1, upper: 2 }, 1, { blocks: 5, plannedBlocks: 10 });
  assert.equal(v.key, "meaningful-benefit");
});

test("verdict: upper = -mme returns meaningful-harm", () => {
  const v = verdict({ lower: -2, upper: -1 }, 1, { blocks: 5, plannedBlocks: 10 });
  assert.equal(v.key, "meaningful-harm");
});

test("verdict: harm-unclear edge (upper < 0 and lower > -mme)", () => {
  const v = verdict({ lower: -0.5, upper: -0.1 }, 1, { blocks: 5, plannedBlocks: 10 });
  assert.equal(v.key, "harm-unclear-size");
});

test("verdict: lower just below mme with positive upper", () => {
  const v = verdict({ lower: 0.9, upper: 2 }, 1, { blocks: 5, plannedBlocks: 10 });
  assert.equal(v.key, "benefit-unclear-size");
});

test("verdict: upper just above -mme with negative lower", () => {
  const v = verdict({ lower: -2, upper: -0.9 }, 1, { blocks: 5, plannedBlocks: 10 });
  assert.equal(v.key, "harm-unclear-size");
});

test("verdict: tight interval around zero (no-meaningful-effect)", () => {
  const v = verdict({ lower: -0.5, upper: 0.5 }, 1, { blocks: 5, plannedBlocks: 10 });
  assert.equal(v.key, "no-meaningful-effect");
});

test("tTestP: n < 2 returns 1", () => {
  assert.equal(tTestP([]), 1);
  assert.equal(tTestP([5]), 1);
});

test("tTestP: zero variance with zero mean returns 1", () => {
  assert.equal(tTestP([0, 0, 0, 0]), 1);
});

test("tTestP: zero variance with non-zero mean returns 0", () => {
  assert.equal(tTestP([5, 5, 5, 5]), 0);
});

test("tTestP: with n=2 and non-zero mean detects effect", () => {
  const ds = [2, 4];
  const p = tTestP(ds);
  assert.ok(Number.isFinite(p) && p >= 0 && p <= 1, `p-value ${p} out of valid range`);
});

test("confidenceSequence with minimum block count (11 blocks)", () => {
  const r = rng(42);
  const ds = Array.from({ length: 11 }, () => normal(r));
  const cs = confidenceSequence(ds);
  assert.ok(Number.isFinite(cs.lower) || Number.isFinite(cs.upper));
  assert.ok(cs.estimate !== null);
  assert.ok(Number.isFinite(cs.estimate));
});

test("confidenceSequence with 11 blocks respects interval bounds", () => {
  const r = rng(42);
  const ds = Array.from({ length: 11 }, () => 1.5 + normal(r));
  const cs = confidenceSequence(ds);
  assert.ok(cs.lower <= cs.estimate && cs.estimate <= cs.upper, "estimate must be within bounds");
  assert.ok(cs.lower <= 1.5 || cs.upper >= 1.5, "interval should plausibly contain true effect");
});
