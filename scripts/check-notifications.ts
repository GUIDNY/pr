/**
 * A customer hears from the shop because somebody pressed send.
 *
 * Asked for by the shop's owner on 26 October: approving a payment, marking an
 * order shipped or closing it used to message the customer as a side effect of
 * moving the order. A status corrected a minute later had already been
 * announced, and there is no way to unsend a WhatsApp.
 *
 * So every send from the back office now goes through
 * resendNotificationAction, which is what the buttons on the order page call,
 * and nothing in seller-orders.ts may notify on its own. The rule is written
 * as "every notifyOrder call in that file passes force: true", because that is
 * the shape the manual path has and the automatic one never did.
 *
 * The one exception is the opposite kind of mistake and is guarded in the
 * other direction: ORDER_RECEIVED fires when the customer places the order.
 * Nobody pressed anything, nobody is in the back office at 2am, and a customer
 * who has just paid and hears nothing has been left wondering whether it went
 * through. If a later tidy-up removes it, this fails.
 *
 *   npm run check:notify
 */

import { readFileSync } from "fs";

let failures = 0;

function is(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${ok ? "" : `  (got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)})`}`);
}

const seller = readFileSync("src/actions/seller-orders.ts", "utf8");

/* Every call, with whatever it was given. A call with no force argument is an
   order that messages a customer because its status moved. */
/* [^;] rather than a dot with the s flag: tsconfig targets ES2017, dotAll
   needs ES2018, and tsc refuses it rather than warning — which is how a file
   that ran perfectly under tsx shipped and failed the build. */
const calls = [...seller.matchAll(/notifyOrder\(([^;]*?)\);/g)].map((m) => m[1].replace(/\s+/g, " ").trim());

console.log("\nNothing in the back office notifies on its own");
console.log(`        ${calls.length} notifyOrder call(s) in seller-orders.ts`);
for (const call of calls) {
  is(`forced: ${call.slice(0, 64)}`, /force:\s*true/.test(call), true);
}
is("and there is at least one, so the panel can still send", calls.length >= 1, true);

/* The events that used to go out by themselves. Named so that re-adding one
   has to be deliberate rather than a copy-paste. */
console.log("\nThe three events a person now chooses to send");
for (const event of ["PAYMENT_APPROVED", "SHIPPED", "DELIVERED"]) {
  const automatic = new RegExp(`notifyOrder\\([^;]*?"${event}"\\s*\\)`).test(seller);
  is(`${event} is not sent as a side effect of moving the order`, automatic, false);
}

console.log("\nBut the customer still hears that their order arrived");
const orders = readFileSync("src/actions/orders.ts", "utf8");
is("ORDER_RECEIVED still fires when the order is placed", /notifyOrder\([^;]*"ORDER_RECEIVED"/.test(orders), true);

/* The screen has to say what it does. Someone reading "נשלח לבד עם כל עדכון"
   over a panel that sends nothing by itself will mark an order shipped and
   assume the customer was told. */
console.log("\nThe order page says so where a salesperson reads it");
const page = readFileSync("src/components/admin/seller-order-page.tsx", "utf8");
is("the panel states that nothing is sent automatically", /שום עדכון לא נשלח מעצמו/.test(page), true);
is("no button promises to send while confirming a status", /ושלח עדכון ללקוח/.test(page), false);

console.log(failures === 0 ? "\nEvery message to a customer is a press.\n" : `\n${failures} notification rule(s) BROKEN.\n`);
process.exit(failures === 0 ? 0 : 1);
