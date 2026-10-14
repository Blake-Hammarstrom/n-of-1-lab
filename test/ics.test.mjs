import assert from "node:assert/strict";
import { test } from "node:test";
import { createExperiment, scheduleICS } from "../src/app/model.js";

const plan = { question: "Q?", aLabel: "Coffee, black", bLabel: "No coffee",
  outcome: { name: "Focus", unit: "pts", better: "higher", resolution: 0 }, mme: 1, daySd: 2, periodDays: 1, blocks: 4, start: "2026-12-30", seed: "ics-fixed" };
const make = async (o = {}) => ({ ...(await createExperiment({ ...plan, ...o }, new Date("2026-12-29T08:05:09.123Z"))), id: "e-test" });
const unfold = (s) => s.split("\r\n ").join("");
const events = (s) => unfold(s).split("\r\n").join("\n").split("BEGIN:VEVENT\n").slice(1).map((e) => e.split("\n").filter(Boolean));
const summaries = (s) => events(s).map((e) => e[4]);

test("scheduleICS: structure and CRLF", async () => {
  const s = scheduleICS(await make());
  assert.ok(s.endsWith("END:VCALENDAR\r\n"));
  assert.ok(!/(?<!\r)\n/.test(s));
  assert.deepEqual(s.split("\r\n").slice(0, 4), ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//n-of-1-lab//schedule//EN", "CALSCALE:GREGORIAN"]);
  assert.equal(s, scheduleICS(await make()));
});

test("scheduleICS: exact events", async () => {
  const ev = events(scheduleICS(await make()));
  assert.equal(ev.length, 8);
  assert.deepEqual(ev[0], ["UID:e-test-20261230@n-of-1-lab", "DTSTAMP:20261229T080509Z", "DTSTART;VALUE=DATE:20261230", "DTEND;VALUE=DATE:20261231",
    "SUMMARY:Coffee\\, black: log Focus (day 1 of 8)", "END:VEVENT"]);
  assert.equal(ev[1][2], "DTSTART;VALUE=DATE:20261231");
  assert.equal(ev[1][3], "DTEND;VALUE=DATE:20270101");
  assert.equal(ev[1][4], "SUMMARY:No coffee: log Focus (day 2 of 8)");
  const arms = ev.map((e) => (e[4].startsWith("SUMMARY:Coffee") ? "A" : "B"));
  assert.deepEqual(arms, ["A", "B", "B", "A", "A", "B", "A", "B"]);
});

test("scheduleICS: periodDays 3", async () => {
  const ev = events(scheduleICS(await make({ periodDays: 3 })));
  assert.equal(ev.length, 24);
  assert.deepEqual(ev.slice(0, 4).map((e) => e[2]), ["DTSTART;VALUE=DATE:20261230", "DTSTART;VALUE=DATE:20261231", "DTSTART;VALUE=DATE:20270101", "DTSTART;VALUE=DATE:20270102"]);
  assert.ok(ev.slice(0, 3).every((e) => e[4].startsWith("SUMMARY:Coffee\\, black")));
  assert.ok(ev[3][4].startsWith("SUMMARY:No coffee"));
});

test("scheduleICS: TEXT escaping", async () => {
  const s = scheduleICS(await make({ aLabel: "a\\b;c,d\ne" }));
  assert.ok(summaries(s).includes("SUMMARY:a\\\\b\\;c\\,d\\ne: log Focus (day 1 of 8)"));
});

function checkFold(label) {
  return async () => {
    const s = scheduleICS(await make({ aLabel: label, bLabel: label + "!" }));
    const phys = s.split("\r\n");
    phys.pop();
    for (const l of phys) assert.ok(Buffer.byteLength(l) <= 75);
    const line = `SUMMARY:${label}: log Focus (day 1 of 8)`;
    assert.ok(unfold(s).split("\r\n").includes(line));
    const i = phys.findIndex((l) => l.startsWith("SUMMARY:"));
    let j = i; while (phys[j + 1].startsWith(" ")) j++;
    for (let k = i; k < j; k++) assert.ok(Buffer.byteLength(phys[k]) >= 74);
    return phys.slice(i, j + 1);
  };
}

test("scheduleICS: folds long ASCII lines at 75 octets", async () => {
  const parts = await checkFold("x".repeat(200))();
  for (const l of parts.slice(0, -1)) assert.equal(Buffer.byteLength(l), 75);
});

test("scheduleICS: never splits multi-byte characters", async () => {
  await checkFold("é".repeat(120))();
  const parts = await checkFold("a" + "é".repeat(120))();
  assert.ok(parts.length > 1);
});
