// Inference for a randomized block crossover with ONE person.
//
// Unit: each block yields one paired difference d = mean(B period) − mean(A period). Days are averaged inside
// their period first, so daily readings are never treated as independent samples (pseudoreplication guard).
//
// Test: under "no effect", the random A/B order makes each block's d symmetric around 0, whatever the trends,
// autocorrelation or distribution. We bet on it with a nonnegative martingale (test-by-betting):
//   x_b = clip((d_b − δ) / (C · s_b), −1, 1)   s_b: mean |d − δ| over PAST blocks only (scale0 for the first),
//                                              so x_b stays symmetric under H0
//   W = average over λ ∈ ±LAMBDAS of Π(1 + λ x_b)   (a mixture of martingales is a martingale)
// Ville's inequality: P(W ever ≥ 1/α) ≤ α under H0, so looking after every block is safe ("anytime-valid").
// Inverting over δ (assuming a constant additive effect) gives a confidence sequence for the effect.
// Settings frozen 2026-10-01 from a development comparison on iid-normal data only (docs/VALIDATION_PROTOCOL.md).

export const CLIP = 1.5;
export const LAMBDAS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];

/** Paired block differences (B − A) for blocks whose two periods both have data. */
export function blockDiffs(schedule, values) {
  const per = new Map();
  for (const p of schedule) {
    const vs = Object.entries(values)
      .filter(([iso]) => p.start <= iso && iso <= p.end)
      .map(([, v]) => v)
      .filter((v) => Number.isFinite(v));
    if (!per.has(p.block)) per.set(p.block, {});
    per.get(p.block)[p.arm] = vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
  }
  const out = [];
  for (const [block, m] of [...per.entries()].sort((a, b) => a[0] - b[0])) {
    if (m.A == null || m.B == null) continue;
    out.push({ block, d: m.B - m.A });
  }
  return out;
}

/** Runs the betting test of H0: effect = delta over the differences in order. */
export function bet(ds, delta = 0, { alpha = 0.05, scale0 = 1 } = {}) {
  const ks = LAMBDAS.flatMap((l) => [l, -l]).map((l) => ({ l, k: 1 }));
  let n = 0, sabs = 0, rejectedAt = -1;
  const path = [];
  for (let i = 0; i < ds.length; i++) {
    const z = ds[i] - delta, s = n ? sabs / n : scale0;
    const x = Math.max(-1, Math.min(1, z / (CLIP * (s || scale0))));
    let w = 0;
    for (const o of ks) { o.k *= 1 + o.l * x; w += o.k; }
    w /= ks.length;
    n++; sabs += Math.abs(z);
    path.push(w);
    if (rejectedAt < 0 && w >= 1 / alpha) rejectedAt = i;
  }
  return { wealth: path.length ? path[path.length - 1] : 1, path, rejectedAt, rejected: rejectedAt >= 0 };
}

/** Anytime-valid confidence sequence for the effect: the δ values never rejected so far. */
export function confidenceSequence(ds, { alpha = 0.05, scale0 = 1, grid = 241 } = {}) {
  if (ds.length < 2) return { lower: -Infinity, upper: Infinity, estimate: ds.length ? ds[0] : null };
  const lo = Math.min(...ds), hi = Math.max(...ds), pad = Math.max(hi - lo, scale0) * 1.5;
  const a = lo - pad, b = hi + pad, kept = [];
  for (let g = 0; g < grid; g++) {
    const delta = a + ((b - a) * g) / (grid - 1);
    if (!bet(ds, delta, { alpha, scale0 }).rejected) kept.push(delta);
  }
  const estimate = ds.reduce((s, d) => s + d, 0) / ds.length;
  if (!kept.length) return { lower: estimate, upper: estimate, estimate }; // numerically degenerate; collapse
  return { lower: kept[0], upper: kept[kept.length - 1], estimate };
}

/**
 * What the result supports, judged against the minimum meaningful effect (MME) the user fixed in advance.
 * "better" orientation: positive = the B condition helps.
 */
export function verdict(cs, mme, { blocks, plannedBlocks }) {
  const { lower, upper } = cs;
  if (!Number.isFinite(lower)) return { key: "collecting", label: "Collecting data" };
  if (lower >= mme) return { key: "meaningful-benefit", label: "Meaningful benefit" };
  if (upper <= -mme) return { key: "meaningful-harm", label: "Meaningfully worse" };
  if (lower > 0) return { key: "benefit-unclear-size", label: "Helps, but maybe not enough to matter" };
  if (upper < 0) return { key: "harm-unclear-size", label: "Worse, but maybe not enough to matter" };
  if (lower > -mme && upper < mme) return { key: "no-meaningful-effect", label: "No meaningful effect" };
  return blocks >= plannedBlocks
    ? { key: "inconclusive", label: "Inconclusive at the planned length" }
    : { key: "keep-going", label: "Not enough evidence yet" };
}

/** Classic paired t statistic, used only as a comparison baseline in the validation suite. */
export function tTestP(ds) {
  const n = ds.length;
  if (n < 2) return 1;
  const m = ds.reduce((a, b) => a + b, 0) / n;
  const v = ds.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1);
  if (v === 0) return m === 0 ? 1 : 0;
  return 2 * (1 - studentCdf(Math.abs(m / Math.sqrt(v / n)), n - 1));
}

function studentCdf(t, df) { // regularized incomplete beta via continued fraction
  const x = df / (df + t * t);
  return 1 - 0.5 * ibeta(x, df / 2, 0.5);
}
function ibeta(x, a, b) { // regularized incomplete beta I_x(a, b)
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}
function betacf(a, b, x) { // continued fraction, modified Lentz (Numerical Recipes)
  const FPMIN = 1e-300, qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 3e-14) break;
  }
  return h;
}
function lgamma(z) {
  const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}
