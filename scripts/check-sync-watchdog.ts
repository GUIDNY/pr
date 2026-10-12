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
    ? "\nThe watchdog counts the hours the office is open.\n"
    : `\n${failures} watchdog rule(s) BROKEN.\n`,
);
process.exit(failures === 0 ? 0 : 1);
