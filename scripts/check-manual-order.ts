// A sale that happened on the phone, typed into the back office.
//
// Three things this guards, each of which is a rule from somewhere else in
// the codebase that this form either honours or deliberately does not:
//
//  * The address rule is the checkout's, read from the same
//    `requiresAddress` — a pickup point still needs one, our own counter
//    does not. Two forms disagreeing about that is how an order reaches the
//    back office with nowhere to send it.
//  * A missing cost makes the margin NULL, never zero. Treating "we do not
//    know what this cost us" as "it cost us nothing" reports the largest
//    possible profit, which is the most expensive way to be wrong here.
//  * The attribution it writes has to satisfy the real attribution schema.
//    It is a Json column, so a wrong shape is accepted by the database and
//    then renders as nothing on the order page — a failure with no error.
//
// Run: npx tsx scripts/check-manual-order.ts
import { attributionSchema } from "../src/lib/attribution";
import {
  MANUAL_ORDER_MAX_LINES,
  MANUAL_ORDER_MAX_QTY,
  manualOrderAttribution,
  manualOrderSchema,
  manualOrderTotals,
  round2,
} from "../src/lib/manual-order";

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

/* A form filled in the ordinary way: one item, delivered, already paid. */
const BASE = {
  lines: [{ productId: "p1", quantity: 1, unitPrice: 290 }],
  customerName: "דניאל הלוי",
  customerPhone: "054-726-3587",
  customerEmail: "",
  deliveryMethod: "DELIVERY" as const,
  city: "אשקלון",
  street: "הרצל",
  houseNo: "12",
  apartment: "",
  deliveryFee: 0,
  deliveryCost: null,
  customerNote: "",
  paid: true,
  paymentMethod: "BIT" as const,
  paymentReference: "",
};

const accepts = (label: string, patch: Record<string, unknown>) => {
  checked++;
  const result = manualOrderSchema.safeParse({ ...BASE, ...patch });
  if (!result.success) fail(`should accept ${label}: ${result.error.issues[0]?.message}`);
};
const rejects = (label: string, patch: Record<string, unknown>, onPath?: string) => {
  checked++;
  const result = manualOrderSchema.safeParse({ ...BASE, ...patch });
  if (result.success) {
    fail(`should reject ${label}`);
    return;
  }
  if (onPath) {
    checked++;
    const paths = result.error.issues.map((i) => i.path.join("."));
    if (!paths.includes(onPath)) fail(`${label} should complain about "${onPath}", complained about ${paths.join(", ")}`);
  }
};

accepts("the ordinary filled form", {});
accepts("an unpaid order with no method", { paid: false, paymentMethod: undefined });
accepts("an email left blank", { customerEmail: "" });
accepts("a real email", { customerEmail: "a@b.co.il" });
accepts("collection from our own counter, with no address at all", {
  deliveryMethod: "PICKUP",
  city: "",
  street: "",
  houseNo: "",
});
accepts("a free item", { lines: [{ productId: "p1", quantity: 1, unitPrice: 0 }] });
accepts("the longest allowed order", {
  lines: Array.from({ length: MANUAL_ORDER_MAX_LINES }, (_, i) => ({
    productId: `p${i}`,
    quantity: 1,
    unitPrice: 10,
  })),
});
accepts("the largest allowed quantity", {
  lines: [{ productId: "p1", quantity: MANUAL_ORDER_MAX_QTY, unitPrice: 10 }],
});

/* The price may be anything the salesperson agreed, below cost included.
   This is the one rule the form deliberately does NOT enforce — see the
   header of lib/manual-order.ts — and it is asserted so that nobody adds
   the check later thinking it was an oversight. The form shows the margin
   in red instead. */
accepts("a price the salesperson agreed, whatever it is", {
  lines: [{ productId: "p1", quantity: 1, unitPrice: 1 }],
});

rejects("an order with no items", { lines: [] }, "lines");
rejects("a quantity of zero", { lines: [{ productId: "p1", quantity: 0, unitPrice: 10 }] });
rejects("a fractional quantity", { lines: [{ productId: "p1", quantity: 1.5, unitPrice: 10 }] });
rejects("a negative price", { lines: [{ productId: "p1", quantity: 1, unitPrice: -5 }] });
rejects("one item too many", {
  lines: Array.from({ length: MANUAL_ORDER_MAX_LINES + 1 }, (_, i) => ({
    productId: `p${i}`,
    quantity: 1,
    unitPrice: 10,
  })),
});
rejects("no name", { customerName: "" }, "customerName");
rejects("no phone", { customerPhone: "" }, "customerPhone");
rejects("a malformed email", { customerEmail: "not-an-email" }, "customerEmail");
rejects("paid with no method", { paid: true, paymentMethod: undefined }, "paymentMethod");
rejects("a delivery with no city", { city: "" }, "city");
rejects("a delivery with no street", { street: "" }, "street");
rejects("a delivery with no house number", { houseNo: "" }, "houseNo");
/* A pickup POINT is not our counter: the carrier arranges it with the
   customer and still needs to know roughly where they are. Same rule as
   the checkout's, and the reason it is read from requiresAddress rather
   than written out again here. */
rejects("a pickup point with no address", { deliveryMethod: "PICKUP_POINT", city: "" }, "city");
rejects("a negative delivery fee", { deliveryFee: -1 });

/* A phone number is deliberately not format-checked: they arrive as
   054-123-4567, +972…, with spaces, and a form that refuses one mid-call
   loses the order. */
for (const phone of ["0547263587", "054-726-3587", "+972 54 726 3587", "04-6224041"]) {
  accepts(`the phone written as ${phone}`, { customerPhone: phone });
}

/* ── the money ───────────────────────────────────────────────────────── */
const line = (quantity: number, unitPrice: number, unitCost: number | null) => ({ quantity, unitPrice, unitCost });

const one = manualOrderTotals([line(1, 290, 236)], 0);
expect("subtotal of one item", one.subtotal, 290);
expect("total with free delivery", one.total, 290);
expect("cost", one.cost, 236);
expect("margin", one.margin, 54);
expect("margin percent", one.marginPct, 19);

const many = manualOrderTotals([line(2, 290, 236), line(3, 100, 60)], 49, 35);
expect("subtotal over several lines", many.subtotal, 880);
expect("total includes the fee", many.total, 929);
expect("cost includes the courier", many.cost, 687);
expect("margin after delivery", many.margin, 242);

/* A missing cost on ONE line makes the whole figure unanswerable. */
const partial = manualOrderTotals([line(1, 290, 236), line(1, 100, null)], 0);
expect("cost is null when any line lacks one", partial.cost, null);
expect("so is the margin", partial.margin, null);
expect("and the percent", partial.marginPct, null);
expect("but the money still adds up", partial.total, 390);

/* A missing DELIVERY cost is a different unknown: the goods margin is
   still meaningful, measured before delivery. */
const beforeDelivery = manualOrderTotals([line(1, 290, 236)], 49, null);
expect("margin before the courier bill", beforeDelivery.margin, 103);
expect("and the cost is the goods alone", beforeDelivery.cost, 236);

/* Selling under cost has to come out negative rather than clamp. */
const under = manualOrderTotals([line(1, 100, 236)], 0);
expect("a loss is a loss", under.margin, -136);
expect("and its percent is negative", under.marginPct, -136);

/* Float money. 0.1 + 0.2 is the reason round2 exists. */
const pennies = manualOrderTotals([line(3, 0.1, 0.05)], 0.2);
expect("subtotal rounds", pennies.subtotal, 0.3);
expect("total rounds", pennies.total, 0.5);
expect("cost rounds", pennies.cost, 0.15);
expect("round2 on the classic case", round2(0.1 + 0.2), 0.3);
expect("round2 leaves whole numbers alone", round2(290), 290);
expect("round2 is half-up", round2(1.005), 1.01);

const free = manualOrderTotals([line(1, 0, 0)], 0);
expect("a zero-total order has no percent to report", free.marginPct, null);
expect("but its cost is known and zero", free.cost, 0);

const empty = manualOrderTotals([], 0);
expect("no lines, no money", empty.total, 0);
expect("and no cost to speak of", empty.cost, 0);

/* ── the attribution column ──────────────────────────────────────────── */
const attribution = manualOrderAttribution(new Date("2026-10-26T12:00:00Z"));
checked++;
const attributionOk = attributionSchema.safeParse(attribution);
if (!attributionOk.success) {
  fail(`the attribution written for a manual order is not a valid Attribution: ${attributionOk.error.issues[0]?.message}`);
}
expect("it names the back office", attribution.first.source, "back-office");
expect("as a manual touch", attribution.first.medium, "manual");

console.log(`${checked - failed}/${checked} passed`);
process.exit(failed === 0 ? 0 : 1);
