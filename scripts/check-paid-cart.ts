/**
 * A paid basket does not become a second order.
 *
 * PR-280912, 6 November: the customer paid PR-810952 (Pelecard 000 at
 * 09:52:12), came back to /checkout 88 seconds later with the item still in
 * the cart — it was only ever emptied by the confirmation page — and the
 * checkout opened a new order and a new payment form for the same speaker.
 *
 * Two halves, both checked here:
 *
 *   - the rule (lib/paid-cart-rules.ts): which recent paid order, if any, a
 *     cart is already paid as. Founded on that case and its near misses.
 *   - the wiring: the Pelecard callback empties the cart after the payment
 *     is written, and createOrderAction asks the rule before it creates an
 *     order. A refactor that drops either call fails here.
 *
 * No database and no network.
 *
 *   npm run check:paid-cart
 */

import { readFileSync } from "fs";
import { join } from "path";
import { matchPaidOrder, matchPaidOverlap, sameCustomer, sameItems, type PaidCandidate } from "../src/lib/paid-cart-rules";

let failures = 0;
function check(label: string, ok: boolean) {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}`);
  if (!ok) failures++;
}

const now = new Date("2026-11-06T07:53:43Z");
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);
const speaker = { productId: "cmv48adt802ge06l8d9qv8q4d", quantity: 1 };

const paid810952: PaidCandidate = {
  orderNumber: "PR-810952",
  paymentStatus: "CAPTURED",
  createdAt: minutesAgo(2.5),
  items: [speaker],
};

console.log("\nThe founding case");
check("PR-280912's cart is recognised as PR-810952", matchPaidOrder([speaker], [paid810952], now) === "PR-810952");
check(
  "a held (J5) payment counts as paid",
  matchPaidOrder([speaker], [{ ...paid810952, paymentStatus: "AUTHORIZED" }], now) === "PR-810952",
);

console.log("\nWhat is not the same basket, or not paid");
check("a pending order does not block", matchPaidOrder([speaker], [{ ...paid810952, paymentStatus: "PENDING" }], now) === null);
check("a failed payment does not block", matchPaidOrder([speaker], [{ ...paid810952, paymentStatus: "FAILED" }], now) === null);
check("two of them is a different basket", matchPaidOrder([{ ...speaker, quantity: 2 }], [paid810952], now) === null);
check(
  "an extra product is a different basket",
  matchPaidOrder([speaker, { productId: "other", quantity: 1 }], [paid810952], now) === null,
);
check("61 minutes later is a new purchase", matchPaidOrder([speaker], [{ ...paid810952, createdAt: minutesAgo(61) }], now) === null);
check("59 minutes later is still the same one", matchPaidOrder([speaker], [{ ...paid810952, createdAt: minutesAgo(59) }], now) === "PR-810952");
check("an empty cart matches nothing", matchPaidOrder([], [paid810952], now) === null);

console.log("\nThe comparison");
check(
  "order of lines does not matter",
  sameItems(
    [{ productId: "a", quantity: 1 }, { productId: "b", quantity: 2 }],
    [{ productId: "b", quantity: 2 }, { productId: "a", quantity: 1 }],
  ),
);
check(
  "split lines add up",
  sameItems([{ productId: "a", quantity: 1 }, { productId: "a", quantity: 1 }], [{ productId: "a", quantity: 2 }]),
);
check(
  "the newest matching order is the one named",
  matchPaidOrder(
    [speaker],
    [paid810952, { ...paid810952, orderNumber: "PR-NEWER", createdAt: minutesAgo(1) }],
    now,
  ) === "PR-NEWER",
);

console.log("\nPartial overlap (gap 3): asked, not blocked");
const fridge = { productId: "fridge", quantity: 1 };
const dishwasher = { productId: "dishwasher", quantity: 1 };
const paidFridge: PaidCandidate = { orderNumber: "PR-913025", paymentStatus: "AUTHORIZED", createdAt: minutesAgo(14), items: [fridge] };
check(
  "fridge paid, back with fridge + dishwasher → overlap on the fridge",
  JSON.stringify(matchPaidOverlap([fridge, dishwasher], [paidFridge], now)) ===
    JSON.stringify({ orderNumber: "PR-913025", productIds: ["fridge"] }),
);
check("nothing in common → no overlap", matchPaidOverlap([dishwasher], [paidFridge], now) === null);
check("a pending order is not an overlap", matchPaidOverlap([fridge], [{ ...paidFridge, paymentStatus: "PENDING" }], now) === null);
check("61 minutes ago is not an overlap", matchPaidOverlap([fridge], [{ ...paidFridge, createdAt: minutesAgo(61) }], now) === null);

console.log("\nThe same customer by what they typed (gap 2)");
const onOrder = { guestPhone: "050-1234567", guestEmail: "Buyer@Example.com" };
check("same phone, another spelling", sameCustomer({ phone: "+972 50 123 4567" }, onOrder));
check("same email, another case", sameCustomer({ email: " buyer@example.com" }, onOrder));
check("different phone and email", !sameCustomer({ phone: "052-9999999", email: "x@example.com" }, onOrder));
check("a short phone identifies nobody", !sameCustomer({ phone: "123" }, { guestPhone: "123", guestEmail: null }));
check("nothing typed identifies nobody", !sameCustomer({}, onOrder));

console.log("\nThe wiring");
const root = join(__dirname, "..");
const callback = readFileSync(join(root, "src/app/api/pelecard/callback/route.ts"), "utf8");
const paymentWritten = callback.indexOf("db.payment.update(");
const emptied = callback.indexOf("await emptyPaidOrderFromCart(order)");
check("the callback empties the cart", emptied > 0);
check("…after the payment is written", paymentWritten > 0 && emptied > paymentWritten);

const actions = readFileSync(join(root, "src/actions/orders.ts"), "utf8");
const create = actions.slice(actions.indexOf("export async function createOrderAction"));
const asked = create.indexOf("findRecentlyPaidOrder(");
const created = create.indexOf("db.order.create(");
check("createOrderAction asks whether the basket was just paid", asked > 0);
check("…before it creates an order", asked > 0 && created > asked);

const form = readFileSync(join(root, "src/components/checkout/checkout-form.tsx"), "utf8");
check("the checkout shows the paid order instead of an error toast", form.includes("alreadyPaidOrderNumber"));
check("the checkout asks on a partial overlap", form.includes("paidOverlapOrderNumber") && form.includes("confirmPaidOverlap"));
check("createOrderAction passes the typed phone and email", create.includes("phone: data.phone") && create.includes("email: data.email"));

console.log(failures ? `\n${failures} failed.` : "\nA paid basket does not become a second order.");
process.exit(failures ? 1 : 0);
