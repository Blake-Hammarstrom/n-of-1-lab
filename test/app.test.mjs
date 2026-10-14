import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { analyze, canonical, createExperiment, exportData, importData, logValue, protocolOf, schedule, validateProtocol, verifyPrereg } from "../src/app/model.js";
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

test("regression: fractional block counts must be rejected", async () => {
  await assert.rejects(createExperiment({ ...plan, blocks: 4.5 }), /Plan 4 to 60 blocks/);
  await assert.rejects(createExperiment({ ...plan, blocks: 8.1 }), /Plan 4 to 60 blocks/);
  await assert.rejects(createExperiment({ ...plan, blocks: 10.9 }), /Plan 4 to 60 blocks/);
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

test("regression: import rejects experiments whose entries would crash the app", async () => {
  const e = await createExperiment(plan);
  const incomplete = /An experiment in the file is incomplete\./;
  for (const entries of [null, [], { "2026-10-01": null }, { "2026-10-01": 5 }, { "2026-10-01": [] }]) {
    await assert.rejects(importData(exportData([{ ...e, entries }])), incomplete, JSON.stringify(entries));
  }
  await assert.rejects(importData(exportData([null])), incomplete);
});

test("import keeps its other checks", async () => {
  const e = logValue(await createExperiment(plan), "2026-10-05", 4);
  const notExport = /Not an N-of-1 Lab export\./;
  const incomplete = /An experiment in the file is incomplete\./;
  await assert.rejects(importData(JSON.stringify({ app: "other", experiments: [] })), notExport);
  await assert.rejects(importData(JSON.stringify({ app: "n-of-1-lab", experiments: {} })), notExport);
  const { protocol, ...noProtocol } = e;
  const { prereg, ...noPrereg } = e;
  await assert.rejects(importData(exportData([noProtocol])), incomplete);
  await assert.rejects(importData(exportData([noPrereg])), incomplete);
  const edited = { ...e, entries: { ...e.entries, "2026-10-06": { value: 99 } } };
  assert.deepEqual(await importData(exportData([edited])), [edited]);
  assert.deepEqual(await importData(exportData([])), []);
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

test("protocolOf: trims whitespace from string fields", () => {
  const input = { question: "  Q?  ", aLabel: "\tA\n", bLabel: "  B  ", outcome: { name: " Score ", unit: "  pts  ", better: "higher", resolution: 1 }, mme: 2, daySd: 3, periodDays: 2, blocks: 8, start: "2026-10-05" };
  const proto = protocolOf(input);
  assert.equal(proto.question, "Q?");
  assert.equal(proto.aLabel, "A");
  assert.equal(proto.bLabel, "B");
  assert.equal(proto.outcome.name, "Score");
  assert.equal(proto.outcome.unit, "pts");
});

test("protocolOf: defaults outcome.unit to empty string when missing or falsy", () => {
  const base = { question: "Q?", aLabel: "A", bLabel: "B", outcome: { name: "S", better: "higher", resolution: 1 }, mme: 1, daySd: 1, periodDays: 2, blocks: 8, start: "2026-10-05" };
  assert.equal(protocolOf(base).outcome.unit, "");
  assert.equal(protocolOf({ ...base, outcome: { ...base.outcome, unit: null } }).outcome.unit, "");
  assert.equal(protocolOf({ ...base, outcome: { ...base.outcome, unit: 0 } }).outcome.unit, "");
});

test("protocolOf: defaults outcome.better to 'higher' when not 'lower'", () => {
  const base = { question: "Q?", aLabel: "A", bLabel: "B", outcome: { name: "S", unit: "", resolution: 1 }, mme: 1, daySd: 1, periodDays: 2, blocks: 8, start: "2026-10-05" };
  assert.equal(protocolOf(base).outcome.better, "higher");
  assert.equal(protocolOf({ ...base, outcome: { ...base.outcome, better: "lower" } }).outcome.better, "lower");
  assert.equal(protocolOf({ ...base, outcome: { ...base.outcome, better: "LOWER" } }).outcome.better, "higher");
  assert.equal(protocolOf({ ...base, outcome: { ...base.outcome, better: undefined } }).outcome.better, "higher");
});

test("protocolOf: defaults outcome.resolution to 0 when falsy or NaN", () => {
  const base = { question: "Q?", aLabel: "A", bLabel: "B", outcome: { name: "S", unit: "", better: "higher" }, mme: 1, daySd: 1, periodDays: 2, blocks: 8, start: "2026-10-05" };
  assert.equal(protocolOf(base).outcome.resolution, 0);
  assert.equal(protocolOf({ ...base, outcome: { ...base.outcome, resolution: 0 } }).outcome.resolution, 0);
  assert.equal(protocolOf({ ...base, outcome: { ...base.outcome, resolution: null } }).outcome.resolution, 0);
  assert.equal(protocolOf({ ...base, outcome: { ...base.outcome, resolution: NaN } }).outcome.resolution, 0);
  assert.equal(protocolOf({ ...base, outcome: { ...base.outcome, resolution: 2.5 } }).outcome.resolution, 2.5);
});

test("canonical: produces identical output for objects with keys in different orders", () => {
  const obj1 = { a: 1, b: 2, c: 3 };
  const obj2 = { c: 3, a: 1, b: 2 };
  const obj3 = { b: 2, c: 3, a: 1 };
  assert.equal(canonical(obj1), canonical(obj2));
  assert.equal(canonical(obj2), canonical(obj3));
  assert.equal(canonical(obj1), canonical(obj3));
});

test("canonical: hash independence for nested objects with different key orders", () => {
  const p1 = { outcome: { name: "Score", unit: "pts", better: "higher" }, question: "Q?", aLabel: "A", bLabel: "B" };
  const p2 = { bLabel: "B", outcome: { better: "higher", name: "Score", unit: "pts" }, aLabel: "A", question: "Q?" };
  assert.equal(canonical(p1), canonical(p2));
});

test("protocol hash: createExperiment's prereg.hash is independent of input key order", async () => {
  const now = new Date("2026-10-01T00:00:00Z");
  const reordered = { start: plan.start, blocks: plan.blocks, periodDays: plan.periodDays, daySd: plan.daySd, mme: plan.mme,
    outcome: { resolution: 1, better: "higher", unit: "pts", name: "Score" }, bLabel: plan.bLabel, aLabel: plan.aLabel, question: plan.question, seed: "fixed" };
  const ordered = { ...plan, seed: "fixed" };
  const e1 = await createExperiment(ordered, now);
  const e2 = await createExperiment(reordered, now);
  assert.match(e1.prereg.hash, /^[0-9a-f]{64}$/);
  assert.equal(e1.prereg.hash, e2.prereg.hash);
});

test("protocol hash: verifyPrereg accepts a stored protocol whose keys were reordered (e.g. after JSON round-trip)", async () => {
  const e = await createExperiment(plan);
  const p = e.protocol;
  const reorderedProtocol = { seed: p.seed, start: p.start, alpha: p.alpha, blocks: p.blocks, periodDays: p.periodDays, daySd: p.daySd, mme: p.mme,
    outcome: { resolution: p.outcome.resolution, better: p.outcome.better, unit: p.outcome.unit, name: p.outcome.name },
    bLabel: p.bLabel, aLabel: p.aLabel, question: p.question };
  assert.notDeepEqual(Object.keys(reorderedProtocol), Object.keys(p));
  assert.equal(await verifyPrereg({ ...e, protocol: reorderedProtocol }), true);
  assert.equal(await verifyPrereg({ ...e, protocol: { ...reorderedProtocol, blocks: p.blocks + 1 } }), false);
});

test("canonical: arrays maintain order (not sorted)", () => {
  const arr1 = [1, 2, 3];
  const arr2 = [3, 2, 1];
  assert.notEqual(canonical(arr1), canonical(arr2));
});

test("validateProtocol: 'Write the question you want answered.' for missing question", async () => {
  const errors = validateProtocol({ ...protocolOf(plan), question: "" });
  assert.ok(errors.includes("Write the question you want answered."), JSON.stringify(errors));
});

test("validateProtocol: 'Name both conditions.' when aLabel or bLabel missing", async () => {
  const errors1 = validateProtocol({ ...protocolOf(plan), aLabel: "" });
  assert.ok(errors1.includes("Name both conditions."), JSON.stringify(errors1));
  const errors2 = validateProtocol({ ...protocolOf(plan), bLabel: "" });
  assert.ok(errors2.includes("Name both conditions."), JSON.stringify(errors2));
});

test("validateProtocol: 'The two conditions need different names.' when aLabel equals bLabel", async () => {
  const errors = validateProtocol({ ...protocolOf(plan), aLabel: "Same", bLabel: "Same" });
  assert.ok(errors.includes("The two conditions need different names."), JSON.stringify(errors));
});

test("validateProtocol: 'Name the outcome you'll measure.' for missing outcome.name", async () => {
  const proto = protocolOf(plan);
  const errors = validateProtocol({ ...proto, outcome: { ...proto.outcome, name: "" } });
  assert.ok(errors.includes("Name the outcome you'll measure."), JSON.stringify(errors));
});

test("validateProtocol: mme validation message for mme <= 0", async () => {
  const proto = protocolOf(plan);
  const errors0 = validateProtocol({ ...proto, mme: 0 });
  assert.ok(errors0.includes("Set the smallest change that would matter to you (greater than 0)."), JSON.stringify(errors0));
  const errorsNeg = validateProtocol({ ...proto, mme: -1 });
  assert.ok(errorsNeg.includes("Set the smallest change that would matter to you (greater than 0)."), JSON.stringify(errorsNeg));
});

test("validateProtocol: daySd validation message for daySd <= 0", async () => {
  const proto = protocolOf(plan);
  const errors0 = validateProtocol({ ...proto, daySd: 0 });
  assert.ok(errors0.includes("Estimate how much the outcome varies day to day (greater than 0)."), JSON.stringify(errors0));
  const errorsNeg = validateProtocol({ ...proto, daySd: -5 });
  assert.ok(errorsNeg.includes("Estimate how much the outcome varies day to day (greater than 0)."), JSON.stringify(errorsNeg));
});

test("validateProtocol: 'Periods must be 1 to 14 days.' for periodDays out of range", async () => {
  const proto = protocolOf(plan);
  const errors0 = validateProtocol({ ...proto, periodDays: 0 });
  assert.ok(errors0.includes("Periods must be 1 to 14 days."), JSON.stringify(errors0));
  const errors15 = validateProtocol({ ...proto, periodDays: 15 });
  assert.ok(errors15.includes("Periods must be 1 to 14 days."), JSON.stringify(errors15));
  const errorsNeg = validateProtocol({ ...proto, periodDays: -1 });
  assert.ok(errorsNeg.includes("Periods must be 1 to 14 days."), JSON.stringify(errorsNeg));
});

test("validateProtocol: 'Plan 4 to 60 blocks.' for blocks validation", async () => {
  const proto = protocolOf(plan);
  const errors3 = validateProtocol({ ...proto, blocks: 3 });
  assert.ok(errors3.includes("Plan 4 to 60 blocks."), JSON.stringify(errors3));
  const errors61 = validateProtocol({ ...proto, blocks: 61 });
  assert.ok(errors61.includes("Plan 4 to 60 blocks."), JSON.stringify(errors61));
});

test("validateProtocol: 'Plan 4 to 60 blocks.' for fractional blocks (not integer)", async () => {
  const proto = protocolOf(plan);
  const errors4_5 = validateProtocol({ ...proto, blocks: 4.5 });
  assert.ok(errors4_5.includes("Plan 4 to 60 blocks."), JSON.stringify(errors4_5));
});

test("validateProtocol: 'Pick a start date.' for invalid start date format", async () => {
  const proto = protocolOf(plan);
  const errorsBad1 = validateProtocol({ ...proto, start: "2026/10/05" });
  assert.ok(errorsBad1.includes("Pick a start date."), JSON.stringify(errorsBad1));
  const errorsBad2 = validateProtocol({ ...proto, start: "10-05-2026" });
  assert.ok(errorsBad2.includes("Pick a start date."), JSON.stringify(errorsBad2));
  const errorsEmpty = validateProtocol({ ...proto, start: "" });
  assert.ok(errorsEmpty.includes("Pick a start date."), JSON.stringify(errorsEmpty));
});

test("logValue: truncates notes at 280 characters", async () => {
  let e = await createExperiment(plan);
  const shortNote = "x".repeat(280);
  e = logValue(e, "2026-10-05", 5, true, shortNote);
  assert.equal(e.entries["2026-10-05"].note, shortNote);
  assert.equal(e.entries["2026-10-05"].note.length, 280);

  const longNote = "y".repeat(281);
  e = logValue(e, "2026-10-06", 6, true, longNote);
  assert.equal(e.entries["2026-10-06"].note.length, 280);
  assert.equal(e.entries["2026-10-06"].note, "y".repeat(280));
});

test("logValue: converts note to string before truncation", async () => {
  let e = await createExperiment(plan);
  e = logValue(e, "2026-10-05", 5, true, 42);
  assert.equal(e.entries["2026-10-05"].note, "42");
  e = logValue(e, "2026-10-06", 6, true, { toString: () => "a".repeat(300) });
  assert.equal(e.entries["2026-10-06"].note.length, 280);
});

test("regression: charts handle one-sided confidence intervals", async () => {
  const { intervalChart, historyChart } = await import("../src/app/charts.js");
  const bad = /NaN|Infinity/;
  const up = intervalChart({ lower: -1.71, upper: Infinity, estimate: 1.2 }, 0.5, "pts");
  assert.doesNotMatch(up, bad);
  assert.match(up, /<svg/);
  assert.match(up, /from -1\.7 to no limit yet pts/);
  assert.match(up, />no limit yet</);
  const down = intervalChart({ lower: -Infinity, upper: -2.54, estimate: -4.51 }, 0.5, "pts");
  assert.match(down, /<svg/);
  assert.doesNotMatch(down, bad);
  assert.match(down, /from no limit yet to -2\.5 pts/);
  assert.match(intervalChart({ lower: -Infinity, upper: Infinity }, 0.5, "pts"), /^<div class="chart-empty">No interval yet: it can appear from block 8 at the earliest\.<\/div>$/);
  const h = historyChart([{ blocks: 2, lower: -3, upper: 4, estimate: 0.5 }, { blocks: 3, lower: -1, upper: 3, estimate: 1 }, { blocks: 4, lower: -0.5, upper: Infinity, estimate: 1.1 }], 0.5);
  assert.match(h, /<svg/);
  assert.doesNotMatch(h, bad);
  const lowOpen = historyChart([{ blocks: 2, lower: -Infinity, upper: -1, estimate: -2 }, { blocks: 3, lower: -Infinity, upper: -1.5, estimate: -2.2 }], 0.5);
  assert.match(lowOpen, /<svg/);
  assert.doesNotMatch(lowOpen, bad);
  assert.match(historyChart([{ blocks: 2, lower: -Infinity, upper: -1, estimate: -2 }], 0.5), /^<div class="chart-empty">Evidence over time appears from block 9 at the earliest\.<\/div>$/);
});

test("finite intervals render unchanged", async () => {
  const { intervalChart } = await import("../src/app/charts.js");
  const out = intervalChart({ lower: -1, upper: 2, estimate: 0.5 }, 0.5, "pts");
  assert.match(out, /from -1\.0 to 2\.0 pts/);
  assert.equal(out.match(/class="ci"/g).length, 3);
});
