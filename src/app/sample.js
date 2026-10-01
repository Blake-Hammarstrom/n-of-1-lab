// A clearly labelled SAMPLE experiment with SIMULATED data, so a first-time visitor can see a finished result.
// It is generated, never presented as anyone's real experiment.
import { createExperiment } from "./model.js";
import { makeSchedule, daysIn } from "../engine/schedule.js";
import { normal, rng } from "../engine/rng.js";

export async function sampleExperiment() {
  const e = await createExperiment({
    question: "Does a 10-minute putting warm-up lower my putts per round?",
    aLabel: "No warm-up", bLabel: "10-minute warm-up",
    outcome: { name: "Putts per round", unit: "putts", better: "lower", resolution: 1 },
    mme: 1, daySd: 2.2, periodDays: 1, blocks: 16, start: "2026-06-01", seed: "sample-putting",
  }, new Date("2026-05-31T12:00:00Z"));
  const r = rng("sample-data");
  for (const p of makeSchedule(e.protocol)) {
    for (const iso of daysIn(p)) {
      const v = Math.round(33 + 2.2 * normal(r) - (p.arm === "B" ? 1.6 : 0));
      e.entries[iso] = { value: v, followed: true, note: "", at: `${iso}T20:00:00Z` };
    }
  }
  e.id = "sample";
  e.sample = true;
  return e;
}
