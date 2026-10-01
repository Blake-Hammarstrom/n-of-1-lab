// Experiment model, pre-registration and analysis view-model. Pure functions: no DOM, no storage, no network.
import { makeSchedule, periodOn, daysIn, toISO } from "../engine/schedule.js";
import { blockDiffs, confidenceSequence, verdict } from "../engine/stats.js";
import { diffSd } from "../engine/planner.js";

export const SCHEMA = 1;

/** The fields that ARE the pre-registration. Changing any of them after start would change the experiment. */
export function protocolOf(p) {
  return {
    question: String(p.question).trim(),
    aLabel: String(p.aLabel).trim(), bLabel: String(p.bLabel).trim(),
    outcome: { name: String(p.outcome.name).trim(), unit: String(p.outcome.unit || "").trim(),
      better: p.outcome.better === "lower" ? "lower" : "higher", resolution: Number(p.outcome.resolution) || 0 },
    mme: Number(p.mme), daySd: Number(p.daySd), periodDays: Number(p.periodDays), blocks: Number(p.blocks),
    alpha: 0.05, start: p.start, seed: p.seed,
  };
}

export function validateProtocol(p) {
  const errors = [];
  if (!p.question) errors.push("Write the question you want answered.");
  if (!p.aLabel || !p.bLabel) errors.push("Name both conditions.");
  if (p.aLabel && p.aLabel === p.bLabel) errors.push("The two conditions need different names.");
  if (!p.outcome.name) errors.push("Name the outcome you'll measure.");
  if (!(p.mme > 0)) errors.push("Set the smallest change that would matter to you (greater than 0).");
  if (!(p.daySd > 0)) errors.push("Estimate how much the outcome varies day to day (greater than 0).");
  if (!(p.periodDays >= 1 && p.periodDays <= 14)) errors.push("Periods must be 1 to 14 days.");
  if (!(p.blocks >= 4 && p.blocks <= 60)) errors.push("Plan 4 to 60 blocks.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.start || "")) errors.push("Pick a start date.");
  return errors;
}

/** Canonical JSON (sorted keys) so the same protocol always hashes the same. */
export function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
  return JSON.stringify(v);
}

export async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Start = lock. The protocol is hashed and timestamped; it can't be edited afterwards, only stopped. */
export async function createExperiment(input, now = new Date()) {
  const id = `e-${now.getTime().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const protocol = protocolOf({ ...input, seed: input.seed || id });
  const errors = validateProtocol(protocol);
  if (errors.length) throw new Error(errors.join(" "));
  return {
    schema: SCHEMA, id, createdAt: now.toISOString(), status: "running", protocol,
    prereg: { hash: await sha256(canonical(protocol)), lockedAt: now.toISOString() },
    entries: {},
  };
}

export async function verifyPrereg(exp) {
  return (await sha256(canonical(exp.protocol))) === exp.prereg.hash;
}

export function logValue(exp, iso, value, followed = true, note = "") {
  if (exp.status !== "running") throw new Error("This experiment is no longer running.");
  const v = Number(value);
  if (!Number.isFinite(v)) throw new Error("Enter a number.");
  const sched = schedule(exp);
  if (!periodOn(sched, iso)) throw new Error("That day isn't part of the experiment.");
  return { ...exp, entries: { ...exp.entries, [iso]: { value: v, followed: !!followed, note: String(note).slice(0, 280), at: new Date().toISOString() } } };
}

export const schedule = (exp) => makeSchedule(exp.protocol);

/** Everything the experiment screen shows, computed from the protocol and the entries only. */
export function analyze(exp, todayIso = toISO(Date.now())) {
  const p = exp.protocol, sched = schedule(exp);
  const values = Object.fromEntries(Object.entries(exp.entries).map(([d, e]) => [d, e.value]));
  const raw = blockDiffs(sched, values);
  const sign = p.outcome.better === "lower" ? -1 : 1; // benefit-oriented: positive = the B condition helps
  const benefit = raw.map((x) => sign * x.d);
  const scale0 = diffSd(p.daySd, p.periodDays);
  const cs = confidenceSequence(benefit, { alpha: p.alpha, scale0 });
  const v = verdict(cs, p.mme, { blocks: benefit.length, plannedBlocks: p.blocks });
  const history = benefit.map((_, i) => ({ blocks: i + 1, ...confidenceSequence(benefit.slice(0, i + 1), { alpha: p.alpha, scale0 }) }));
  const allDays = sched.flatMap((per) => daysIn(per).map((iso) => ({ iso, arm: per.arm, block: per.block })));
  const past = allDays.filter((d) => d.iso <= todayIso);
  const logged = past.filter((d) => exp.entries[d.iso]);
  const followed = logged.filter((d) => exp.entries[d.iso].followed !== false);
  const today = periodOn(sched, todayIso);
  const end = sched[sched.length - 1].end;
  return {
    schedule: sched, days: allDays, today, todayArm: today ? today.arm : null,
    started: todayIso >= p.start, finished: todayIso > end, end,
    completeBlocks: benefit.length, plannedBlocks: p.blocks,
    loggedDays: logged.length, pastDays: past.length, missingDays: past.filter((d) => !exp.entries[d.iso]).map((d) => d.iso),
    adherence: logged.length ? followed.length / logged.length : null,
    cs, verdict: v, history,
    decisive: ["meaningful-benefit", "meaningful-harm", "no-meaningful-effect"].includes(v.key),
  };
}

/** Export/import: one JSON document; import validates shape and the pre-registration hash. */
export function exportData(experiments) {
  return JSON.stringify({ app: "n-of-1-lab", schema: SCHEMA, exportedAt: new Date().toISOString(), experiments }, null, 2);
}

export async function importData(text) {
  const doc = JSON.parse(text);
  if (doc.app !== "n-of-1-lab" || !Array.isArray(doc.experiments)) throw new Error("Not an N-of-1 Lab export.");
  for (const e of doc.experiments) {
    if (!e.protocol || !e.prereg || typeof e.entries !== "object") throw new Error("An experiment in the file is incomplete.");
    if (!(await verifyPrereg(e))) throw new Error(`"${e.protocol.question}" was edited after it was pre-registered.`);
  }
  return doc.experiments;
}
