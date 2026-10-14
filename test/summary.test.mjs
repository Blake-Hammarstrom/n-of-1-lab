import assert from "node:assert/strict";
import { test } from "node:test";
import { createExperiment, logValue, resultSummary, schedule } from "../src/app/model.js";
import { daysIn } from "../src/engine/schedule.js";

const plan = { question: "Does a walk after lunch help focus?", aLabel: "No walk", bLabel: "10-min walk",
  outcome: { name: "Focus", unit: "pts", better: "higher", resolution: 0 }, mme: 1, daySd: 1, periodDays: 1, blocks: 12, start: "2026-10-01", seed: "summary-fixed" };
const created = new Date("2026-09-30T08:05:09Z");

async function full() {
  let e = await createExperiment(plan, created);
  let i = 0;
  for (const per of schedule(e)) for (const iso of daysIn(per)) {
    e = logValue(e, iso, per.arm === "B" ? 3 + 0.1 * (i % 3) : 0, i % 4 !== 0);
    i++;
  }
  return e;
}
const lines = (s) => s.split("\n").slice(0, -1);

test("new experiment", async () => {
  const e = await createExperiment(plan, created);
  assert.ok(e.prereg.hash.startsWith("30d9f9e81ab4ff36"));
  const s = resultSummary(e, "2026-09-30");
  assert.ok(s.endsWith("\n"));
  const l = lines(s);
  assert.equal(l.length, 10);
  assert.deepEqual(l.slice(0, 7), [
    "Question: Does a walk after lunch help focus?", "A: No walk", "B: 10-min walk",
    "Outcome: Focus (pts), higher is better; smallest meaningful change 1",
    "Design: 12 blocks of two 1-day periods from 2026-10-01",
    "Progress: 0 of 12 blocks complete; 0 of 0 days logged; followed n/a", "Verdict: Collecting data"]);
  assert.ok(l[7].endsWith("interval: not available yet"));
  assert.equal(l[8], "Pre-registration: locked 2026-09-30 08:05 UTC, fingerprint 30d9f9e81ab4ff36");
  assert.equal(l[9], "Status: running");
});

test("full log", async () => {
  const e = await full();
  const l = lines(resultSummary(e, "2026-11-01"));
  assert.equal(l[5], "Progress: 12 of 12 blocks complete; 24 of 24 days logged; followed 75%");
  assert.equal(l[6], "Verdict: Meaningful benefit");
  assert.ok(l[7].endsWith("2.88 to 3.17 pts"));
  assert.equal(lines(resultSummary(e, "2026-10-05"))[5], "Progress: 12 of 12 blocks complete; 5 of 5 days logged; followed 60%");
});

test("stopped", async () => {
  const e = { ...(await full()), status: "stopped" };
  const at = "2026-10-20T10:00:00Z";
  assert.equal(lines(resultSummary({ ...e, stop: { at, reason: "decisive" } }, "2026-11-01"))[9], "Status: stopped 2026-10-20 (decisive)");
  assert.equal(lines(resultSummary({ ...e, stop: { at, reason: null } }, "2026-11-01"))[9], "Status: stopped 2026-10-20");
});

test("open side and empty unit", async () => {
  let e = await full();
  const days = schedule(e).flatMap((per) => daysIn(per).map((iso) => [iso, per.arm])).slice(-16);
  for (const [iso, arm] of days) e = logValue(e, iso, arm === "B" ? -50 : 50, true);
  e = { ...e, protocol: { ...e.protocol, outcome: { ...e.protocol.outcome, unit: "" } } };
  const l = lines(resultSummary(e, "2026-11-01"));
  assert.equal(l[3], "Outcome: Focus, higher is better; smallest meaningful change 1");
  assert.ok(l[5].endsWith("followed 92%"));
  assert.equal(l[6], "Verdict: Inconclusive at the planned length");
  assert.ok(l[7].endsWith("no limit to 1.38"));
});
