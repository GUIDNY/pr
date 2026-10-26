// The bin: what may go in, what may come out, what may be destroyed.
//
// The founding case is PR-379226, and it is worth stating as a sequence
// because every step of it was legal:
//
//   23/10 20:20  authorised, ₪290, hold to 12/11
//   25/10 14:51  cancelled            → hold + CANCELLED, which may be binned
//   26/10 00:51  binned               → legal at the time
//   26/10 14:35  "ביטול הפעולה האחרונה" put it back to NEW, in the bin
//                                     → hold + NEW, which may NOT be binned
//
// And the restore path asked the binning question, so the answer that had
// let it in now refused to let it out. The order was gone from every queue,
// every count and every list, and no button could bring it back.
//
// The rule this file holds: **restore is always allowed**. A row's own
// answer can change after it is binned, so any rule applied on the way out
// is a rule that can strand it — and there is no state of the money for
// which the right answer is "leave it hidden".
//
// Run: npx tsx scripts/check-order-bin.ts
import {
  activeHold,
  binActionAllowed,
  removalRule,
  tookRealMoney,
  type BinDirection,
  type RemovablePayment,
} from "../src/lib/queries/seller-orders";

let failed = 0;
let checked = 0;
const fail = (message: string) => {
  console.log(`FAIL  ${message}`);
  failed++;
};
const expect = (label: string, actual: unknown, wanted: unknown) => {
  checked++;
  if (actual !== wanted) fail(`${label}: got ${String(actual)}, wanted ${String(wanted)}`);
};

const NOW = new Date("2026-10-26T15:00:00Z");
const LIVE = new Date("2026-11-12T20:20:13Z"); // a hold still running
const LAPSED = new Date("2026-10-01T00:00:00Z"); // one that has expired

const pelecard = (status: string, holdExpiresAt: Date | null = null): RemovablePayment => ({
  provider: "PELECARD",
  status,
  holdExpiresAt,
});
const demo = (status: string, holdExpiresAt: Date | null = null): RemovablePayment => ({
  provider: "DEMO",
  status,
  holdExpiresAt,
});

/* [label, order, bin?, restore?, purge?] — every row a real shape from the
   bin as it stands today. */
const CASES: [string, { status: string; payments: RemovablePayment[] }, boolean, boolean, boolean][] = [
  // THE FOUNDING CASE, in the state that trapped it.
  ["PR-379226 after the undo: NEW with a live hold", { status: "NEW", payments: [pelecard("AUTHORIZED", LIVE)] }, false, true, false],
  // ...and in the state it was binned from, which was and stays legal.
  ["PR-379226 as binned: CANCELLED with a live hold", { status: "CANCELLED", payments: [pelecard("AUTHORIZED", LIVE)] }, true, true, false],

  // Money that really moved. Never binnable, never purgeable — and still
  // restorable, because hiding a financial record helps nobody.
  ["a captured payment", { status: "DELIVERED", payments: [pelecard("CAPTURED")] }, false, true, false],
  ["captured and then cancelled", { status: "CANCELLED", payments: [pelecard("CAPTURED")] }, false, true, false],

  // The ordinary rubbish the bin is for.
  ["a failed payment", { status: "PAYMENT_PENDING", payments: [pelecard("FAILED")] }, true, true, true],
  ["never paid at all", { status: "PAYMENT_PENDING", payments: [pelecard("PENDING")] }, true, true, true],
  ["no payment row whatsoever", { status: "NEW", payments: [] }, true, true, true],
  ["a lapsed hold", { status: "NEW", payments: [pelecard("AUTHORIZED", LAPSED)] }, true, true, true],
  ["cancelled with a lapsed hold", { status: "CANCELLED", payments: [pelecard("AUTHORIZED", LAPSED)] }, true, true, true],

  // The demo lane moves no money, so it is never a financial record.
  ["a demo authorisation", { status: "NEW", payments: [demo("AUTHORIZED", LIVE)] }, true, true, true],
  ["a demo capture", { status: "DELIVERED", payments: [demo("CAPTURED")] }, true, true, true],

  // One real payment among several decides it.
  ["a failed attempt and then a capture", { status: "PAID", payments: [pelecard("FAILED"), pelecard("CAPTURED")] }, false, true, false],
  ["two failures", { status: "PAYMENT_PENDING", payments: [pelecard("FAILED"), pelecard("FAILED")] }, true, true, true],
];

for (const [label, order, canBin, canRestore, canPurge] of CASES) {
  expect(`bin — ${label}`, binActionAllowed(order, "bin", NOW).allowed, canBin);
  expect(`restore — ${label}`, binActionAllowed(order, "restore", NOW).allowed, canRestore);
  expect(`purge — ${label}`, binActionAllowed(order, "purge", NOW).allowed, canPurge);
}

/* Restore is allowed for EVERY shape, not just the ones listed. Spelled out
   as its own sweep so that adding a case above can never quietly introduce
   a state that cannot come back. */
for (const [label, order] of CASES.map((c) => [c[0], c[1]] as const)) {
  checked++;
  if (!binActionAllowed(order, "restore", NOW).allowed) fail(`restore must always be allowed — ${label}`);
}

/* A refusal has to say why; an allowance must not invent a reason. The UI
   prints this string straight at a person. */
for (const [label, order] of CASES.map((c) => [c[0], c[1]] as const)) {
  for (const direction of ["bin", "restore", "purge"] as BinDirection[]) {
    const { allowed, reason } = binActionAllowed(order, direction, NOW);
    checked++;
    if (!allowed && !reason) fail(`${direction} refused ${label} with no reason to show`);
    checked++;
    if (allowed && reason) fail(`${direction} allowed ${label} but still returned a reason`);
  }
}

/* The two predicates underneath, since the rule is only as good as these. */
expect("a capture is real money", tookRealMoney([pelecard("CAPTURED")]), true);
expect("a demo capture is not", tookRealMoney([demo("CAPTURED")]), false);
expect("an authorisation is not a capture", tookRealMoney([pelecard("AUTHORIZED")]), false);
expect("no payments is not real money", tookRealMoney([]), false);
expect("a live hold is found", activeHold([pelecard("AUTHORIZED", LIVE)], NOW) !== null, true);
expect("a lapsed one is not", activeHold([pelecard("AUTHORIZED", LAPSED)], NOW) !== null, false);
expect("a hold with no expiry counts as live", activeHold([pelecard("AUTHORIZED", null)], NOW) !== null, true);
expect("a demo hold is not a hold", activeHold([demo("AUTHORIZED", LIVE)], NOW) !== null, false);
expect("a failed payment is not a hold", activeHold([pelecard("FAILED", LIVE)], NOW) !== null, false);

/* `now` is a parameter and has to be honoured: the same order is binnable
   the day after its hold lapses and not the day before. A rule that read
   the clock itself could not be tested at all. */
const trapped = { status: "NEW", payments: [pelecard("AUTHORIZED", LIVE)] };
expect("before the hold lapses", binActionAllowed(trapped, "bin", new Date("2026-11-01T00:00:00Z")).allowed, false);
expect("after it lapses", binActionAllowed(trapped, "bin", new Date("2026-11-13T00:00:00Z")).allowed, true);

/* binActionAllowed must not disagree with removalRule about the two
   directions removalRule does describe — the back office greys its buttons
   off removalRule and the action decides with binActionAllowed, and a
   button that is enabled over an action that refuses is its own bug. */
for (const [label, order] of CASES.map((c) => [c[0], c[1]] as const)) {
  const rule = removalRule(order, NOW);
  expect(`button and action agree on binning — ${label}`, binActionAllowed(order, "bin", NOW).allowed, rule.canBin);
  expect(`…and on purging — ${label}`, binActionAllowed(order, "purge", NOW).allowed, rule.canPurge);
}

console.log(
  `${checked - failed}/${checked} passed  (${CASES.length} order shapes × 3 directions, ` +
    `restore allowed for all ${CASES.length})`,
);
process.exit(failed === 0 ? 0 : 1);
