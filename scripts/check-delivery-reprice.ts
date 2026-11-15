// A pending order whose delivery method changes at the checkout has to be
// re-priced: collecting is free, home delivery under the threshold is not.
// See deliveryFeeAfterMethodChange in lib/delivery.ts.
//
// Run: npx tsx scripts/check-delivery-reprice.ts
import { deliveryFeeAfterMethodChange, FREE_DELIVERY_THRESHOLD, HOME_DELIVERY_FEE } from "../src/lib/delivery";

type Order = Parameters<typeof deliveryFeeAfterMethodChange>[0];
type Next = Parameters<typeof deliveryFeeAfterMethodChange>[1];

const under = FREE_DELIVERY_THRESHOLD - 110;
const over = FREE_DELIVERY_THRESHOLD + 1900;
const order = (o: Partial<Order>): Order => ({
  subtotal: under,
  discountTotal: 0,
  deliveryMethod: "DELIVERY",
  deliveryFee: HOME_DELIVERY_FEE,
  couponCode: null,
  ...o,
});

const CASES: [name: string, o: Order, next: Next, expected: number | null][] = [
  ["delivery → collection drops the charge", order({}), "PICKUP", 0],
  ["delivery → pickup point drops the charge", order({}), "PICKUP_POINT", 0],
  ["collection → delivery, under the threshold, adds it", order({ deliveryMethod: "PICKUP", deliveryFee: 0 }), "DELIVERY", HOME_DELIVERY_FEE],
  ["collection → delivery, over the threshold, stays free", order({ subtotal: over, deliveryMethod: "PICKUP", deliveryFee: 0 }), "DELIVERY", 0],
  ["a discount that takes the basket under the threshold counts", order({ subtotal: FREE_DELIVERY_THRESHOLD + 50, discountTotal: 100, deliveryMethod: "PICKUP", deliveryFee: 0 }), "DELIVERY", HOME_DELIVERY_FEE],
  ["delivery stays what it was charged", order({ deliveryFee: 0, couponCode: "FREESHIP" }), "DELIVERY", 0],
  ["collection → delivery with a coupon, under the threshold, is not guessed", order({ deliveryMethod: "PICKUP", deliveryFee: 0, couponCode: "X" }), "DELIVERY", null],
  ["collection → delivery with a coupon, over the threshold, is free anyway", order({ subtotal: over, deliveryMethod: "PICKUP", deliveryFee: 0, couponCode: "X" }), "DELIVERY", 0],
  ["collection with a coupon → pickup point is still free", order({ deliveryMethod: "PICKUP", deliveryFee: 0, couponCode: "X" }), "PICKUP_POINT", 0],
];

let failed = 0;
for (const [name, o, next, expected] of CASES) {
  const got = deliveryFeeAfterMethodChange(o, next);
  if (got !== expected) {
    failed++;
    console.error(`FAIL  ${name}: expected ${expected}, got ${got}`);
  }
}
console.log(`${CASES.length - failed}/${CASES.length} passed`);
if (failed) process.exit(1);
