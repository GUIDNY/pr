/**
 * What an order made, and what the figure is allowed to claim.
 *
 * The arithmetic is simple and the honesty is not, so most of this is about
 * the second. A profit panel is read while deciding whether a price was worth
 * taking, and the two ways it can lie quietly are both guarded here:
 *
 *   a product with no cost on record, counted as free, reads as 100% margin
 *   a delivery nobody has priced, counted as zero, reads as a free courier
 *
 * In both cases the figure is an upper bound and `certain` has to be false,
 * which is what makes the panel say "לכל היותר" instead of stating a number.
 *
 *   npm run check:profit
 */

import { readFileSync } from "fs";
import { orderProfit } from "../src/lib/order-profit";

let failures = 0;

function is(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${ok ? "" : `  (got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)})`}`);
}

const line = (price: number, cost: number | null, quantity = 1) => ({ priceSnap: price, costSnap: cost, quantity });

console.log("\nAn ordinary order");
const plain = orderProfit({ lines: [line(2100, 1700)], discount: 0, deliveryIncome: 0, deliveryCost: 0 });
is("sold for", plain.revenue, 2100);
is("cost", plain.goodsCost, 1700);
is("profit", plain.profit, 400);
is("margin", Math.round((plain.margin ?? 0) * 100), 19);
is("and it is a figure, not a bound", plain.certain, true);

console.log("\nQuantity counts, on both sides");
const two = orderProfit({ lines: [line(650, 500, 3)], discount: 0, deliveryIncome: 0, deliveryCost: 0 });
is("three of them sold", two.revenue, 1950);
is("three of them cost", two.goodsCost, 1500);
is("profit", two.profit, 450);

console.log("\nThe discount comes off the profit, not off the cost");
const discounted = orderProfit({ lines: [line(2100, 1700)], discount: 100, deliveryIncome: 0, deliveryCost: 0 });
is("profit", discounted.profit, 300);
is("revenue is still what it sold for", discounted.revenue, 2100);

console.log("\nDelivery, both halves — the line the dashboard leaves out");
const paidOwn = orderProfit({ lines: [line(2100, 1700)], discount: 0, deliveryIncome: 50, deliveryCost: 120 });
is("the customer's ₪50 is income and the courier's ₪120 is not", paidOwn.profit, 330);
const free = orderProfit({ lines: [line(2100, 1700)], discount: 0, deliveryIncome: 0, deliveryCost: 120 });
is("free delivery is the shop paying for it", free.profit, 280);
const collected = orderProfit({ lines: [line(2100, 1700)], discount: 0, deliveryIncome: 0, deliveryCost: 0 });
is("collected from the branch costs nothing", collected.profit, 400);

console.log("\nA missing cost is not a free product");
const missing = orderProfit({ lines: [line(2100, null)], discount: 0, deliveryIncome: 0, deliveryCost: 0 });
is("it is not counted as cost", missing.goodsCost, 0);
is("it is counted as missing", missing.linesMissingCost, 1);
is("and the figure stops claiming to be one", missing.certain, false);
const half = orderProfit({ lines: [line(2100, 1700), line(650, null)], discount: 0, deliveryIncome: 0, deliveryCost: 0 });
is("one missing among two", half.linesMissingCost, 1);
is("the known cost still counts", half.goodsCost, 1700);
is("still a bound", half.certain, false);

console.log("\nA delivery cost nobody has entered is not a free delivery");
const unpriced = orderProfit({ lines: [line(2100, 1700)], discount: 0, deliveryIncome: 0, deliveryCost: null });
is("null is not treated as zero in the claim", unpriced.certain, false);
is("though the arithmetic has to put something there", unpriced.profit, 400);
is("and zero, entered on purpose, is certain", collected.certain, true);

console.log("\nEdges");
const empty = orderProfit({ lines: [], discount: 0, deliveryIncome: 0, deliveryCost: 0 });
is("an order with no lines has no margin to show", empty.margin, null);
is("and no profit", empty.profit, 0);
const loss = orderProfit({ lines: [line(1000, 1200)], discount: 0, deliveryIncome: 0, deliveryCost: 0 });
is("a loss is reported as a loss", loss.profit, -200);
is("and its margin is negative", Math.round((loss.margin ?? 0) * 100), -20);

/* The panel has to admit what the number leaves out, or somebody prices
   against a margin that quietly omits the clearing fee. */
console.log("\nThe panel says what the number excludes");
const page = readFileSync("src/components/admin/seller-order-page.tsx", "utf8");
is("clearing fee and VAT are named on screen", /לפני עמלת סליקה ולפני מע״מ/.test(page), true);
is("an unentered delivery cost is said out loud", /עלות המשלוח עוד לא הוזנה/.test(page), true);
is("a missing product cost is said out loud", /אין עלות רשומה/.test(page), true);
is("an uncertain profit is labelled a bound", /רווח — לכל היותר/.test(page), true);

console.log(failures === 0 ? "\nThe profit figure adds up, and admits what it cannot know.\n" : `\n${failures} profit rule(s) BROKEN.\n`);
process.exit(failures === 0 ? 0 : 1);
