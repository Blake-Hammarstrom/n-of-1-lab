// Experiment model, pre-registration and analysis view-model. Pure functions: no DOM, no storage, no network.
import { makeSchedule, periodOn, daysIn, toISO, fromISO } from "../engine/schedule.js";
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
  if (!Number.isInteger(p.blocks) || !(p.blocks >= 4 && p.blocks <= 60)) errors.push("Plan 4 to 60 blocks.");
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
  const blank = value == null || (typeof value === "string" && value.trim() === "");
  const v = blank ? NaN : Number(value);
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

/** One row per planned block: A and B means/days logged, and diff = B − A (negated when lower is better, so positive is always better). */
export function blockTable(exp) {
  const p = exp.protocol, sched = schedule(exp), flip = p.outcome.better === "lower";
  const stat = (per) => {
    const vs = daysIn(per).map((iso) => exp.entries[iso]?.value).filter((v) => Number.isFinite(v));
    return { mean: vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null, days: vs.length };
  };
  const rows = Array.from({ length: p.blocks }, (_, i) => ({ block: i + 1, aMean: null, bMean: null, aDays: 0, bDays: 0, diff: null }));
  for (const per of sched) {
    const row = rows[per.block], { mean, days } = stat(per);
    if (!row) continue;
    if (per.arm === "A") { row.aMean = mean; row.aDays = days; } else { row.bMean = mean; row.bDays = days; }
  }
  for (const r of rows) if (r.aMean != null && r.bMean != null) r.diff = flip ? r.aMean - r.bMean : r.bMean - r.aMean;
  return rows;
}

/** Plain-text record of the plan and current result, for pasting into notes. Ten lines, each ending in a newline. */
export function resultSummary(exp, todayIso = toISO(Date.now())) {
  const p = protocolOf(exp.protocol), a = analyze(exp, todayIso), o = p.outcome;
  const unit = o.unit ? ` ${o.unit}` : "";
  const lo = Number.isFinite(a.cs.lower), hi = Number.isFinite(a.cs.upper);
  const interval = !lo && !hi ? "not available yet"
    : `${lo ? a.cs.lower.toFixed(2) : "no limit"} to ${hi ? a.cs.upper.toFixed(2) : "no limit"}${unit}`;
  const status = exp.status === "stopped" && exp.stop
    ? `stopped ${String(exp.stop.at).slice(0, 10)}${exp.stop.reason ? ` (${exp.stop.reason})` : ""}` : exp.status;
  return [
    `Question: ${p.question}`,
    `A: ${p.aLabel}`,
    `B: ${p.bLabel}`,
    `Outcome: ${o.name}${o.unit ? ` (${o.unit})` : ""}, ${o.better} is better; smallest meaningful change ${p.mme}`,
    `Design: ${p.blocks} blocks of two ${p.periodDays}-day periods from ${p.start}`,
    `Progress: ${a.completeBlocks} of ${a.plannedBlocks} blocks complete; ${a.loggedDays} of ${a.pastDays} days logged; followed ${a.adherence == null ? "n/a" : `${Math.round(a.adherence * 100)}%`}`,
    `Verdict: ${a.verdict.label}`,
    `Effect of B vs A (positive = better), 95% anytime-valid interval: ${interval}`,
    `Pre-registration: locked ${exp.prereg.lockedAt.slice(0, 16).replace("T", " ")} UTC, fingerprint ${exp.prereg.hash.slice(0, 16)}`,
    `Status: ${status}`,
  ].map((l) => `${l}\n`).join("");
}

const CSV_HEADER = "date,block,condition,value,followed,note";

function csvCell(v, guard = false) {
  let s = String(v);
  if (guard && /^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV of the logged days in date order (RFC 4180 quoting, LF line ends). Text cells starting with = + - @ get a leading apostrophe. */
export function entriesCSV(exp) {
  const p = exp.protocol, lines = [CSV_HEADER];
  for (const per of schedule(exp)) {
    for (const iso of daysIn(per)) {
      const e = exp.entries[iso];
      if (!e) continue;
      lines.push([iso, per.block + 1, csvCell(per.arm === "A" ? p.aLabel : p.bLabel, true), csvCell(e.value), e.followed === false ? "no" : "yes", csvCell(e.note ?? "", true)].map((c, i) => (i === 0 || i === 1 ? String(c) : c)).join(","));
    }
  }
  return lines.join("\n") + "\n";
}

const icsText = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");
const icsDate = (iso) => iso.replace(/-/g, "");

/** Fold a content line at 75 octets (CRLF + space), never splitting a UTF-8 character. */
function icsFold(line) {
  const enc = new TextEncoder(), parts = [];
  let cur = "", n = 0;
  for (const ch of line) {
    const w = enc.encode(ch).length;
    if (n + w > 75) { parts.push(cur); cur = " "; n = 1; }
    cur += ch; n += w;
  }
  parts.push(cur);
  return parts.join("\r\n");
}

/** iCalendar (RFC 5545) with one all-day event per scheduled day, in date order. DTSTAMP comes from prereg.lockedAt so output is deterministic. */
export function scheduleICS(exp) {
  const p = exp.protocol, days = [];
  for (const per of schedule(exp)) for (const iso of daysIn(per)) days.push([iso, per.arm === "A" ? p.aLabel : p.bLabel]);
  const stamp = new Date(exp.prereg.lockedAt).toISOString().replace(/\.\d{3}Z$/, "Z").replace(/[-:]/g, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//n-of-1-lab//schedule//EN", "CALSCALE:GREGORIAN"];
  days.forEach(([iso, label], i) => {
    lines.push("BEGIN:VEVENT", `UID:${exp.id}-${icsDate(iso)}@n-of-1-lab`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(iso)}`, `DTEND;VALUE=DATE:${icsDate(toISO(fromISO(iso) + 86400000))}`,
      `SUMMARY:${icsText(label)}: log ${icsText(p.outcome.name)} (day ${i + 1} of ${days.length})`, "END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  return lines.map(icsFold).join("\r\n") + "\r\n";
}

/** Export/import: one JSON document; import validates shape and the pre-registration hash. */
export function exportData(experiments) {
  return JSON.stringify({ app: "n-of-1-lab", schema: SCHEMA, exportedAt: new Date().toISOString(), experiments }, null, 2);
}

export async function importData(text) {
  const doc = JSON.parse(text);
  if (doc.app !== "n-of-1-lab" || !Array.isArray(doc.experiments)) throw new Error("Not an N-of-1 Lab export.");
  for (const e of doc.experiments) {
    const isObject = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
    if (!isObject(e) || !e.protocol || !e.prereg || !isObject(e.entries) || !Object.values(e.entries).every(isObject)) {
      throw new Error("An experiment in the file is incomplete.");
    }
    if (!(await verifyPrereg(e))) throw new Error(`"${e.protocol.question}" was edited after it was pre-registered.`);
  }
  return doc.experiments;
}
