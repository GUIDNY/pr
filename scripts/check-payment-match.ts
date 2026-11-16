// A Pelecard notification is about the form it names, not about whichever
// form the order opened last — see lib/pelecard/callback-match.ts.
//
// Run: npx tsx scripts/check-payment-match.ts
import { paymentForFeedback } from "../src/lib/pelecard/callback-match";

const newest = { id: "p3", confirmationKey: "key-3" };
const middle = { id: "p2", confirmationKey: "key-2" };
const oldest = { id: "p1", confirmationKey: "key-1" };
const payments = [newest, middle, oldest]; // newest first, as the callback reads them

let failed = 0;
const is = (name: string, got: unknown, expected: unknown) => {
  if (JSON.stringify(got) !== JSON.stringify(expected)) {
    failed++;
    console.error(`FAIL  ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`);
  }
};

is("the current form's own notification", paymentForFeedback(payments, "key-3"), { payment: newest, superseded: false });
// The case this exists for: the first form expires while the third is open.
is("an earlier form's expiry is about that form", paymentForFeedback(payments, "key-1"), { payment: oldest, superseded: true });
is("the one in between too", paymentForFeedback(payments, "key-2"), { payment: middle, superseded: true });
is("whitespace around the key", paymentForFeedback(payments, " key-2 "), { payment: middle, superseded: true });
// Nothing to go by: what the callback always did.
is("no key in the notification", paymentForFeedback(payments, undefined), { payment: newest, superseded: false });
is("an empty key", paymentForFeedback(payments, ""), { payment: newest, superseded: false });
is("a key we never issued", paymentForFeedback(payments, "someone-else"), { payment: newest, superseded: false });
is("one form only", paymentForFeedback([newest], "key-3"), { payment: newest, superseded: false });
is("a row with no key is never matched by an empty one", paymentForFeedback([{ id: "x", confirmationKey: null }, oldest], null), {
  payment: { id: "x", confirmationKey: null },
  superseded: false,
});
is("an order with no payment", paymentForFeedback([], "key-1"), null);

console.log(`${10 - failed}/10 passed`);
if (failed) process.exit(1);
