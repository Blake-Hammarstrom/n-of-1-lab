import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { analyze, createExperiment, exportData, importData, logValue, verifyPrereg } from "../src/app/model.js";
import { sampleExperiment } from "../src/app/sample.js";

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
