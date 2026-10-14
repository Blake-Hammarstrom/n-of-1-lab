import assert from "node:assert/strict";
import { test } from "node:test";
import { createExperiment, entriesCSV, logValue } from "../src/app/model.js";

const plan = { question: "Q?", aLabel: "Coffee, black", bLabel: "No coffee",
  outcome: { name: "Focus", unit: "pts", better: "higher", resolution: 0 }, mme: 1, daySd: 2, periodDays: 2, blocks: 4, start: "2026-10-01", seed: "csv-fixed" };
const make = (o = {}) => createExperiment({ ...plan, ...o }, new Date("2026-09-30T00:00:00Z"));
const H = "date,block,condition,value,followed,note\n";

test("entriesCSV: no entries gives only the header", async () => {
  assert.equal(entriesCSV(await make()), H);
});

test("entriesCSV: exact output, ordering, quoting and formula guard", async () => {
  let e = await make();
  e = logValue(e, "2026-10-05", 3);
  e = logValue(e, "2026-10-04", 7.5, true, 'slept "badly", then OK');
  e = logValue(e, "2026-10-01", -2, false, "=SUM(A1)");
  e = logValue(e, "2026-10-02", 0, true, "line1\nline2");
  e = logValue(e, "2026-10-03", 4);
  assert.equal(entriesCSV(e), H +
    "2026-10-01,1,No coffee,-2,no,'=SUM(A1)\n" +
    '2026-10-02,1,No coffee,0,yes,"line1\nline2"\n' +
    '2026-10-03,1,"Coffee, black",4,yes,\n' +
    '2026-10-04,1,"Coffee, black",7.5,yes,"slept ""badly"", then OK"\n' +
    '2026-10-05,2,"Coffee, black",3,yes,\n');
});

test("entriesCSV: guards condition labels, not values", async () => {
  let e = await make({ bLabel: "+caffeine" });
  e = logValue(e, "2026-10-01", -3, true, "@home");
  assert.equal(entriesCSV(e), H + "2026-10-01,1,'+caffeine,-3,yes,'@home\n");
});

test("entriesCSV: entries outside the schedule are left out", async () => {
  let e = await make();
  e = logValue(e, "2026-10-01", 1);
  e = { ...e, entries: { ...e.entries, "2027-01-01": { value: 9, followed: true, note: "" } } };
  assert.equal(entriesCSV(e), H + "2026-10-01,1,No coffee,1,yes,\n");
});
