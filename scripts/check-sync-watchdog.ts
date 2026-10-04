/**
 * The watchdog's clock, against the weekend that broke it.
 *
 * The office powers its file server down from Friday afternoon until
 * somebody opens on Sunday morning, so the agent fires on schedule all
 * weekend, finds no share and reports nothing. On a wall clock that is a
 * 45-hour silence — two and a half times the threshold — and the first
 * weekend after this watchdog went in it raised a CRITICAL alert on a
 * perfectly healthy shop, which is the exact failure it exists to prevent.
 *
 * So staleness is counted in hours when a report was possible. That rule is
 * easy to state and easy to get wrong by an hour at a day boundary, across
 * a DST change, or by reading the server's UTC weekday instead of Israel's
 * — none of which a type catches and all of which show up as either a
 * weekly false alarm or a real outage nobody is told about.
 *
 * The dates below are the real ones from 2-4 October 2026.
 *
 *   npm run check:watchdog
 */

import { openHoursBetween } from "../src/lib/inventory/office-hours";

let failures = 0;

function is(name: string, got: unknown, want: unknown) {
  const ok = got === want;
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name} → ${got}${ok ? "" : `  (expected ${want})`}`);
}

function atLeast(name: string, got: number, min: number) {
  const ok = got >= min;
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name} → ${got}${ok ? "" : `  (expected ≥ ${min})`}`);
}

function under(name: string, got: number, max: number) {
  const ok = got < max;
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name} → ${got}${ok ? "" : `  (expected < ${max})`}`);
}

const THRESHOLD = 18;

/* The incident. Last contact Friday 2 October 07:30 Israel (04:30 UTC);
   the alert fired on Sunday morning with the server simply switched off. */
const lastContact = new Date("2026-10-02T04:30:00Z");

console.log("The weekend that raised the false alarm");
under("Friday evening, hours after the last run", openHoursBetween(lastContact, new Date("2026-10-02T17:00:00Z")), THRESHOLD);
under("Saturday — the server is off, nothing counts", openHoursBetween(lastContact, new Date("2026-10-03T17:00:00Z")), THRESHOLD);
under("Sunday 10:44, when the alert was found open", openHoursBetween(lastContact, new Date("2026-10-04T07:44:00Z")), THRESHOLD);
is("Saturday adds nothing at all",
  openHoursBetween(lastContact, new Date("2026-10-03T05:00:00Z")),
  openHoursBetween(lastContact, new Date("2026-10-04T03:00:00Z")));

console.log("\nA real failure is still caught");
/* Same silence starting on a Monday: two working days of nothing is a
   machine that has stopped, and the shop should be told. */
const mondayMorning = new Date("2026-10-05T04:30:00Z");
under("Monday afternoon, one run missed", openHoursBetween(mondayMorning, new Date("2026-10-05T14:00:00Z")), THRESHOLD);
atLeast("Wednesday morning, after two silent working days", openHoursBetween(mondayMorning, new Date("2026-10-07T06:00:00Z")), THRESHOLD);

console.log("\nThe clock reads Israel, not the server");
/* Israel is UTC+3 in October and UTC+2 in December. 05:00 UTC is 08:00
   Israel in one and 07:00 in the other — inside the window either way —
   while 04:00 UTC is 07:00 and 06:00: inside in October, outside in
   December. A fixed offset gets exactly this wrong twice a year. */
atLeast("an October weekday morning counts", openHoursBetween(new Date("2026-10-06T04:00:00Z"), new Date("2026-10-06T10:00:00Z")), 5);
atLeast("a December weekday morning counts", openHoursBetween(new Date("2026-12-08T05:00:00Z"), new Date("2026-12-08T11:00:00Z")), 5);
is("a December Saturday still counts nothing", openHoursBetween(new Date("2026-12-12T05:00:00Z"), new Date("2026-12-12T20:00:00Z")), 0);

console.log("\nIt cannot run away");
/* A year of silence must not cost a year of iterations. */
const started = Date.now();
const huge = openHoursBetween(new Date("2025-10-04T00:00:00Z"), new Date("2026-10-04T00:00:00Z"));
atLeast("a year of silence is still stale", huge, THRESHOLD);
under("and is counted in well under a second", Date.now() - started, 1000);

console.log(
  failures === 0
    ? "\nThe watchdog counts the hours the office is open.\n"
    : `\n${failures} watchdog rule(s) BROKEN.\n`,
);
process.exit(failures === 0 ? 0 : 1);
