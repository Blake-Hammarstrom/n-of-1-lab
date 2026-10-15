import assert from "node:assert/strict";
import { test } from "node:test";
import { createExperiment, periodStatus } from "../src/app/model.js";

const plan = { question: "Q", aLabel: "Coffee", bLabel: "No coffee",
  outcome: { name: "x", unit: "", better: "higher", resolution: 0 }, mme: 1, daySd: 1, periodDays: 3, blocks: 4, start: "2026-10-01", seed: "fixed" };
const make = (extra = {}) => createExperiment({ ...plan, ...extra }, new Date("2026-09-30T00:00:00Z"));

test("before the start: days until it begins and the first condition", async () => {
  const e = await make();
  assert.deepEqual(periodStatus(e, "2026-09-28"), { phase: "before", startsIn: 3, next: { date: "2026-10-01", arm: "B" } });
  assert.equal(periodStatus(e, "2026-09-30").startsIn, 1);
});

test("during: position in period and experiment, and the next switch", async () => {
  const e = await make();
  const next = { date: "2026-10-04", arm: "A" };
  assert.deepEqual(periodStatus(e, "2026-10-01"), { phase: "during", block: 1, arm: "B", dayInPeriod: 1, periodDays: 3, day: 1, totalDays: 24, next });
  const s = periodStatus(e, "2026-10-03");
  assert.equal(s.dayInPeriod, 3); assert.equal(s.day, 3); assert.deepEqual(s.next, next);
  const t = periodStatus(e, "2026-10-04");
  assert.deepEqual([t.block, t.arm, t.dayInPeriod, t.day, t.next], [1, "A", 1, 4, { date: "2026-10-07", arm: "B" }]);
});

test("the next switch skips a back-to-back period with the same condition", async () => {
  const e = await make();
  const s = periodStatus(e, "2026-10-11");
  assert.deepEqual([s.block, s.arm, s.dayInPeriod, s.day, s.next], [2, "A", 2, 11, { date: "2026-10-16", arm: "B" }]);
  assert.deepEqual(periodStatus(e, "2026-10-16").next, { date: "2026-10-19", arm: "A" });
});

test("last period and after the end", async () => {
  const e = await make();
  assert.equal(periodStatus(e, "2026-10-23").next, null);
  assert.deepEqual(periodStatus(e, "2026-10-24"), { phase: "during", block: 4, arm: "B", dayInPeriod: 3, periodDays: 3, day: 24, totalDays: 24, next: null });
  assert.deepEqual(periodStatus(e, "2026-10-25"), { phase: "after", ended: "2026-10-24" });
});

test("one-day periods", async () => {
  const e = await make({ periodDays: 1, seed: "other" });
  const next = { date: "2026-10-04", arm: "B" };
  assert.deepEqual(periodStatus(e, "2026-10-02"), { phase: "during", block: 1, arm: "A", dayInPeriod: 1, periodDays: 1, day: 2, totalDays: 8, next });
  const s = periodStatus(e, "2026-10-03");
  assert.deepEqual([s.block, s.arm, s.day, s.next], [2, "A", 3, next]);
});
