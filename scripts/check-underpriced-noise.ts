// Which below-cost findings are worth telling somebody about.
//
// THE FOUNDING CASE is not a missed detection. It is the opposite.
//
// On 30 October the sync noticed, correctly, that a DAVO meat-grinder
// attachment was listed at 290 ₪ against a cost of 390 ₪ with six on the
// shelf, and wrote the alert. On 31 October it was still there, still
// unread, and the shop had been losing 100 ₪ a unit the whole time.
//
// It was one of 83 open PRICE_BELOW_COST alerts. Of those 83:
//
//   69  were on a price of 0      — a missing price, not a loss
//   75  were on an unpublished record — nobody can buy it
//   12  were on a product the price list had dropped
//    7  were real
//
// 92% noise. A list like that does not get read, and the one alert that
// would have paid for the whole mechanism was indistinguishable from the
// seventy-six that meant nothing. Reporting less is what makes the rest
// legible.
//
// Run: npx tsx scripts/check-underpriced-noise.ts
import {
  MIN_PUBLIC_PRICE,
  lossIsReachable,
  underpricedReason,
} from "../src/lib/inventory/underpriced";

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

const live = (price: number | null) => ({ price, isPublished: true, missingFromSourceSince: null });

/* ── the one that had to get through ─────────────────────────────────── */
expect(
  "the DAVO grinder — 290 ₪, published, six in stock — is reportable",
  lossIsReachable(live(290)),
  true,
);
expect("…and it really is below its cost", underpricedReason(290, 390), "at_or_below_cost");

/* ── the 76 that drowned it ──────────────────────────────────────────── */
expect("a price of 0 is a missing price, not a loss", lossIsReachable(live(0)), false);
expect(
  `…and so is anything under the storefront's floor of ${MIN_PUBLIC_PRICE}`,
  lossIsReachable(live(MIN_PUBLIC_PRICE - 1)),
  false,
);
expect("exactly the floor is a price", lossIsReachable(live(MIN_PUBLIC_PRICE)), true);
expect(
  "an unpublished record cannot be sold at a loss",
  lossIsReachable({ price: 2700, isPublished: false, missingFromSourceSince: null }),
  false,
);
expect(
  "nor can one the price list has dropped",
  lossIsReachable({ price: 1500, isPublished: true, missingFromSourceSince: new Date("2026-10-20") }),
  false,
);
expect(
  "…whichever way that date is carried",
  lossIsReachable({ price: 1500, isPublished: true, missingFromSourceSince: "2026-10-20" }),
  false,
);
expect("no price at all", lossIsReachable(live(null)), false);

/* Three of the real 83, by their real numbers, filed where they belong. */
const REAL_ALERTS: [string, { price: number | null; isPublished: boolean; missingFromSourceSince: Date | null }, boolean][] = [
  ["0780  DAVO grinder, 290 ₪, published, 6 in stock", live(290), true],
  ["770604 Ninja espresso, 2,700 ₪, published", live(2700), true],
  ["0879  MIDEA 6714 — the message quotes a price of 0", live(0), false],
  ["MERGED-0810 TCL — 0 ₪ and unpublished, two ways out", { price: 0, isPublished: false, missingFromSourceSince: null }, false],
  ["1819  Moulinex, 290 ₪ but unpublished", { price: 290, isPublished: false, missingFromSourceSince: null }, false],
  ["0406  Fratelli cooktop, dropped from the sheet", { price: 1500, isPublished: true, missingFromSourceSince: new Date("2026-10-28") }, false],
];
for (const [label, product, wanted] of REAL_ALERTS) {
  expect(label, lossIsReachable(product), wanted);
}

/* ── what this must NOT quietly change ───────────────────────────────── */
/* The question "is this price wrong" is untouched; only "is it worth an
   alert" narrowed. A 0 ₪ price is still a fault, under its own name. */
expect("a price of 0 is still reported as a fault", underpricedReason(0, 390), "below_floor");
expect("…under its own reason, not as a loss", underpricedReason(5, null), "below_floor");
expect("a healthy price is still clean", underpricedReason(450, 390), null);
expect("equal to cost is still a fault — the floor is strict", underpricedReason(390, 390), "at_or_below_cost");

console.log(
  `${checked - failed}/${checked} passed  (the DAVO grinder gets through; ` +
    `the 69 zero prices, the 75 unpublished and the 12 dropped do not, and ` +
    `a zero price is still a fault under its own name)`,
);
process.exit(failed === 0 ? 0 : 1);
