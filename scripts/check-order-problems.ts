// What blocks "נמסר ללקוח — סגור", and what must not.
//
// A `block` disables the one button that finishes an order, so it has to
// be something that genuinely must be settled first — and the stock check
// was not.
//
// PR-430724: a Blomberg TGA182PZ dryer, paid, picked, packed, shipped on
// 26 August and delivered. The shelf says 0 **because that dryer is the
// one that left**, and the back office refused to let anybody close the
// order over it. Not a one-off: every order that sells the last unit of
// something lands here. Of the three orders carrying this block when it
// was found, two had already shipped.
//
// So stock is asked only of an order somebody still has to pick. The
// three real rows below are the fixture: two shipped (must close), one
// still in PROCESSING with nothing on the shelf (must stay blocked —
// that one is a real phone call to a supplier).
//
// Run: npx tsx scripts/check-order-problems.ts
import { orderProblems, stillToBePicked, type ProblemInput } from "../src/lib/order-problems";

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

const SHIPPED_ON = new Date("2026-08-26T13:54:00Z");

const order = (patch: Partial<ProblemInput> = {}): ProblemInput => ({
  status: "PROCESSING",
  deliveryMethod: "DELIVERY",
  shippedAt: null,
  address: "השופר 26 דירה 1 מעלה אדומים",
  phone: "0549811129",
  items: [{ titleSnap: "מייבש כביסה", quantity: 1, product: { stockQty: 5 } }],
  ...patch,
});

const blocks = (input: ProblemInput) => orderProblems(input).some((p) => p.severity === "block");
const texts = (input: ProblemInput) => orderProblems(input).map((p) => p.text);

/* ── the three real orders ──────────────────────────────────────────── */
const soldOut = [{ titleSnap: "מייבש כביסה בלומברג Blomberg TGA182PZ", quantity: 1, product: { stockQty: 0 } }];

expect(
  "PR-430724 — shipped in August, shelf empty: closable",
  blocks(order({ status: "SHIPPED", shippedAt: SHIPPED_ON, items: soldOut })),
  false,
);
expect(
  "PR-424248 — the Beko, same shape: closable",
  blocks(order({ status: "SHIPPED", shippedAt: SHIPPED_ON, items: soldOut })),
  false,
);
expect(
  "PR-318925 — still in PROCESSING with nothing on the shelf: BLOCKED",
  blocks(order({ status: "PROCESSING", shippedAt: null, items: soldOut })),
  true,
);
expect(
  "and the block still says what is missing",
  texts(order({ status: "PROCESSING", items: soldOut }))[0],
  "מייבש כביסה בלומברג Blomberg TGA182PZ — הוזמנו 1, במלאי 0",
);

/* ── the warehouse door ─────────────────────────────────────────────── */
for (const status of ["NEW", "PAID", "PROCESSING", "AWAITING_SUPPLIER", "SUPPLIER_CONFIRMED", "READY_FOR_DELIVERY"]) {
  expect(`${status} is still to be picked`, stillToBePicked({ status, shippedAt: null }), true);
  expect(`so ${status} blocks on an empty shelf`, blocks(order({ status, items: soldOut })), true);
}
for (const status of ["SHIPPED", "DELIVERED", "CANCELLED", "REFUND_PENDING", "REFUNDED"]) {
  expect(`${status} is past picking`, stillToBePicked({ status, shippedAt: null }), false);
  expect(`so ${status} does not block`, blocks(order({ status, items: soldOut })), false);
}

/* shippedAt is asked FIRST, and that is not a detail:
   - an order marked DELIVERED straight from PROCESSING never passes
     through SHIPPED, and
   - the undo button can walk a status backwards while the goods are long
     gone, which would otherwise re-block an order that has shipped. */
expect(
  "a status walked back after the goods left",
  stillToBePicked({ status: "PROCESSING", shippedAt: SHIPPED_ON }),
  false,
);
expect(
  "and it stays closable",
  blocks(order({ status: "PROCESSING", shippedAt: SHIPPED_ON, items: soldOut })),
  false,
);

/* ── what must keep blocking, before AND after shipping ─────────────── */
/* These are not picking concerns. An order that went out with no address
   recorded is a thing somebody has to fix, not a thing time makes true. */
expect("a delivery with no address", blocks(order({ address: "" })), true);
expect(
  "…still, after it shipped",
  blocks(order({ status: "SHIPPED", shippedAt: SHIPPED_ON, address: "" })),
  true,
);
expect("no phone at all", blocks(order({ phone: null })), true);
expect(
  "…still, after it shipped",
  blocks(order({ status: "DELIVERED", shippedAt: SHIPPED_ON, phone: null })),
  true,
);
/* A pickup order has no address to want. */
expect("collection needs no address", blocks(order({ deliveryMethod: "PICKUP", address: "" })), false);
expect("nor does a pickup point", blocks(order({ deliveryMethod: "PICKUP_POINT", address: "" })), false);

/* ── the ordinary cases ─────────────────────────────────────────────── */
expect("a healthy order has nothing to say", orderProblems(order()).length, 0);
expect("enough stock is not a problem", blocks(order({ items: [{ titleSnap: "x", quantity: 2, product: { stockQty: 2 } }] })), false);
expect("one short is", blocks(order({ items: [{ titleSnap: "x", quantity: 3, product: { stockQty: 2 } }] })), true);
expect("no items at all", orderProblems(order({ items: [] })).length, 0);

/* A product deleted from the catalogue is a warning, not a block — the
   order can still be closed — and it is a picking concern too, so it
   goes quiet once the goods have left. */
const gone = [{ titleSnap: "מוצר שנמחק", quantity: 1, product: null }];
expect("a vanished product warns", orderProblems(order({ items: gone }))[0]?.severity, "warn");
expect("and does not block", blocks(order({ items: gone })), false);
expect("and is silent after shipping", orderProblems(order({ status: "SHIPPED", shippedAt: SHIPPED_ON, items: gone })).length, 0);

/* Several at once, each named. */
const messy = orderProblems(
  order({
    address: "",
    phone: null,
    items: [
      { titleSnap: "א", quantity: 1, product: { stockQty: 0 } },
      { titleSnap: "ב", quantity: 1, product: { stockQty: 0 } },
    ],
  }),
);
expect("every problem is listed", messy.length, 4);
expect("and all of them block", messy.filter((p) => p.severity === "block").length, 4);

console.log(
  `${checked - failed}/${checked} passed  (3 real orders: 2 shipped now closable, ` +
    `1 unpicked still blocked)`,
);
process.exit(failed === 0 ? 0 : 1);
