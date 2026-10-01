// N-of-1 Lab UI. Local-first: experiments live in this browser's storage and never leave the device.
import { analyze, createExperiment, exportData, importData, logValue, verifyPrereg } from "./model.js";
import { blocksNeeded, power, resolutionCheck } from "../engine/planner.js";
import { toISO } from "../engine/schedule.js";
import { historyChart, intervalChart, timelineChart } from "./charts.js";
import { sampleExperiment } from "./sample.js";

const KEY = "n1lab.experiments.v1";
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const today = () => toISO(Date.now() - new Date().getTimezoneOffset() * 60000);
const app = $("#app");

// ── storage ─────────────────────────────────────────────────────────────────────────────────────────
function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
function save(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch { toast("Couldn't save: this browser blocked storage."); return false; }
}
const find = (id) => load().find((e) => e.id === id);
function put(exp) { const list = load().filter((e) => e.id !== exp.id); list.unshift(exp); save(list); }

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove("show"), 3200);
}

const VERDICT_COPY = {
  "collecting": "Keep logging. The answer needs at least two complete blocks.",
  "keep-going": "Not decisive yet. Keep going: checking every day is safe with this method.",
  "meaningful-benefit": "The whole interval is beyond the smallest change you said would matter. You can stop here.",
  "meaningful-harm": "The whole interval is worse than the smallest change that matters. You can stop here.",
  "benefit-unclear-size": "It helps, but the interval still includes changes too small to matter.",
  "harm-unclear-size": "It's worse, but the interval still includes changes too small to matter.",
  "no-meaningful-effect": "Any effect is smaller than what you said would matter. You can stop here.",
  "inconclusive": "The planned length is done and the evidence is still mixed. That's a real result: the effect, if any, is hard to see at this size.",
};
const tone = (k) => (k.includes("benefit") ? "good" : k.includes("harm") ? "bad" : k === "no-meaningful-effect" ? "neutral" : "pending");

// ── views ──────────────────────────────────────────────────────────────────────────────────────────
function home() {
  const list = load();
  const cards = list.map((e) => {
    const a = analyze(e, today()), p = e.protocol;
    const pct = Math.round((100 * a.completeBlocks) / a.plannedBlocks);
    return `<a class="card exp" href="#/e/${esc(e.id)}">
      <div class="row"><span class="chip ${tone(a.verdict.key)}">${esc(a.verdict.label)}</span><span class="muted">${esc(e.status)}</span></div>
      <h3>${esc(p.question)}</h3>
      <div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>
      <div class="row muted small"><span>${a.completeBlocks} of ${a.plannedBlocks} blocks</span>${a.todayArm && e.status === "running" ? `<span>Today: <b class="arm-${a.todayArm}">${esc(a.todayArm === "A" ? p.aLabel : p.bLabel)}</b></span>` : ""}</div>
    </a>`;
  }).join("");
  app.innerHTML = `
  <section class="hero">
    <h1>Does it actually work for you?</h1>
    <p class="lede">Run a real experiment on yourself: randomized, pre-registered, and safe to check every day.</p>
    <div class="actions"><a class="btn primary" href="#/new">Design an experiment</a><a class="btn" href="#/sample">See a sample result</a></div>
  </section>
  ${list.length ? `<section><h2 class="section">Your experiments</h2><div class="grid">${cards}</div></section>` : `
  <section class="steps">
    <div><b>1 · Plan</b><p>Pick one change, one outcome, and the smallest difference that would matter. The planner tells you how long to run.</p></div>
    <div><b>2 · Randomize</b><p>The app assigns each period to "with" or "without" at random, so trends and moods can't masquerade as an effect.</p></div>
    <div><b>3 · Know</b><p>An anytime-valid interval tells you when the answer is clear, or that there isn't one.</p></div>
  </section>`}
  <section class="io">
    <button class="btn ghost" id="export" ${list.length ? "" : "disabled"}>Export backup</button>
    <label class="btn ghost">Import backup<input type="file" id="import" accept="application/json" hidden></label>
  </section>`;
  $("#export").onclick = () => {
    const url = URL.createObjectURL(new Blob([exportData(load())], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `n-of-1-lab-${today()}.json` });
    a.click(); URL.revokeObjectURL(url);
  };
  $("#import").onchange = async (ev) => {
    try {
      const incoming = await importData(await ev.target.files[0].text());
      const byId = new Map(load().map((e) => [e.id, e]));
      incoming.forEach((e) => byId.set(e.id, e));
      save([...byId.values()]); toast(`Imported ${incoming.length} experiment(s).`); home();
    } catch (err) { toast(err.message); }
  };
}

function newExperiment() {
  app.innerHTML = `
  <a class="back" href="#/">← All experiments</a>
  <h1 class="page">Design an experiment</h1>
  <form id="f" class="design" novalidate>
    <fieldset><legend>The question</legend>
      <label>What do you want to find out?<input name="question" required placeholder="Does cutting caffeine after noon improve my sleep score?"></label>
    </fieldset>
    <fieldset><legend>The two conditions</legend>
      <div class="two"><label>Without (your usual)<input name="aLabel" required placeholder="Caffeine any time"></label>
      <label>With (the change)<input name="bLabel" required placeholder="No caffeine after noon"></label></div>
    </fieldset>
    <fieldset><legend>The outcome</legend>
      <div class="two"><label>What you'll measure<input name="name" required placeholder="Sleep score"></label>
      <label>Unit<input name="unit" placeholder="points"></label></div>
      <div class="two"><label>Better is<select name="better"><option value="higher">Higher</option><option value="lower">Lower</option></select></label>
      <label>Smallest step your measure shows<input name="resolution" type="number" step="any" min="0" placeholder="1"></label></div>
    </fieldset>
    <fieldset><legend>What would matter</legend>
      <div class="two"><label>Smallest change that would matter to you<input name="mme" type="number" step="any" min="0" required placeholder="3"></label>
      <label>How much it varies day to day (typical spread)<input name="daySd" type="number" step="any" min="0" required placeholder="6"></label></div>
      <p class="hint">Not sure about the spread? Think of a typical week: about half the days fall within ± this amount of your average.</p>
    </fieldset>
    <fieldset><legend>Design</legend>
      <div class="two"><label>Period length<select name="periodDays"><option value="1">1 day</option><option value="2">2 days</option><option value="3" selected>3 days</option><option value="7">7 days</option></select></label>
      <label>Start date<input name="start" type="date" required value="${today()}"></label></div>
      <p class="hint">Longer periods suit changes that take time to wear off. Each block is one "with" period and one "without" period, in random order.</p>
    </fieldset>
    <aside class="planner card" id="plan" aria-live="polite"><p class="muted">Fill in the outcome numbers to see how long to run.</p></aside>
    <label class="blocks">Planned blocks<input name="blocks" type="number" min="4" max="60" required value="16"></label>
    <p class="lock">Starting <b>locks this plan</b> with a timestamped fingerprint. You can check every day and stop early when the answer is decisive. You can't quietly change the rules.</p>
    <div id="err" class="err" role="alert"></div>
    <button class="btn primary" type="submit">Lock plan &amp; start</button>
  </form>`;
  const f = $("#f");
  let timer;
  const values = () => Object.fromEntries(new FormData(f).entries());
  f.oninput = () => { clearTimeout(timer); timer = setTimeout(updatePlan, 250); };
  function updatePlan() {
    const v = values(), mme = Number(v.mme), daySd = Number(v.daySd), periodDays = Number(v.periodDays);
    if (!(mme > 0 && daySd > 0)) return;
    const rec = blocksNeeded({ mme, daySd, periodDays, sims: 300 });
    const chosen = Number(v.blocks), pw = chosen >= 4 ? power({ blocks: chosen, mme, daySd, periodDays, sims: 300 }) : null;
    const res = resolutionCheck(Number(v.resolution), mme);
    $("#plan").innerHTML = rec.blocks
      ? `<b>Recommended: ${rec.blocks} blocks</b> · ${rec.blocks * 2 * periodDays} days for an 80% chance of detecting a change of ${mme}.
         ${pw != null ? `<div class="muted">With ${chosen} blocks: about ${Math.round(pw * 100)}% chance.</div>` : ""}
         <button type="button" class="link" id="use">Use ${rec.blocks}</button>${res.ok ? "" : `<div class="warn">${esc(res.note)}</div>`}`
      : `<b>This change is hard to detect.</b> Even 40 blocks give only about ${Math.round(rec.power * 100)}% chance. Consider a bigger change, a less noisy measure, or longer periods.${res.ok ? "" : `<div class="warn">${esc(res.note)}</div>`}`;
    const use = $("#use");
    if (use) use.onclick = () => { f.blocks.value = rec.blocks; updatePlan(); };
  }
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    const v = values();
    try {
      const e = await createExperiment({ question: v.question, aLabel: v.aLabel, bLabel: v.bLabel,
        outcome: { name: v.name, unit: v.unit, better: v.better, resolution: v.resolution },
        mme: v.mme, daySd: v.daySd, periodDays: v.periodDays, blocks: v.blocks, start: v.start });
      put(e); location.hash = `#/e/${e.id}`;
    } catch (err) { $("#err").textContent = err.message; }
  };
}

async function experiment(exp, { readOnly = false } = {}) {
  if (!exp) { app.innerHTML = `<a class="back" href="#/">← All experiments</a><p>That experiment isn't on this device.</p>`; return; }
  const p = exp.protocol, t = today(), a = analyze(exp, readOnly ? "2026-07-03" : t);
  const label = (arm) => (arm === "A" ? p.aLabel : p.bLabel);
  const intact = await verifyPrereg(exp);
  const entry = exp.entries[t];
  const todayCard = readOnly ? "" : exp.status !== "running" ? `<div class="card today"><p class="muted">This experiment is ${esc(exp.status)}.</p></div>`
    : !a.started ? `<div class="card today"><span class="muted">Starts ${esc(p.start)}</span><p>Your first period is <b class="arm-${a.schedule[0].arm}">${esc(label(a.schedule[0].arm))}</b>.</p></div>`
    : a.finished ? `<div class="card today"><b>The planned length is complete.</b><p class="muted">Log any missing days, then read your result below.</p></div>`
    : `<div class="card today">
        <span class="muted">Today · block ${a.today.block + 1} of ${p.blocks}</span>
        <div class="arm-big arm-${a.todayArm}">${esc(label(a.todayArm))}</div>
        <form id="log" class="log">
          <label>${esc(p.outcome.name)}${p.outcome.unit ? ` (${esc(p.outcome.unit)})` : ""}<input name="value" type="number" step="any" required value="${entry ? esc(entry.value) : ""}" inputmode="decimal"></label>
          <label class="check"><input type="checkbox" name="followed" ${entry && entry.followed === false ? "" : "checked"}> I followed today's assignment</label>
          <button class="btn primary">${entry ? "Update" : "Log today"}</button>
        </form>
      </div>`;
  const missing = readOnly || exp.status !== "running" ? [] : a.missingDays.filter((d) => d !== t).slice(-7);
  app.innerHTML = `
  <a class="back" href="${readOnly ? "#/" : "#/"}">← All experiments</a>
  ${readOnly ? `<div class="banner">Sample result · <b>simulated data</b>, not a real person's experiment</div>` : ""}
  <header class="exp-head">
    <h1 class="page">${esc(p.question)}</h1>
    <p class="muted">${esc(p.aLabel)} vs ${esc(p.bLabel)} · ${esc(p.outcome.name)} (${p.outcome.better} is better) · ${p.periodDays}-day periods</p>
  </header>
  ${todayCard}
  ${missing.length ? `<div class="card missing"><b>Missing days</b><div class="miss-list">${missing.map((d) => `<button class="btn ghost small" data-day="${d}">${d}</button>`).join("")}</div></div>` : ""}
  <section class="card verdict ${tone(a.verdict.key)}">
    <span class="chip ${tone(a.verdict.key)}">${esc(a.verdict.label)}</span>
    <p>${esc(VERDICT_COPY[a.verdict.key])}</p>
    ${intervalChart(a.cs, p.mme, p.outcome.unit)}
    <p class="muted small">Effect of “${esc(p.bLabel)}” vs “${esc(p.aLabel)}” on ${esc(p.outcome.name)}, oriented so right is better. 95% anytime-valid interval${Number.isFinite(a.cs.lower) ? `: ${a.cs.lower.toFixed(2)} to ${a.cs.upper.toFixed(2)} ${esc(p.outcome.unit)}` : ""}.</p>
  </section>
  <div class="stats">
    <div><b>${a.completeBlocks}<span>/${a.plannedBlocks}</span></b><span>blocks complete</span></div>
    <div><b>${a.loggedDays}<span>/${a.pastDays}</span></b><span>days logged</span></div>
    <div><b>${a.adherence == null ? "–" : `${Math.round(a.adherence * 100)}%`}</b><span>followed assignment</span></div>
  </div>
  <section class="card"><h2 class="section">Evidence over time</h2>${historyChart(a.history, p.mme)}<p class="muted small">The shaded band is the interval after each block. Dashed lines are your smallest meaningful change.</p></section>
  <section class="card"><h2 class="section">Every day</h2>${timelineChart(a.days.filter((d) => readOnly || d.iso <= t), exp.entries)}
    <p class="legend"><span class="sw A"></span>${esc(p.aLabel)} <span class="sw B"></span>${esc(p.bLabel)}</p></section>
  <section class="card prereg"><h2 class="section">Pre-registration</h2>
    <p>Locked ${esc(exp.prereg.lockedAt.slice(0, 16).replace("T", " "))} UTC · fingerprint <code>${esc(exp.prereg.hash.slice(0, 16))}…</code> ·
    ${intact ? `<span class="ok">plan unchanged since locking</span>` : `<span class="bad">plan was edited after locking</span>`}</p>
    <p class="muted small">Planned: ${p.blocks} blocks, smallest meaningful change ${p.mme}, expected daily spread ${p.daySd}, α = ${p.alpha}. Analysis: each period is averaged first, so days aren't treated as independent.</p>
  </section>
  ${readOnly ? "" : `<div class="danger"><button class="btn ghost" id="stop" ${exp.status !== "running" ? "disabled" : ""}>Stop experiment</button><button class="btn ghost" id="del">Delete</button></div>`}`;
  if (readOnly) return;
  const lf = $("#log");
  if (lf) lf.onsubmit = (ev) => {
    ev.preventDefault();
    try { put(logValue(exp, t, lf.value.value, lf.followed.checked)); toast("Logged."); route(); } catch (err) { toast(err.message); }
  };
  app.querySelectorAll("[data-day]").forEach((b) => (b.onclick = () => {
    const v = prompt(`${p.outcome.name} on ${b.dataset.day}?`);
    if (v == null || v === "") return;
    try { put(logValue(exp, b.dataset.day, v, true)); route(); } catch (err) { toast(err.message); }
  }));
  $("#stop").onclick = () => {
    const why = prompt(a.decisive ? "Stop now? The result is decisive. Note why (optional):" : "Stop before the evidence is decisive? This is recorded. Why?");
    if (why == null) return;
    put({ ...exp, status: "stopped", stop: { at: new Date().toISOString(), reason: why, decisive: a.decisive, verdict: a.verdict.key } });
    route();
  };
  $("#del").onclick = () => { if (confirm("Delete this experiment and its data from this device?")) { save(load().filter((e) => e.id !== exp.id)); location.hash = "#/"; } };
}

async function route() {
  const h = location.hash || "#/";
  window.scrollTo(0, 0);
  if (h === "#/new") return newExperiment();
  if (h === "#/sample") return experiment(await sampleExperiment(), { readOnly: true });
  const m = h.match(/^#\/e\/(.+)$/);
  if (m) return experiment(find(decodeURIComponent(m[1])));
  return home();
}
window.addEventListener("hashchange", route);
route();
