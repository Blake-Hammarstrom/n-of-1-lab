import test from "node:test";
import assert from "node:assert/strict";
import { diffSd, power, blocksNeeded, resolutionCheck } from "../src/engine/planner.js";

const near = (a, b) => assert.ok(Math.abs(a - b) <= 1e-12, `${a} vs ${b}`);

test("planner: diffSd is sqrt(2)*daySd/sqrt(periodDays)", () => {
  near(diffSd(2, 4), Math.SQRT2);
  near(diffSd(2, 1), 2 * Math.SQRT2);
  near(diffSd(1, 4), Math.SQRT2 / 2);
});

test("planner: blocksNeeded returns the first even block count reaching the target", () => {
  const inp = { mme: 1, daySd: 1, periodDays: 3 };
  const r = blocksNeeded(inp);
  assert.equal(r.blocks, 16);
  assert.ok(r.power >= 0.8);
  assert.equal(r.blocks % 2, 0);
  assert.ok(power({ blocks: 14, ...inp }) < 0.8);
  assert.deepEqual(blocksNeeded(inp), r);
  assert.equal(blocksNeeded({ ...inp, target: 0.5 }).blocks, 14);
});

test("planner: blocksNeeded steps by 2 and accepts power exactly at the target", () => {
  const inp = { mme: 1, daySd: 1, periodDays: 1 };
  assert.equal(blocksNeeded({ ...inp, target: 0.5 }).blocks, 24);
  const r = blocksNeeded({ mme: 0.9, daySd: 1, periodDays: 1 });
  assert.equal(r.blocks, 40);
  assert.equal(r.power, 0.8);
});

test("planner: unreachable target returns null blocks and power at maxBlocks", () => {
  const inp = { mme: 0.5, daySd: 1, periodDays: 3 };
  const r = blocksNeeded(inp);
  assert.equal(r.blocks, null);
  assert.equal(r.power, power({ blocks: 40, ...inp }));
  assert.equal(blocksNeeded({ ...inp, maxBlocks: 6 }).blocks, null);
});

test("planner: resolutionCheck threshold and missing resolution", () => {
  assert.deepEqual(resolutionCheck(0.5, 1), { ok: true, note: "" });
  const low = resolutionCheck(0.51, 1);
  assert.equal(low.ok, false);
  assert.ok(low.note.includes("0.51"));
  for (const res of [0, -1, NaN, undefined]) {
    assert.deepEqual(resolutionCheck(res, 1), { ok: true, note: "" });
  }
});
