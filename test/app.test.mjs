import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { analyze, createExperiment, exportData, importData, logValue, schedule, verifyPrereg } from "../src/app/model.js";
import { sampleExperiment } from "../src/app/sample.js";
import { daysIn } from "../src/engine/schedule.js";

const plan = { question: "Does X help?", aLabel: "Without X", bLabel: "With X",
  outcome: { name: "Score", unit: "pts", better: "higher", resolution: 1 }, mme: 2, daySd: 3, periodDays: 2, blocks: 8, start: "2026-10-05" };

test("starting locks the plan: the fingerprint detects any later edit", async () => {
  const e = await createExperiment(plan);
  assert.equal(await verifyPrereg(e), true);
  assert.equal(await verifyPrereg({ ...e, protocol: { ...e.protocol, mme: 1 } }), false);
});

test("invalid plans are refused with readable reasons", async () => {
  await assert.rejects(createExperiment({ ...plan, mme: 0 }), /smallest change/);
  await assert.rejects(createExperiment({ ...plan, bLabel: "Without X" }), /different names/);
});

test("logging respects the schedule and the running state", async () => {
  let e = await createExperiment(plan);
  e = logValue(e, "2026-10-05", 7);
  assert.equal(e.entries["2026-10-05"].value, 7);
  assert.throws(() => logValue(e, "2026-01-01", 7), /isn't part/);
  assert.throws(() => logValue(e, "2026-10-06", "abc"), /number/);
  assert.throws(() => logValue({ ...e, status: "stopped" }, "2026-10-06", 1), /no longer running/);
});

test("analysis orients the effect so positive = better, even when lower is better", async () => {
  const s = await sampleExperiment(); // putts: lower is better; the warm-up lowers putts in the simulation
  const a = analyze(s, "2026-07-03");
  assert.equal(a.completeBlocks, 16);
  assert.ok(a.cs.estimate > 0, "a reduction in putts must read as a benefit");
});

test("export → import round-trips, and import rejects a tampered plan", async () => {
  const e = logValue(await createExperiment(plan), "2026-10-05", 4);
  const back = await importData(exportData([e]));
  assert.deepEqual(back, [e]);
  const tampered = JSON.parse(exportData([e]));
  tampered.experiments[0].protocol.mme = 0.5;
  await assert.rejects(importData(JSON.stringify(tampered)), /edited after it was pre-registered/);
});

test("regression: a 2-block experiment cannot report a decisive meaningful effect through analyze()", async () => {
  // Small daySd and only 2 complete (of 4 planned) blocks are what used to hit the
  // confidence-sequence grid edges and misread them as a tight, decisive interval.
  const tinyNoisePlan = { question: "Does X help?", aLabel: "Without X", bLabel: "With X",
    outcome: { name: "Score", unit: "pts", better: "higher", resolution: 1 },
    mme: 0.5, daySd: 0.1, periodDays: 2, blocks: 4, start: "2026-10-05" };
  let e = await createExperiment(tinyNoisePlan);
  for (const per of schedule(e)) {
    if (per.block > 1) continue; // only the first 2 of the 4 planned blocks are logged
    const value = per.arm === "A" ? 0 : 1; // a large, consistent-looking B − A difference
    for (const iso of daysIn(per)) e = logValue(e, iso, value);
  }
  const a = analyze(e, "2026-10-20");
  assert.equal(a.completeBlocks, 2);
  assert.notEqual(a.verdict.key, "meaningful-benefit", `2 blocks should not be decisive, got ${JSON.stringify(a.cs)}`);
  assert.notEqual(a.verdict.key, "meaningful-harm", `2 blocks should not be decisive, got ${JSON.stringify(a.cs)}`);
  assert.ok(!Number.isFinite(a.cs.lower) || !Number.isFinite(a.cs.upper), `interval must stay open, got ${JSON.stringify(a.cs)}`);
});

test("privacy by architecture: no network APIs in the app, and the CSP forbids connections", () => {
  const files = ["app", "engine"].flatMap((d) => readdirSync(new URL(`../src/${d}/`, import.meta.url)).map((f) => `../src/${d}/${f}`));
  for (const f of files) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.doesNotMatch(src, /\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource|navigator\.share/, f);
  }
  const html = readFileSync(new URL("../src/index.html", import.meta.url), "utf8");
  assert.match(html, /connect-src 'none'/);
  assert.doesNotMatch(html, /https?:\/\//); // no third-party scripts, fonts or analytics
});
