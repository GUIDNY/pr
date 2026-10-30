// The same machine on the site twice, at two prices.
//
// SMS4ECW28E, 30 October: a Bosch dishwasher live at 3,990 and at 2,790
// at the same moment, both published, both saying "במלאי". A customer
// taking the obvious one would have been sold a machine costing the shop
// 3,680 for 2,790, and nothing anywhere would have said a word.
//
// Every pair below is real, out of the catalogue on the day this was
// written. Eight of them have a listing priced under a twin's cost; the
// worst is a Sharp SJ-3850WH at 4,790 against a twin costing 8,590 —
// 3,800 ₪ a unit.
//
// Two filters are asserted here because both were measured and both are
// the kind somebody would "simplify" later:
//
//  * a DIFFERENT COLOUR does not clear a pair. Two of the eight losing
//    pairs are genuine finish variants whose supplier gave both finishes
//    one model code and two different costs, so the loss is just as real.
//  * EQUAL PRICES are not reported at all. 47 model codes are worn by two
//    published products; only 21 disagree about the price, and raising
//    the other 26 would bury the eight that can cost money.
//
// Run: npx tsx scripts/check-duplicate-listings.ts
import {
  MIN_MODEL_KEY_LENGTH,
  duplicateMessage,
  findDuplicateListings,
  modelKey,
  type Listing,
} from "../src/lib/inventory/duplicate-listings";

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

let seq = 0;
const listing = (p: Partial<Listing> & { sku: string; model: string; price: number }): Listing => ({
  id: `p${seq++}`,
  title: p.title ?? `מוצר ${p.sku}`,
  supplierCost: p.supplierCost ?? null,
  stockQty: p.stockQty ?? 0,
  colorName: p.colorName ?? null,
  isPublished: p.isPublished ?? true,
  ...p,
});

/* ── the founding case ──────────────────────────────────────────────── */
const bosch = [
  listing({ sku: "140201", model: "SMS4ECW28E", price: 2790, supplierCost: 2350, stockQty: 2, title: "מדיח כלים בוש" }),
  listing({ sku: "1358", model: "SMS 4ECW28E", price: 3990, supplierCost: 3680, stockQty: 1 }),
];
const boschFound = findDuplicateListings(bosch);
expect("the Bosch pair is found", boschFound.length, 1);
expect("…under one normalised code", boschFound[0]?.key, "SMS4ECW28E");
expect("…as a money problem", boschFound[0]?.severity, "CRITICAL");
expect("…worth 890 ₪ a unit", boschFound[0]?.lossPerUnit, 890);
expect("…and buyable right now", boschFound[0]?.buyableNow, true);
expect("…cheapest first", boschFound[0]?.listings[0]?.sku, "140201");

/* ── the eight real losing pairs ────────────────────────────────────── */
const REAL: [string, Listing[], number][] = [
  [
    "SJ3850WH — Sharp fridge, the worst of them",
    [
      listing({ sku: "0764", model: "SJ-3850WH", price: 4790, supplierCost: 4300, colorName: "לבן" }),
      listing({ sku: "108911", model: "SJ3850WH", price: 9200, supplierCost: 8590 }),
    ],
    3800,
  ],
  [
    "SAROS20 — Roborock",
    [
      listing({ sku: "700740", model: "Saros 20", price: 3690, supplierCost: 3200 }),
      listing({ sku: "1155", model: "SAROS20", price: 5800, supplierCost: 5290 }),
    ],
    1600,
  ],
  [
    "H7260BP — Miele oven, same colour, three in stock",
    [
      listing({ sku: "157260", model: "H 7260 BP", price: 7900, supplierCost: 7200, stockQty: 3, colorName: "שחור" }),
      listing({ sku: "150653", model: "H7260BP", price: 10900, supplierCost: 9500, colorName: "שחור" }),
    ],
    1600,
  ],
  [
    "SN65EX22CE — Siemens",
    [
      listing({ sku: "146100", model: "SN65EX22CE", price: 3300, supplierCost: 3000 }),
      listing({ sku: "0670", model: "SN65EX22CE", price: 4600, supplierCost: 4290 }),
    ],
    990,
  ],
  [
    "MWB5634 — Sauter, steel against black: a REAL finish variant that still loses money",
    [
      listing({ sku: "155546", model: "MWB5634", price: 1190, supplierCost: 850, stockQty: 1, colorName: "נירוסטה" }),
      listing({ sku: "157810", model: "MWB5634", price: 2700, supplierCost: 1990, stockQty: 1, colorName: "שחור" }),
    ],
    800,
  ],
  [
    "TSF01PBEU — Smeg toaster, same colour twice",
    [
      listing({ sku: "720032", model: "TSF01PBEU", price: 800, supplierCost: 700, stockQty: 2, colorName: "כחול" }),
      listing({ sku: "726204", model: "TSF01PBEU", price: 1300, supplierCost: 930, stockQty: 1 }),
    ],
    130,
  ],
  [
    "AW650 — Proficient speakers",
    [
      listing({ sku: "554650", model: "AW650", price: 1490, supplierCost: 1300 }),
      listing({ sku: "551650", model: "AW-650", price: 2490, supplierCost: 1620 }),
    ],
    130,
  ],
  [
    "LC20MGB — LaCasa, black against white: the other real finish variant",
    [
      listing({ sku: "189961", model: "LC20MGB", price: 300, supplierCost: 200, stockQty: 1, colorName: "שחור" }),
      listing({ sku: "189962", model: "LC20MGB", price: 450, supplierCost: 400, stockQty: 1, colorName: "לבן" }),
    ],
    100,
  ],
];

for (const [label, listings, loss] of REAL) {
  const found = findDuplicateListings(listings);
  expect(`${label}: flagged`, found.length, 1);
  expect(`${label}: CRITICAL`, found[0]?.severity, "CRITICAL");
  expect(`${label}: loss`, found[0]?.lossPerUnit, loss);
}

/* All eight in one sweep, worst money first. */
const sweep = findDuplicateListings(REAL.flatMap(([, l]) => l));
expect("all eight found together", sweep.length, 8);
expect("worst loss first", sweep[0]?.lossPerUnit, 3800);
expect("…and it is the Sharp", sweep[0]?.key, "SJ3850WH");
expect("smallest last", sweep[sweep.length - 1]?.lossPerUnit, 100);

/* ── what must NOT be reported ──────────────────────────────────────── */
expect(
  "two records at the SAME price are untidy, not dangerous",
  findDuplicateListings([
    listing({ sku: "a", model: "RF59C701EB1", price: 6800, supplierCost: 6000 }),
    listing({ sku: "b", model: "RF59C701EB1", price: 6800, supplierCost: 6000 }),
  ]).length,
  0,
);
expect(
  "an unpublished twin cannot be bought",
  findDuplicateListings([
    listing({ sku: "a", model: "SMS4ECW28E", price: 2790, supplierCost: 2350 }),
    listing({ sku: "b", model: "SMS4ECW28E", price: 3990, supplierCost: 3680, isPublished: false }),
  ]).length,
  0,
);
expect("a product alone is not a duplicate", findDuplicateListings([listing({ sku: "a", model: "SMS4ECW28E", price: 2790 })]).length, 0);
expect("nothing at all", findDuplicateListings([]).length, 0);
expect(
  "two different models are two products",
  findDuplicateListings([
    listing({ sku: "a", model: "SMS4ECW28E", price: 2790 }),
    listing({ sku: "b", model: "SMS4ECI28E", price: 4200 }),
  ]).length,
  0,
);
/* Prices differ but nothing sits below a cost: real, but only untidiness. */
const untidy = findDuplicateListings([
  listing({ sku: "110417", model: "NF-417", price: 1890, supplierCost: 1290, stockQty: 1 }),
  listing({ sku: "110418", model: "NF417", price: 1990, supplierCost: 1340, stockQty: 1 }),
]);
expect("the AIWA pair is still reported", untidy.length, 1);
expect("…but only as a warning", untidy[0]?.severity, "WARNING");
expect("…with no loss to quote", untidy[0]?.lossPerUnit, null);

/* ── the model key ──────────────────────────────────────────────────── */
expect("spaces come out", modelKey("SMS 4ECW28E"), "SMS4ECW28E");
expect("hyphens too", modelKey("SJ-3850WH"), "SJ3850WH");
expect("case is levelled", modelKey("sms4ecw28e"), "SMS4ECW28E");
expect("and everything at once", modelKey(" h 7260-bp "), "H7260BP");
expect("exactly the minimum is kept", modelKey("AW650"), "AW650");
expect(`under ${MIN_MODEL_KEY_LENGTH} is not a model`, modelKey("X100"), null);
expect("a brand name is not a model", modelKey("CASO"), null);
expect("punctuation only", modelKey("---"), null);
expect("empty", modelKey(""), null);
expect("missing", modelKey(null), null);

/* ── the line a person reads ────────────────────────────────────────── */
const message = duplicateMessage(boschFound[0]);
checked++;
if (!message.includes("890")) fail("the message must quote the loss");
checked++;
if (!message.includes("140201") || !message.includes("1358")) fail("the message must name both SKUs");
checked++;
if (!duplicateMessage(untidy[0]).includes("צריך להחליט")) fail("a warning must still say what to do");
checked++;
if (duplicateMessage(untidy[0]).includes("הפסד")) fail("a warning must not claim a loss it does not have");

console.log(
  `${checked - failed}/${checked} passed  (8 real losing pairs, worst 3,800 ₪/unit; ` +
    `colour does not clear, equal prices not reported)`,
);
process.exit(failed === 0 ? 0 : 1);
