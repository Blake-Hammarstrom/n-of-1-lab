import assert from "node:assert/strict";
import { test } from "node:test";
import { createExperiment, logValue } from "../src/app/model.js";

const plan = { question: "Does X help?", aLabel: "Without X", bLabel: "With X",
  outcome: { name: "Score", unit: "pts", better: "higher", resolution: 1 }, mme: 2, daySd: 3, periodDays: 3, blocks: 4, start: "2026-10-01" };
const make = () => createExperiment(plan, new Date("2026-09-30T00:00:00Z"));

test("logValue: blank or missing values are rejected, not logged as 0", async () => {
  const e = await make();
  for (const v of ["", "  ", "\t\n", null, undefined]) {
    assert.throws(() => logValue(e, "2026-10-01", v), { message: "Enter a number." }, JSON.stringify(v));
  }
});

test("logValue: real numbers still work, including 0", async () => {
  const e = await make();
  assert.equal(logValue(e, "2026-10-01", "5.5").entries["2026-10-01"].value, 5.5);
  assert.equal(logValue(e, "2026-10-01", 0).entries["2026-10-01"].value, 0);
  assert.equal(logValue(e, "2026-10-01", "0").entries["2026-10-01"].value, 0);
});

test("logValue: non-finite input is rejected", async () => {
  const e = await make();
  for (const v of ["abc", Infinity, NaN]) {
    assert.throws(() => logValue(e, "2026-10-01", v), { message: "Enter a number." });
  }
});

test("logValue: days outside the experiment are rejected, the last day is accepted", async () => {
  const e = await make();
  for (const d of ["2026-09-30", "2026-10-25"]) {
    assert.throws(() => logValue(e, d, 1), { message: "That day isn't part of the experiment." });
  }
  assert.equal(logValue(e, "2026-10-24", 1).entries["2026-10-24"].value, 1);
});

test("logValue: a stopped experiment refuses new values", async () => {
  const e = await make();
  assert.throws(() => logValue({ ...e, status: "stopped" }, "2026-10-01", 1), { message: "This experiment is no longer running." });
});

test("logValue: followed false is stored as false", async () => {
  const e = await make();
  assert.equal(logValue(e, "2026-10-01", 3, 0).entries["2026-10-01"].followed, false);
});

test("logValue: logging a day twice keeps the second value and does not mutate the original", async () => {
  const e = await make();
  const once = logValue(e, "2026-10-01", 3);
  const twice = logValue(once, "2026-10-01", 4);
  assert.equal(twice.entries["2026-10-01"].value, 4);
  assert.equal(once.entries["2026-10-01"].value, 3);
  assert.deepEqual(e.entries, {});
});
