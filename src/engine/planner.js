// Planning: how many blocks are needed to detect the minimum meaningful effect, BEFORE any data exists.
// Simulation under a normal approximation of period-mean noise; the validation suite checks how far this
// planner's promise drifts under heavier tails and autocorrelation.
import { bet } from "./stats.js";
import { normal, rng } from "./rng.js";

/** SD of one block difference, from the day-to-day SD and the period length (days assumed independent). */
export const diffSd = (daySd, periodDays) => Math.SQRT2 * (daySd / Math.sqrt(periodDays));

export function power({ blocks, mme, daySd, periodDays, alpha = 0.05, sims = 600, seed = 7 }) {
  const r = rng(seed), sd = diffSd(daySd, periodDays);
  let hit = 0;
  for (let s = 0; s < sims; s++) {
    const ds = Array.from({ length: blocks }, () => mme + sd * normal(r));
    if (bet(ds, 0, { alpha, scale0: sd }).rejected) hit++;
  }
  return hit / sims;
}

export function blocksNeeded({ mme, daySd, periodDays, target = 0.8, maxBlocks = 40, ...rest }) {
  for (let b = 4; b <= maxBlocks; b += 2) {
    const p = power({ blocks: b, mme, daySd, periodDays, ...rest });
    if (p >= target) return { blocks: b, power: p };
  }
  return { blocks: null, power: power({ blocks: maxBlocks, mme, daySd, periodDays, ...rest }) };
}

/** Can the instrument resolve the effect? (Measurement System Analysis: resolution vs minimum meaningful effect.) */
export function resolutionCheck(resolution, mme) {
  if (!(resolution > 0)) return { ok: true, note: "" };
  const ratio = mme / resolution;
  return ratio >= 2
    ? { ok: true, note: "" }
    : { ok: false, note: `Your measurement only moves in steps of ${resolution}; an effect of ${mme} is near that resolution. Average several readings per period or use a finer measure.` };
}
