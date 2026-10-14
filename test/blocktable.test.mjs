import assert from "node:assert/strict";
import { test } from "node:test";
import { analyze, blockTable, createExperiment, logValue } from "../src/app/model.js";

const plan = { question: "Q?", aLabel: "A", bLabel: "B", outcome: { name: "Sleep", unit: "h", better: "higher", resolution: 0 },
  mme: 0.5, daySd: 1, periodDays: 2, blocks: 4, start: "2026-10-01", seed: "blocks-fixed" };
const make = (better = "higher") => createExperiment({ ...plan, outcome: { ...plan.outcome, better } }, new Date("2026-09-30T00:00:00Z"));
const LOG = [["2026-10-01", 7], ["2026-10-02", 8], ["2026-10-03", 6], ["2026-10-05", 5], ["2026-10-06", 7], ["2026-10-07", 6.5], ["2026-10-08", 0], ["2026-10-09", 8]];
const logged = async (better) => LOG.reduce((e, [d, v]) => logValue(e, d, v), await make(better));

test("blockTable: fresh experiment has empty rows", async () => {
  const t = blockTable(await make());
  assert.deepEqual(t, [1, 2, 3, 4].map((block) => ({ block, aMean: null, bMean: null, aDays: 0, bDays: 0, diff: null })));
});

test("blockTable: means, days and diff (higher is better)", async () => {
  assert.deepEqual(blockTable(await logged("higher")), [
    { block: 1, aMean: 6, bMean: 7.5, aDays: 1, bDays: 2, diff: 1.5 },
    { block: 2, aMean: 6, bMean: 3.25, aDays: 2, bDays: 2, diff: -2.75 },
    { block: 3, aMean: 8, bMean: null, aDays: 1, bDays: 0, diff: null },
    { block: 4, aMean: null, bMean: null, aDays: 0, bDays: 0, diff: null }]);
});

test("blockTable: lower is better flips only diff", async () => {
  const t = blockTable(await logged("lower"));
  assert.deepEqual(t.map((r) => r.diff), [-1.5, 2.75, null, null]);
  assert.deepEqual(t.map((r) => [r.aMean, r.bMean]), [[6, 7.5], [6, 3.25], [8, null], [null, null]]);
});

test("blockTable: consistent with analyze()", async () => {
  const e = await logged("higher"), a = analyze(e, "2026-10-20");
  const ds = blockTable(e).map((r) => r.diff).filter((d) => d != null);
  assert.equal(a.completeBlocks, ds.length);
  assert.deepEqual(a.history.map((h) => h.estimate), [1.5, -0.625]);
  assert.equal(a.cs.estimate, ds.reduce((x, y) => x + y, 0) / ds.length);
});
