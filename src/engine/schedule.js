// Randomized block crossover schedule: each block has one A period and one B period in random order.
// The block is the independent unit of analysis; days inside a period are repeated measurements of it.
import { rng } from "./rng.js";

const DAY = 86400000;
export const toISO = (t) => new Date(t).toISOString().slice(0, 10);
export const fromISO = (s) => Date.parse(`${s}T00:00:00Z`);

/** @returns {{block:number, order:number, arm:"A"|"B", start:string, end:string}[]} */
export function makeSchedule({ seed, blocks, periodDays, start }) {
  const r = rng(seed), out = [];
  let t = fromISO(start);
  for (let b = 0; b < blocks; b++) {
    const order = r() < 0.5 ? ["A", "B"] : ["B", "A"];
    order.forEach((arm, i) => {
      out.push({ block: b, order: i, arm, start: toISO(t), end: toISO(t + (periodDays - 1) * DAY) });
      t += periodDays * DAY;
    });
  }
  return out;
}

export function periodOn(schedule, iso) {
  return schedule.find((p) => p.start <= iso && iso <= p.end) || null;
}

export function daysIn(period) {
  const out = [];
  for (let t = fromISO(period.start); t <= fromISO(period.end); t += DAY) out.push(toISO(t));
  return out;
}
