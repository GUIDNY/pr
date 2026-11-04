// Who may close a duplicate alert, and when the watchdog raises it again.
//
// THE FOUNDING CASE, 1 November. The Bosch SMS4ECW28E was live twice that
// afternoon, at 3,990 and 2,790, and nothing anywhere said so. Its
// watchdog alert — CRITICAL, "the same model on the site twice at two
// prices" — had been raised on 31 October and closed at 13:33 by the
// 13:30 sync, two minutes after that same run touched both products.
//
// Two defects met there:
//
//   * DUPLICATE_MODEL is two different alerts sharing a name. The sync
//     raises one per row ("this model is twice in the price list", a
//     WARNING); the watchdog raises the other (live twice at two prices,
//     CRITICAL, stamped raisedBy: "watchdog"). Both of the sync's closing
//     passes matched on type alone, so every run closed the watchdog's.
//     23 of 26 had been closed that way, 12 of them CRITICAL.
//   * The watchdog raised once per model, ever, and closed nothing. A
//     closed alert was "already asked", so each of those 12 was silenced
//     for good.
//
// And a third, underneath both: reconcileAutoPublish refused a duplicate
// only through that alert, so a closed alert was an open door.
//
// Run: npx tsx scripts/check-duplicate-alerts.ts
import { readFileSync } from "fs";
import {
  WATCHDOG_MARK,
  duplicateAlertPlan,
  wouldDuplicateALiveListing,
  type DuplicateGroup,
  type ExistingDuplicateAlert,
} from "../src/lib/inventory/duplicate-listings";

let failed = 0;
let checked = 0;
const fail = (m: string) => {
  console.log(`FAIL  ${m}`);
  failed++;
};
const expect = (label: string, actual: unknown, wanted: unknown) => {
  checked++;
  if (actual !== wanted) fail(`${label}: got ${String(actual)}, wanted ${String(wanted)}`);
};

const group = (key: string, severity: "CRITICAL" | "WARNING"): DuplicateGroup => ({
  key,
  severity,
  listings: [],
  lossPerUnit: severity === "CRITICAL" ? 890 : null,
  buyableNow: true,
});
const alert = (id: string, key: string, isResolved: boolean, by: "watchdog" | "sync" = "watchdog"): ExistingDuplicateAlert => ({
  id,
  isResolved,
  metadata: JSON.stringify(by === "watchdog" ? { modelKey: key, raisedBy: "watchdog" } : { modelKey: key }),
});

/* ── the marker is what JSON.stringify actually writes ──────────────── */
expect(
  "the mark matches a real stored alert",
  JSON.stringify({ modelKey: "X", raisedBy: "watchdog" }).includes(WATCHDOG_MARK),
  true,
);

/* ── the founding case ───────────────────────────────────────────────── */
/* The Bosch: still live twice, its only watchdog alert closed by the sync.
   It must be raised again — this is the exact state of 1 November. */
const bosch = duplicateAlertPlan([group("SMS4ECW28E", "CRITICAL")], [alert("a1", "SMS4ECW28E", true)]);
expect("a CRITICAL duplicate whose alert was closed is raised again", bosch.toRaise.length, 1);
expect("…for the Bosch", bosch.toRaise[0]?.key, "SMS4ECW28E");
expect("…and nothing is closed", bosch.toClose.length, 0);

/* ── open while it exists, closed when it does not ──────────────────── */
const stillOpen = duplicateAlertPlan([group("SMS4ECW28E", "CRITICAL")], [alert("a1", "SMS4ECW28E", false)]);
expect("an open alert is not duplicated", stillOpen.toRaise.length, 0);
expect("…nor closed while the pair is live", stillOpen.toClose.length, 0);

const gone = duplicateAlertPlan([], [alert("a1", "SMS4ECW28E", false), alert("a2", "SJ3850WH", false)]);
expect("an empty sweep closes every open alert", gone.toClose.length, 2);
expect("…which needs no early return on empty", gone.toRaise.length, 0);

const oneGone = duplicateAlertPlan([group("SJ3850WH", "CRITICAL")], [alert("a1", "SMS4ECW28E", false), alert("a2", "SJ3850WH", false)]);
expect("only the pair that is gone is closed", oneGone.toClose.join(","), "a1");

/* ── a WARNING is asked once ─────────────────────────────────────────── */
const nf = duplicateAlertPlan([group("NF417", "WARNING")], [alert("w1", "NF417", true)]);
expect("a dismissed WARNING is not re-raised", nf.toRaise.length, 0);
expect("a new WARNING is raised", duplicateAlertPlan([group("NF417", "WARNING")], []).toRaise.length, 1);
expect("a new CRITICAL is raised", duplicateAlertPlan([group("SMS4ECW28E", "CRITICAL")], []).toRaise.length, 1);

/* ── the sync's own alerts mean nothing to the watchdog ──────────────── */
/* A sync WARNING ("twice in the price list") for the same code must not
   count as the watchdog having asked, nor be closed by it. */
const syncOnly = duplicateAlertPlan([group("SMS4ECW28E", "CRITICAL")], [alert("s1", "SMS4ECW28E", false, "sync")]);
expect("a sync alert does not suppress the watchdog's", syncOnly.toRaise.length, 1);
expect("…and the watchdog does not close the sync's", duplicateAlertPlan([], [alert("s1", "X", false, "sync")]).toClose.length, 0);
expect(
  "an alert with no metadata is nobody's to close",
  duplicateAlertPlan([], [{ id: "n1", isResolved: false, metadata: null }]).toClose.length,
  0,
);

/* ── auto-publish cannot create a duplicate ──────────────────────────── */
const live = [{ id: "1358", model: "SMS 4ECW28E", price: 3990 }];
expect(
  "the cheap Bosch cannot be published beside the live one",
  wouldDuplicateALiveListing({ id: "140201", model: "SMS4ECW28E", price: 2790 }, live),
  true,
);
expect(
  "a colour variant at the same price is allowed",
  wouldDuplicateALiveListing({ id: "b", model: "TC034B2U", price: 1290 }, [{ id: "w", model: "TC034B2U", price: 1290 }]),
  false,
);
expect("a product is not its own duplicate", wouldDuplicateALiveListing({ id: "1358", model: "SMS4ECW28E", price: 3990 }, live), false);
expect(
  "a different model is a different product",
  wouldDuplicateALiveListing({ id: "x", model: "SMV2HTX06E", price: 2790 }, live),
  false,
);
expect("no model, nothing to compare", wouldDuplicateALiveListing({ id: "x", model: null, price: 10 }, live), false);

/* ── the sync leaves watchdog alerts alone ───────────────────────────── */
/* Read from the source, because the filter is a Prisma where-object in a
   file that needs a database to import. Both closing passes must carry
   it, and it must keep the null-metadata branch: `NOT contains` alone
   drops every null row from the match and quietly stops the sync closing
   any of its own alerts. */
const sync = readFileSync("src/lib/inventory/sync.ts", "utf8");
const upsert = sync.slice(sync.indexOf("async function upsertAlert"), sync.indexOf("type ApplyResult"));
const settle = sync.slice(sync.indexOf("// Settle pass"), sync.indexOf("return result;", sync.indexOf("// Settle pass")));
expect("upsertAlert leaves the watchdog's alerts alone", (upsert.match(/RAISED_BY_THE_SYNC/g) ?? []).length, 2);
expect("the settle pass leaves them alone", settle.includes("RAISED_BY_THE_SYNC"), true);
const filter = sync.slice(sync.indexOf("const RAISED_BY_THE_SYNC"), sync.indexOf("};", sync.indexOf("const RAISED_BY_THE_SYNC")));
expect("…and a null metadata is still the sync's to close", filter.includes("metadata: null"), true);
expect("…by the shared mark, not a copy of it", filter.includes("WATCHDOG_MARK"), true);

/* And the products-page toggle records a hide, so the sync cannot undo it. */
const toggle = readFileSync("src/actions/admin-products.ts", "utf8");
const t = toggle.slice(toggle.indexOf("export async function togglePublishAction"), toggle.indexOf("logAudit", toggle.indexOf("export async function togglePublishAction")));
expect("the products-page toggle moves unpublishedAt with isPublished", t.includes("unpublishedAt: isPublished ? null : new Date()"), true);

console.log(
  `${checked - failed}/${checked} passed  (the sync no longer closes the watchdog's alert; ` +
    `a closed CRITICAL is raised again; an alert closes itself when the pair is gone; ` +
    `and auto-publish cannot put the cheap Bosch back)`,
);
process.exit(failed === 0 ? 0 : 1);
