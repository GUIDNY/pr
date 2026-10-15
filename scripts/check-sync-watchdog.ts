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

import {
  openHoursBetween,
  missedReportsBetween,
  STALE_AFTER_MISSED_REPORTS,
} from "../src/lib/inventory/office-hours";
import { pairReplacements } from "../src/lib/inventory/replaced-products";

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

const THRESHOLD = STALE_AFTER_MISSED_REPORTS;

/* The weekend that raised the false alarm. Last contact Friday 2 October
   07:30 Israel (04:30 UTC); the alert fired on Sunday morning with the
   server simply switched off, which is the office working normally. */
const lastContact = new Date("2026-10-02T04:30:00Z");

console.log("The weekend that raised the false alarm");
/* Friday 15:30 fires into a powered-down server, and so does Saturday
   twice. None of them was a chance to report, so none of them is missed —
   and this is now true by construction rather than by a threshold wide
   enough to swallow it. */
is("Friday afternoon, after the server goes off", missedReportsBetween(lastContact, new Date("2026-10-02T17:00:00Z")), 0);
is("Saturday — nothing was ever due", missedReportsBetween(lastContact, new Date("2026-10-03T17:00:00Z")), 0);
is("Sunday 10:44, when the alert was found open", missedReportsBetween(lastContact, new Date("2026-10-04T04:00:00Z")), 0);
under("so the whole weekend stays quiet", missedReportsBetween(lastContact, new Date("2026-10-04T04:00:00Z")), THRESHOLD);

console.log("\nThursday 15 October, the day the owner noticed first");
/* The incident this unit was chosen after. The agent last reported on
   Wednesday 14 October at 15:30 Israel and then stopped — the office Mac is
   the only thing that fires a sync, and nothing on the server can start one.
   Thursday's 07:30 and 15:30 runs never happened, the shop sold all day
   against Wednesday's stock, and the watchdog said nothing because twelve
   open hours is nowhere near eighteen. */
const wednesdayAfternoon = new Date("2026-10-14T12:30:00Z");
is("07:20 Thursday — the run is not late yet", missedReportsBetween(wednesdayAfternoon, new Date("2026-10-15T04:20:00Z")), 0);
is("08:00 Thursday — the morning run is gone", missedReportsBetween(wednesdayAfternoon, new Date("2026-10-15T05:00:00Z")), 1);
under("and one missed run is a warning, not a CRITICAL", missedReportsBetween(wednesdayAfternoon, new Date("2026-10-15T05:00:00Z")), THRESHOLD);
atLeast(
  "16:00 Thursday — both runs gone, and this is the alert that was missing",
  missedReportsBetween(wednesdayAfternoon, new Date("2026-10-15T13:00:00Z")),
  THRESHOLD,
);
/* What the old rule said at that same instant, kept as a fixture because it
   is the whole argument for the change: a working day of silence, twelve
   open hours, two thirds of the way to a threshold of eighteen. */
is("the old clock had reached 12 of its 18", openHoursBetween(wednesdayAfternoon, new Date("2026-10-15T13:00:00Z")), 12);
under("i.e. it would have stayed silent all day", openHoursBetween(wednesdayAfternoon, new Date("2026-10-15T13:00:00Z")), 18);

console.log("\nA weekday failure is caught the same day");
const mondayMorning = new Date("2026-10-05T04:30:00Z");
under("Monday noon, nothing missed yet", missedReportsBetween(mondayMorning, new Date("2026-10-05T09:00:00Z")), THRESHOLD);
atLeast("Tuesday morning, after the afternoon and the morning run", missedReportsBetween(mondayMorning, new Date("2026-10-06T05:00:00Z")), THRESHOLD);

console.log("\nThe clock reads Israel, not the server");
/* Israel is UTC+3 in October and UTC+2 in December. 05:00 UTC is 08:00
   Israel in one and 07:00 in the other — inside the window either way —
   while 04:00 UTC is 07:00 and 06:00: inside in October, outside in
   December. A fixed offset gets exactly this wrong twice a year. */
atLeast("an October weekday morning counts", openHoursBetween(new Date("2026-10-06T04:00:00Z"), new Date("2026-10-06T10:00:00Z")), 5);
atLeast("a December weekday morning counts", openHoursBetween(new Date("2026-12-08T05:00:00Z"), new Date("2026-12-08T11:00:00Z")), 5);
is("a December Saturday still counts nothing", openHoursBetween(new Date("2026-12-12T05:00:00Z"), new Date("2026-12-12T20:00:00Z")), 0);
/* And the same for the runs themselves: a December Thursday's 07:30 is
   05:30 UTC, an October Thursday's is 04:30, and both are due. */
is("the December morning run is still counted", missedReportsBetween(new Date("2026-12-09T13:30:00Z"), new Date("2026-12-10T06:00:00Z")), 1);
/* Friday 11 December 07:30 Israel to midnight on Saturday: the Friday
   afternoon firing and both of Saturday's fall on a powered-down server, so
   a dead agent and a healthy one are indistinguishable here on purpose —
   and Sunday morning is where the silence becomes a fact. */
is("a Friday evening and a whole Saturday are never due", missedReportsBetween(new Date("2026-12-11T05:30:00Z"), new Date("2026-12-12T22:00:00Z")), 0);
is("Sunday 08:00 is where it shows", missedReportsBetween(new Date("2026-12-11T05:30:00Z"), new Date("2026-12-13T06:00:00Z")), 1);

console.log("\nIt cannot run away");
/* A year of silence must not cost a year of iterations. */
const started = Date.now();
const huge = missedReportsBetween(new Date("2025-10-04T00:00:00Z"), new Date("2026-10-04T00:00:00Z"));
atLeast("a year of silence is still stale", huge, THRESHOLD);
under("and is counted in well under a second", Date.now() - started, 1000);
const hoursStarted = Date.now();
atLeast("so is a year of it on the open-hours clock", openHoursBetween(new Date("2025-10-04T00:00:00Z"), new Date("2026-10-04T00:00:00Z")), 18);
under("also under a second", Date.now() - hoursStarted, 1000);

console.log("\nA run that swapped a product for a blank record on its own row");
/* Both real incidents. On 11 October at 19:39 a run marked 45 enriched,
   photographed products as gone from the price list and created an empty
   one for each on the same tab and row; on 12 October at 04:30 another did
   it to 14 more, 93,130 ₪ of them. Both reported SUCCESS. The pairs below
   are real rows from those two runs. */
const RUN_A = "cmv4ap0000000000000000000"; // 11 Oct 19:39
const RUN_B = "cmv4r79bx000006l6z5x155l7"; // 12 Oct 04:30
const lost = (
  sku: string,
  runId: string,
  sheetName: string | null,
  rowRef: number | null,
  price = 100,
  stockQty = 1,
) => ({
  id: `old-${sku}`,
  syncRunId: runId,
  sku,
  title: `מוצר ${sku}`,
  price,
  stockQty,
  sheetName,
  rowRef,
  stillGone: true,
});
const made = (sku: string, runId: string, sheetName: string | null, rowRef: number | null) => ({
  id: `new-${sku}`,
  syncRunId: runId,
  sku,
  sheetName,
  rowRef,
});

const caught = pairReplacements(
  [
    lost("0306", RUN_A, "כיריים", 74, 4200, 4),
    lost("0325", RUN_A, "כיריים", 118, 9600, 1),
    lost("0909", RUN_B, "ת.בנוי", 176, 5700, 2),
  ],
  [made("0883", RUN_A, "כיריים", 74), made("0885", RUN_A, "כיריים", 118), made("0941", RUN_B, "ת.בנוי", 176)],
);
is("every real pair is caught", caught.length, 3);
/* By what the loss is worth, not by unit price: the Bauknecht hob is
   ₪4,200 against the Bertazzoni's ₪9,600, and four of it were in stock. */
is("biggest loss first", caught[0]?.lostSku, "0306");
is("and it names the blank that took the row", caught[0]?.blankSku, "0883");
is("the loss is priced at price times stock", caught[0]?.value, 16800);

/* The thing the first version of this got wrong, and the reason it is keyed
   on the run. A product that left the price list in September and a record
   created on that row in October are two separate events; pairing them
   produced 55 false alarms against the live catalogue, one of them a ₪2,400
   cooktop matched to a ₪10,500 one. */
is(
  "two different runs are two events, not a replacement",
  pairReplacements([lost("0306", RUN_A, "כיריים", 74)], [made("0883", RUN_B, "כיריים", 74)]).length,
  0,
);
/* Within one run, the tab and the row still have to agree: a run that drops
   one product and adds an unrelated one elsewhere is an ordinary run. */
is(
  "the tab has to agree",
  pairReplacements([lost("0306", RUN_A, "כיריים", 74)], [made("0883", RUN_A, "מקררים", 74)]).length,
  0,
);
is(
  "and so does the row number",
  pairReplacements([lost("0306", RUN_A, "כיריים", 74)], [made("0883", RUN_A, "כיריים", 75)]).length,
  0,
);
/* A row position nobody recorded proves nothing, and two blanks must not
   prove each other by both being null. */
is(
  "a missing row position never pairs",
  pairReplacements([lost("0306", RUN_A, "כיריים", null)], [made("0883", RUN_A, "כיריים", null)]).length,
  0,
);
is(
  "nor a missing tab",
  pairReplacements([lost("0306", RUN_A, null, 74)], [made("0883", RUN_A, null, 74)]).length,
  0,
);
/* And a record cannot replace itself, however the two queries overlap. */
is(
  "a record is never its own replacement",
  pairReplacements(
    [{ ...lost("0306", RUN_A, "כיריים", 74), id: "same" }],
    [{ ...made("0306", RUN_A, "כיריים", 74), id: "same" }],
  ).length,
  0,
);
is("a quiet morning raises nothing", pairReplacements([], []).length, 0);

console.log(
  failures === 0
    ? "\nThe watchdog counts the reports the agent could have made.\n"
    : `\n${failures} watchdog rule(s) BROKEN.\n`,
);
process.exit(failures === 0 ? 0 : 1);
