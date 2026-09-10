/**
 * Who gets charged a real card, and who only sees the form.
 *
 * paymentLaneFor() is a handful of `if`s, which is exactly why it is worth a
 * check: it is small enough to look obviously right and its ordering is the
 * whole behaviour. Rule 2 before rule 4 is the difference between "the
 * dashboard can always pull an account back" and "it cannot", and rule 3
 * before rule 4 is the difference between the admin rehearsing an order and
 * the admin paying for one. Neither ordering shows up in a type, and neither
 * fails loudly — it fails on somebody's statement.
 *
 * No database and no network: the policy is a pure function of the environment,
 * so this runs anywhere, in about a second.
 *
 *   npm run check:lane
 */

import { PELECARD_TEST_BASE } from "../src/lib/pelecard/gateway";
import { paymentLaneFor } from "../src/lib/pelecard/config";

/* A plain import is enough because nothing in config.ts reads the environment
   at module scope — every rule re-reads it on the call, which is what lets one
   process walk through all of these. */
const ORIGINAL = { ...process.env };

process.env.PELECARD_BASE_URL = PELECARD_TEST_BASE;
process.env.PELECARD_TERMINAL = "checkonly";
process.env.PELECARD_USER = "checkonly";
process.env.PELECARD_PASSWORD = "checkonly";

let failures = 0;

function is(name: string, got: string, want: string) {
  const ok = got === want;
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name} → ${got}${ok ? "" : `  (expected ${want})`}`);
}

/** Only the keys this policy reads, so one case cannot leak into the next. */
function env(vars: Record<string, string | undefined>) {
  for (const key of [
    "PELECARD_ENABLED",
    "PELECARD_DEMO_EMAILS",
    "PELECARD_LIVE_EMAILS",
  ]) {
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(vars)) {
    if (value !== undefined) process.env[key] = value;
  }
}

const customer = { email: "shopper@example.com", role: "CUSTOMER" };
const admin = { email: "admin@prec.co.il", role: "ADMIN" };
const staff = { email: "staff@prec.co.il", role: "STAFF" };
const seller = { email: "seller@prec.co.il", role: "SELLER" };
const eitan = { email: "eitan@example.com", role: "CUSTOMER" };

console.log("\nThe shop is open (PELECARD_ENABLED=true)");
env({ PELECARD_ENABLED: "true" });
is("a customer pays for real", paymentLaneFor(customer), "gateway");
is("a guest pays for real", paymentLaneFor(null), "gateway");
is("the admin does not", paymentLaneFor(admin), "demo");
is("staff do not", paymentLaneFor(staff), "demo");
is("a seller does not", paymentLaneFor(seller), "demo");

console.log("\nThe shop is closed (the default)");
env({});
is("a customer sees the demo form", paymentLaneFor(customer), "demo");
is("a guest sees the demo form", paymentLaneFor(null), "demo");
is("the built-in live account still pays for real", paymentLaneFor(eitan), "gateway");

console.log("\nThe dashboard can always pull an account back");
env({ PELECARD_ENABLED: "true", PELECARD_DEMO_EMAILS: "shopper@example.com, eitan@example.com" });
is("DEMO_EMAILS outranks the open shop", paymentLaneFor(customer), "demo");
is("DEMO_EMAILS outranks the built-in live list", paymentLaneFor(eitan), "demo");

console.log("\nAnd it can push one forward");
env({ PELECARD_LIVE_EMAILS: "shopper@example.com" });
is("LIVE_EMAILS opens the gateway with the shop closed", paymentLaneFor(customer), "gateway");
is("matching is case- and space-insensitive", paymentLaneFor({ email: "  SHOPPER@Example.com " }), "gateway");

console.log("\nA back-office role wins over the live list");
env({ PELECARD_ENABLED: "true", PELECARD_LIVE_EMAILS: "admin@prec.co.il" });
is("an admin named on the live list still rehearses", paymentLaneFor(admin), "demo");

console.log("\nA guest follows the shop switch and nothing else");
env({ PELECARD_ENABLED: "true" });
is("open shop, guest pays for real", paymentLaneFor(null), "gateway");
is("...even with the lists full", paymentLaneFor(undefined), "gateway");
env({});
is("closed shop, guest sees the demo form", paymentLaneFor(null), "demo");

console.log("\nNo credentials, no charges");
env({ PELECARD_ENABLED: "true", PELECARD_LIVE_EMAILS: "shopper@example.com" });
delete process.env.PELECARD_PASSWORD;
is("an unconfigured gateway is demo for everyone", paymentLaneFor(customer), "demo");
is("including the built-in live account", paymentLaneFor(eitan), "demo");
process.env.PELECARD_PASSWORD = "checkonly";

process.env = ORIGINAL;

console.log(failures === 0 ? "\nAll payment-lane rules hold.\n" : `\n${failures} payment-lane rule(s) BROKEN.\n`);
process.exit(failures === 0 ? 0 : 1);
