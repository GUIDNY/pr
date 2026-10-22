// Guards the payment-failure alert without needing a database.
//
// The filter is the feature. Google's Storebot walks the purchase flow and
// creates real `Order` rows — five of the eight orders in PAYMENT_PENDING
// are its — so an alert that does not exclude it mails the owner a false
// alarm every night between 01:00 and 02:00, he stops reading them inside a
// week, and the real one lands in a folder nobody opens. Every bot case
// below is a row that is in the database today, not an invented string.
//
// Run: npx tsx scripts/check-payment-alert.ts
import { declineText, isBotOrder, DECLINE_REASONS } from "../src/lib/notify/payment-alert";

let failed = 0;
const fail = (message: string) => {
  console.log(`FAIL  ${message}`);
  failed++;
};

/* The five Storebot orders, verbatim from the catalogue. */
const BOTS: [string, { guestName: string | null; guestEmail: string | null }][] = [
  ["PR-627168", { guestName: "Plonial Moni", guestEmail: "johnsmith001@storebotmail.joonix.net" }],
  ["PR-371867", { guestName: "Plonial Moni", guestEmail: "johnsmith008@storebotmail.joonix.net" }],
  ["PR-492753", { guestName: "Plonial Moni", guestEmail: "johnsmith010@storebotmail.joonix.net" }],
  ["PR-935230", { guestName: "Plonial Moni", guestEmail: "johnsmith005@storebotmail.joonix.net" }],
  ["PR-159153", { guestName: "Plonial Moni", guestEmail: "johnsmith007@storebotmail.joonix.net" }],
  // Either half on its own is enough: a renamed crawler on the same domain,
  // and the same name behind a different address.
  ["renamed crawler", { guestName: "Some Other Bot", guestEmail: "x@storebotmail.joonix.net" }],
  ["same name, other address", { guestName: "plonial moni", guestEmail: "someone@example.com" }],
  ["joonix without the storebot word", { guestName: null, guestEmail: "crawler@joonix.net" }],
  // The fallback recipient of this very mail places real test orders.
  // Alerting ourselves about our own test is noise with a loop in it.
  ["the internal test address", { guestName: "בדיקה", guestEmail: "bd12123@gmail.com" }],
];

/* The real customers whose orders are the whole point. */
const HUMANS: [string, { guestName: string | null; guestEmail: string | null }][] = [
  ["PR-462763 ישי עובדיה", { guestName: "ישי עובדיה", guestEmail: "sanadrin@gmail.com" }],
  ["PR-634879 Alon Nissan", { guestName: "Alon Nissan", guestEmail: "Alon.nissan@intel.com" }],
  ["PR-441179 מיכל רצהבי", { guestName: "מיכל רצהבי", guestEmail: "ratsabymic@gmail.com" }],
  ["PR-109538 שיראל מוסא", { guestName: "שיראל מוסא", guestEmail: "shirelmusa17@gmail.com" }],
  ["PR-401692 חנה אברמס", { guestName: "חנה אברמס", guestEmail: "c75abrams@gmail.com" }],
  // No contact details at all is not evidence of a crawler, and an order
  // with neither is exactly the one somebody should look at.
  ["an order with no name or email", { guestName: null, guestEmail: null }],
  ["an empty name is not a bot name", { guestName: "   ", guestEmail: "real@customer.co.il" }],
  // A customer whose address merely contains a bot-ish substring in the
  // local part, on an ordinary domain.
  ["a human whose address mentions a shop", { guestName: "דני", guestEmail: "storebuyer@gmail.com" }],
];

for (const [label, order] of BOTS) {
  if (!isBotOrder(order)) fail(`a crawler's order would be alerted on: ${label}`);
}
for (const [label, order] of HUMANS) {
  if (isBotOrder(order)) fail(`a real customer's order would be suppressed: ${label}`);
}

/* The decline wording. The short form is what already sits in the
   abandoned-cart notes, so it must not drift; an unknown code prints bare
   rather than being invented. */
const DECLINES: [string | null | undefined, string][] = [
  ["004", "קוד 004 · הבנק המנפיק סירב"],
  ["650", "קוד 650 · אימות מול הבנק לא הושלם"],
  ["051", "קוד 051 · אין כיסוי"],
  ["999", "קוד 999"],
  [null, "לא התקבל קוד מהסולק"],
  [undefined, "לא התקבל קוד מהסולק"],
  ["", "לא התקבל קוד מהסולק"],
];
for (const [code, want] of DECLINES) {
  const got = declineText(code);
  if (got !== want) fail(`declineText(${JSON.stringify(code)}) = ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
}

/* Every code we translate must also say what to offer the customer —
   the reason the mail exists is that somebody picks up the telephone. */
for (const [code, entry] of Object.entries(DECLINE_REASONS)) {
  if (!entry.short.trim()) fail(`${code} has no short label`);
  if (!entry.say.trim()) fail(`${code} says nothing about what to offer`);
}

const total = BOTS.length + HUMANS.length + DECLINES.length + Object.keys(DECLINE_REASONS).length;
console.log(
  `${total - failed}/${total} passed  (${BOTS.length} crawlers filtered, ${HUMANS.length} customers kept, ` +
    `${DECLINES.length} decline phrasings, ${Object.keys(DECLINE_REASONS).length} codes with advice)`,
);
process.exit(failed === 0 ? 0 : 1);
