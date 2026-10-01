// Hand-built SVG charts. Every number shown comes from the experiment's own data.
const W = 640;
const fmt = (v) => (Math.abs(v) >= 10 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(1) : v.toFixed(2));

/** The answer: the effect interval against the "too small to matter" zone. */
export function intervalChart(cs, mme, unit) {
  const H = 120, pad = 28;
  if (!Number.isFinite(cs.lower)) return `<div class="chart-empty">The interval appears after two complete blocks.</div>`;
  const lo = Math.min(cs.lower, -mme) , hi = Math.max(cs.upper, mme), span = (hi - lo) * 1.25 || 1, mid = (hi + lo) / 2;
  const a = mid - span / 2, b = mid + span / 2, x = (v) => pad + ((v - a) / (b - a)) * (W - 2 * pad);
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Effect interval from ${fmt(cs.lower)} to ${fmt(cs.upper)} ${unit}">
  <rect x="${x(-mme)}" y="18" width="${x(mme) - x(-mme)}" height="62" class="zone"/>
  <text x="${(x(-mme) + x(mme)) / 2}" y="14" class="zone-label" text-anchor="middle">too small to matter (±${fmt(mme)})</text>
  <line x1="${x(0)}" x2="${x(0)}" y1="18" y2="80" class="zero"/>
  <line x1="${x(cs.lower)}" x2="${x(cs.upper)}" y1="49" y2="49" class="ci"/>
  <line x1="${x(cs.lower)}" x2="${x(cs.lower)}" y1="40" y2="58" class="ci"/>
  <line x1="${x(cs.upper)}" x2="${x(cs.upper)}" y1="40" y2="58" class="ci"/>
  <circle cx="${x(cs.estimate)}" cy="49" r="6" class="est"/>
  <text x="${pad}" y="104" class="axis">← worse</text>
  <text x="${W - pad}" y="104" class="axis" text-anchor="end">better →</text>
  <text x="${x(cs.lower)}" y="74" class="val" text-anchor="middle">${fmt(cs.lower)}</text>
  <text x="${x(cs.upper)}" y="74" class="val" text-anchor="middle">${fmt(cs.upper)}</text>
  <text x="${x(0)}" y="96" class="axis" text-anchor="middle">0</text>
</svg>`;
}

/** Evidence over time: the interval narrowing block by block (safe to watch: it's anytime-valid). */
export function historyChart(history, mme) {
  const pts = history.filter((h) => Number.isFinite(h.lower));
  if (pts.length < 2) return `<div class="chart-empty">Evidence over time appears after three complete blocks.</div>`;
  const H = 180, pl = 36, pr = 12, pt = 10, pb = 26;
  // scale to the meaningful range (the first blocks' very wide intervals are clamped at the edge)
  const last = pts[pts.length - 1], R = Math.max(3 * mme, Math.abs(last.lower) * 1.4, Math.abs(last.upper) * 1.4);
  const y0 = -R, y1 = R, n = last.blocks;
  const x = (b) => pl + ((b - pts[0].blocks) / Math.max(1, n - pts[0].blocks)) * (W - pl - pr);
  const y = (v) => pt + (1 - (Math.max(y0, Math.min(y1, v)) - y0) / (y1 - y0 || 1)) * (H - pt - pb);
  const band = pts.map((p) => `${x(p.blocks)},${y(p.upper)}`).concat(pts.slice().reverse().map((p) => `${x(p.blocks)},${y(p.lower)}`)).join(" ");
  const est = pts.map((p) => `${x(p.blocks)},${y(p.estimate)}`).join(" ");
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Effect interval narrowing over ${n} blocks">
  <polygon points="${band}" class="band"/>
  <polyline points="${est}" class="est-line"/>
  <line x1="${pl}" x2="${W - pr}" y1="${y(0)}" y2="${y(0)}" class="zero"/>
  <line x1="${pl}" x2="${W - pr}" y1="${y(mme)}" y2="${y(mme)}" class="mme"/>
  <line x1="${pl}" x2="${W - pr}" y1="${y(-mme)}" y2="${y(-mme)}" class="mme"/>
  <text x="${pl - 6}" y="${y(mme) + 4}" class="axis" text-anchor="end">+${fmt(mme)}</text>
  <text x="${pl - 6}" y="${y(0) + 4}" class="axis" text-anchor="end">0</text>
  <text x="${pl - 6}" y="${y(-mme) + 4}" class="axis" text-anchor="end">−${fmt(mme)}</text>
  <text x="${pl}" y="${H - 6}" class="axis">block ${pts[0].blocks}</text>
  <text x="${W - pr}" y="${H - 6}" class="axis" text-anchor="end">block ${n}</text>
</svg>`;
}

/** Every day: the assigned condition (band) and the logged value (dot). */
export function timelineChart(days, entries) {
  const H = 170, pl = 36, pr = 12, pt = 10, pb = 22, n = days.length;
  const vals = days.map((d) => entries[d.iso]?.value).filter(Number.isFinite);
  if (!vals.length) return `<div class="chart-empty">Your daily readings will appear here.</div>`;
  const y0 = Math.min(...vals), y1 = Math.max(...vals), padY = (y1 - y0) * 0.15 || 1;
  const x = (i) => pl + ((i + 0.5) / n) * (W - pl - pr), cw = (W - pl - pr) / n;
  const y = (v) => pt + (1 - (v - (y0 - padY)) / (y1 - y0 + 2 * padY)) * (H - pt - pb);
  const bands = days.map((d, i) => `<rect x="${pl + i * cw}" y="${pt}" width="${cw + 0.5}" height="${H - pt - pb}" class="band-${d.arm}"/>`).join("");
  const dots = days.map((d, i) => { const e = entries[d.iso]; return e ? `<circle cx="${x(i)}" cy="${y(e.value)}" r="${Math.max(2.2, Math.min(4, cw / 3))}" class="dot-${d.arm}${e.followed === false ? " off" : ""}"/>` : ""; }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Daily readings by condition">
  ${bands}${dots}
  <text x="${pl - 6}" y="${y(y1) + 4}" class="axis" text-anchor="end">${fmt(y1)}</text>
  <text x="${pl - 6}" y="${y(y0) + 4}" class="axis" text-anchor="end">${fmt(y0)}</text>
  <text x="${pl}" y="${H - 5}" class="axis">${days[0].iso}</text>
  <text x="${W - pr}" y="${H - 5}" class="axis" text-anchor="end">${days[n - 1].iso}</text>
</svg>`;
}
