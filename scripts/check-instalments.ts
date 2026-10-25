/**
 * How many payments a basket may be split into, and the promise that a
 * checkout still opens when the gateway refuses to offer any.
 *
 * Two different things are guarded here and only the first is arithmetic.
 *
 * The table is a business decision written as four numbers, so the test is
 * mostly about its edges: 300 and 1,000 and 3,000 are the kind of boundary
 * that gets moved by one shekel in the wrong direction and nobody notices
 * until a customer asks why a ₪1,000 order offers fewer payments than a ₪999
 * one.
 *
 * The second is the fallback, and it matters more. Asking a terminal that is
 * not cleared for instalments to offer them is refused at init, and a refused
 * init is not a missing dropdown — it is "payment init failed" where the card
 * form should be, for every customer. open-payment.ts opens the order a second
 * time as a single payment when that happens. This walks the source to be sure
 * that retry is still there, because deleting it looks like a tidy-up and
 * costs the shop every order until someone notices.
 *
 *   npm run check:instalments
 */

import { readFileSync } from "fs";
import { maxPaymentsFor, instalmentsOffered } from "../src/lib/pelecard/instalments";

let failures = 0;

function is(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${ok ? "" : `  (got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)})`}`);
}

console.log("\nA small basket is paid for once, and the field is not shown at all");
is("a ₪290 toaster", maxPaymentsFor(290), 1);
is("...and it offers nothing to choose", instalmentsOffered(290), false);
is("one shekel under the line", maxPaymentsFor(299), 1);
is("zero", maxPaymentsFor(0), 1);

console.log("\nThe three steps, on their exact edges");
is("₪300 — the first step", maxPaymentsFor(300), 3);
is("₪999 — still the first", maxPaymentsFor(999), 3);
is("₪1,000 — the second", maxPaymentsFor(1000), 6);
is("₪2,999 — still the second", maxPaymentsFor(2999), 6);
is("₪3,000 — the third", maxPaymentsFor(3000), 12);
is("a ₪9,000 fridge", maxPaymentsFor(9000), 12);

console.log("\nThe table only ever climbs");
let previous = 0;
let monotonic = true;
for (let total = 0; total <= 5000; total += 1) {
  const value = maxPaymentsFor(total);
  if (value < previous) monotonic = false;
  previous = value;
}
is("no basket is worth fewer payments than a smaller one", monotonic, true);

console.log("\nNonsense is one payment, never twelve");
is("NaN", maxPaymentsFor(Number.NaN), 1);
is("Infinity", maxPaymentsFor(Number.POSITIVE_INFINITY), 1);
is("a negative total", maxPaymentsFor(-100), 1);

/* The source checks. Blunt on purpose: what they prevent is a later tidy-up
   removing a branch whose whole value is that it almost never runs. */
console.log("\nThe checkout still opens when instalments are refused");
const source = readFileSync("src/lib/pelecard/open-payment.ts", "utf8");
is("a refused instalment init is retried as a single payment", /wantedPayments > 1 \? \[wantedPayments, 1\] : \[1\]/.test(source), true);
is("and the retry is not silent", /init refused with instalments/.test(source), true);
is("one payment stays on the list", /MinPayments: 1/.test(source), true);
is("the maximum comes from the table, not a literal", /MaxPayments: maxPayments/.test(source), true);
is("the first instalment is theirs to compute", /FirstPayment: "auto"/.test(source), true);

console.log(failures === 0 ? "\nThe instalment rules hold.\n" : `\n${failures} instalment rule(s) BROKEN.\n`);
process.exit(failures === 0 ? 0 : 1);
