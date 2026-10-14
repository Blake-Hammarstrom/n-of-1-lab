import assert from "node:assert/strict";
import { test } from "node:test";
import { analyze, createExperiment, logValue, schedule } from "../src/app/model.js";
import { periodOn } from "../src/engine/schedule.js";

const plan = { question: "Does X help?", aLabel: "Without X", bLabel: "With X",
  outcome: { name: "Score", unit: "pts", better: "higher", resolution: 1 }, mme: 2, daySd: 3, periodDays: 3, blocks: 4, start: "2026-10-01" };
const created = new Date("2026-09-30T00:00:00Z");

async function loggedExperiment() {
  let e = await createExperiment(plan, created);
  e = logValue(e, "2026-10-01", 5);
  e = logValue(e, "2026-10-02", 6, false);
  e = logValue(e, "2026-10-04", 7);
  return e;
}

test("progress before the start: nothing has happened yet", async () => {
  const a = analyze(await loggedExperiment(), "2026-09-30");
  assert.equal(a.started, false);
  assert.equal(a.finished, false);
  assert.equal(a.todayArm, null);
  assert.equal(a.pastDays, 0);
  assert.equal(a.loggedDays, 0);
  assert.deepEqual(a.missingDays, []);
  assert.equal(a.adherence, null);
});

test("progress mid-experiment counts logged, missing (incl. unlogged today) and adherence", async () => {
  const e = await loggedExperiment();
  const a = analyze(e, "2026-10-05");
  assert.equal(a.started, true);
  assert.equal(a.finished, false);
  assert.equal(a.pastDays, 5);
  assert.equal(a.loggedDays, 3);
  assert.deepEqual(a.missingDays, ["2026-10-03", "2026-10-05"]);
  assert.equal(a.adherence, 2 / 3);
  const period = periodOn(schedule(e), "2026-10-05");
  assert.ok(period);
  assert.equal(a.todayArm, period.arm);
});

test("end is the last period's end; finished only flips the day after", async () => {
  const e = await loggedExperiment();
  const sched = schedule(e);
  const a = analyze(e, "2026-10-01");
  assert.equal(a.end, sched[sched.length - 1].end);
  assert.equal(a.end, "2026-10-24");

  const last = analyze(e, "2026-10-24");
  assert.equal(last.finished, false);
  assert.equal(last.pastDays, 24);

  const after = analyze(e, "2026-10-25");
  assert.equal(after.finished, true);
  assert.equal(after.todayArm, null);
});

test("an experiment with no entries has no adherence and is not decisive", async () => {
  const e = await createExperiment(plan, created);
  const a = analyze(e, "2026-10-05");
  assert.equal(a.adherence, null);
  assert.equal(a.verdict.key, "collecting");
  assert.equal(a.decisive, false);
});
