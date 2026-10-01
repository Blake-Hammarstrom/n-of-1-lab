// Monte Carlo method validation, exactly as fixed in docs/VALIDATION_PROTOCOL.md (2026-10-01).
// Writes reports/validation.json and reports/validation.md. Synthetic data: method verification, not usefulness.
import { writeFileSync } from "node:fs";
import { makeSchedule, daysIn } from "../src/engine/schedule.js";
import { bet, blockDiffs, tTestP } from "../src/engine/stats.js";
import { blocksNeeded, diffSd } from "../src/engine/planner.js";
import { normal, rng } from "../src/engine/rng.js";

const SIMS = Number(process.env.SIMS || 4000), BLOCKS = 30, EFFECT = 0.7, ALPHA = 0.05;
const LIMIT = 0.05 + 2 * Math.sqrt((0.05 * 0.95) / SIMS);

const t3 = (r) => normal(r) / Math.sqrt((normal(r) ** 2 + normal(r) ** 2 + normal(r) ** 2) / 3) / Math.sqrt(3);
const NOISE = {
  iid: (r) => { return () => normal(r); },
  t3: (r) => { return () => t3(r); },
  ar: (r) => { let e = normal(r); return () => (e = 0.7 * e + Math.sqrt(1 - 0.49) * normal(r)); },
  trend: (r) => { let day = 0; return () => 0.05 * day++ + normal(r); },
  skew: (r) => { const mu = Math.exp(0.32); return () => (Math.exp(0.8 * normal(r)) - mu) / 1.0; },
  coarse: (r) => { return () => Math.round(0.8 * normal(r)); },
};
const SCENARIOS = [
  ["S1", "iid", 1], ["S2", "t3", 1], ["S3", "ar", 1], ["S4", "trend", 1],
  ["S5", "skew", 1], ["S6", "coarse", 1], ["S7", "iid", 3], ["S8", "ar", 3],
];

function simulate(r, noiseKind, periodDays, effect) {
  const schedule = makeSchedule({ seed: Math.floor(r() * 2 ** 31), blocks: BLOCKS, periodDays, start: "2026-01-01" });
  const noise = NOISE[noiseKind](r), values = {};
  for (const p of schedule) for (const iso of daysIn(p)) values[iso] = noise() + (p.arm === "B" ? effect : 0);
  return blockDiffs(schedule, values).map((x) => x.d);
}

function beforeAfter(r, noiseKind) { // observational: 30 days without, then 30 days with; days treated as independent
  const noise = NOISE[noiseKind](r), a = [], b = [];
  for (let i = 0; i < 30; i++) a.push(noise());
  for (let i = 0; i < 30; i++) b.push(noise());
  const m = (x) => x.reduce((s, v) => s + v, 0) / x.length, v = (x) => x.reduce((s, y) => s + (y - m(x)) ** 2, 0) / (x.length - 1);
  const tstat = (m(b) - m(a)) / Math.sqrt(v(a) / a.length + v(b) / b.length);
  return Math.abs(tstat) > 2.0; // ≈ two-sided 0.05 at ~58 df
}

const t0 = Date.now(), rows = [];
SCENARIOS.forEach(([id, noise, period], idx) => {
  const r = rng(20261001 + idx);
  let fp = 0, naive = 0, miss = 0, power = 0, ba = 0;
  for (let s = 0; s < SIMS; s++) {
    const d0 = simulate(r, noise, period, 0);
    if (bet(d0, 0, { alpha: ALPHA, scale0: 1 }).rejected) fp++;
    let peekReject = false;
    for (let n = 3; n <= d0.length && !peekReject; n++) if (tTestP(d0.slice(0, n)) < ALPHA) peekReject = true;
    if (peekReject) naive++;
    if (beforeAfter(r, noise)) ba++;
    const d1 = simulate(r, noise, period, EFFECT);
    if (bet(d1, EFFECT, { alpha: ALPHA, scale0: 1 }).rejected) miss++; // interval ever excluded the true effect
    if (bet(d1, 0, { alpha: ALPHA, scale0: 1 }).rejected) power++;
  }
  rows.push({ id, noise, periodDays: period, falsePositive: fp / SIMS, everExcludedTruth: miss / SIMS,
    powerAt30Blocks: power / SIMS, baselineNaivePeekingT: naive / SIMS, baselineBeforeAfter: ba / SIMS });
  console.log(id, rows[rows.length - 1]);
});

// V3: planner promise vs simulation at the planner's recommended length
function simPower(noise, period, blocks, r) {
  let hit = 0;
  for (let s = 0; s < SIMS; s++) {
    const schedule = makeSchedule({ seed: Math.floor(r() * 2 ** 31), blocks, periodDays: period, start: "2026-01-01" });
    const nz = NOISE[noise](r), values = {};
    for (const p of schedule) for (const iso of daysIn(p)) values[iso] = nz() + (p.arm === "B" ? EFFECT : 0);
    if (bet(blockDiffs(schedule, values).map((x) => x.d), 0, { alpha: ALPHA, scale0: diffSd(1, period) }).rejected) hit++;
  }
  return hit / SIMS;
}
const plan = blocksNeeded({ mme: EFFECT, daySd: 1, periodDays: 3, maxBlocks: 60 });
const planner = [["S7", "iid"], ["S2-3day", "t3"]].map(([id, noise], i) => {
  const sim = simPower(noise, 3, plan.blocks, rng(20261101 + i));
  return { id, recommendedBlocks: plan.blocks, plannerPower: plan.power, simulatedPower: sim, gap: Math.abs(plan.power - sim) };
});

const v1 = rows.every((x) => x.falsePositive <= LIMIT), v2 = rows.every((x) => x.everExcludedTruth <= LIMIT);
const v3 = planner.every((x) => x.gap <= 0.1);
const out = {
  protocol: "docs/VALIDATION_PROTOCOL.md (fixed 2026-10-01)", evidence: "method verification on synthetic data (rung 2)",
  ranAt: new Date().toISOString(), sims: SIMS, limit: LIMIT, scenarios: rows, planner,
  criteria: { V1_false_positives: v1 ? "met" : "not met", V2_coverage: v2 ? "met" : "not met", V3_planner: v3 ? "met" : "not met" },
  seconds: Math.round((Date.now() - t0) / 1000),
};
writeFileSync(new URL("../reports/validation.json", import.meta.url), JSON.stringify(out, null, 2));
const pct = (v) => `${(100 * v).toFixed(1)}%`;
writeFileSync(new URL("../reports/validation.md", import.meta.url), [
  "# Method validation (synthetic; method verification, not usefulness)", "",
  `Protocol: docs/VALIDATION_PROTOCOL.md · ${SIMS} simulated experiments per scenario · limit ${pct(LIMIT)} · run ${out.ranAt}`, "",
  "| Criterion | Result |", "|---|---|", ...Object.entries(out.criteria).map(([k, v]) => `| ${k} | ${v} |`), "",
  "| Scenario | Noise | Period | False positive (peeking) | Interval ever missed truth | Power @30 | Naive t, peeking | Before/after |",
  "|---|---|---|---|---|---|---|---|",
  ...rows.map((x) => `| ${x.id} | ${x.noise} | ${x.periodDays}d | ${pct(x.falsePositive)} | ${pct(x.everExcludedTruth)} | ${pct(x.powerAt30Blocks)} | ${pct(x.baselineNaivePeekingT)} | ${pct(x.baselineBeforeAfter)} |`),
  "", "| Planner check | Recommended blocks | Planner power | Simulated power | Gap |", "|---|---|---|---|---|",
  ...planner.map((x) => `| ${x.id} | ${x.recommendedBlocks} | ${pct(x.plannerPower)} | ${pct(x.simulatedPower)} | ${pct(x.gap)} |`), "",
].join("\n"));
console.log(out.criteria, `${out.seconds}s`);
