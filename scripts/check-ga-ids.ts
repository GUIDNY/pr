/**
 * npm run check:ga-ids
 *
 * gaClientId and gaSessionId were null on 22 of 22 orders, consenting
 * browsers included, for two independent reasons — both asserted here:
 *   1. the checkout sent { clientId, sessionId } and the order schema reads
 *      { gaClientId, gaSessionId }; zod dropped the unknown keys silently.
 *   2. the session id was parsed from the GS1 cookie format only, and
 *      Google has written GS2 since 2025.
 */
import { gaIdsForOrder, parseGaIds } from "../src/lib/analytics/ga";
import { checkoutSchema } from "../src/lib/order-schema";

let failed = 0;
const is = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  if (!ok) failed++;
};
const ID = "G-Y2TT301GB2";

is("GS2 cookie (current format)", parseGaIds("_ga=GA1.1.1234567890.1731000000; _ga_Y2TT301GB2=GS2.1.s1762600000$o3$g1$t1762600100$j60$l0$h0", ID), { clientId: "1234567890.1731000000", sessionId: "1762600000" });
is("GS1 cookie (older format)", parseGaIds("_ga=GA1.1.1234567890.1731000000; _ga_Y2TT301GB2=GS1.1.1731000000.5.1.1731000100.0.0.0", ID), { clientId: "1234567890.1731000000", sessionId: "1731000000" });
is("no consent: no cookies", parseGaIds("bt_attr=x; cart=y", ID), { clientId: null, sessionId: null });
is("another stream's session cookie is ignored", parseGaIds("_ga=GA1.1.1.2; _ga_OTHER=GS2.1.s99$o1", ID), { clientId: "1.2", sessionId: null });
is("a malformed _ga is refused", parseGaIds("_ga=garbage", ID), { clientId: null, sessionId: null });

const ids = gaIdsForOrder({ clientId: "1234567890.1731000000", sessionId: "1762600000" });
is("named the way the order schema reads them", Object.keys(ids).sort(), ["gaClientId", "gaSessionId"]);

const order = {
  fullName: "בדיקה בדיקה",
  email: "test@example.com",
  phone: "0500000000",
  deliveryMethod: "PICKUP",
  paymentMethod: "PELECARD",
  ...ids,
};
const parsed = checkoutSchema.safeParse(order);
const data = parsed.success ? (parsed.data as Record<string, unknown>) : null;
if (!parsed.success) console.log("     (schema refused the sample order:", parsed.error.issues.map((i) => i.path.join(".")).join(", "), ")");
is("gaClientId survives the schema", data?.gaClientId, "1234567890.1731000000");
is("gaSessionId survives the schema", data?.gaSessionId, "1762600000");
const bare = checkoutSchema.safeParse({ ...order, gaClientId: undefined, gaSessionId: undefined, clientId: "1.2", sessionId: "3" });
is("the old key names would have been dropped (the bug)", bare.success ? (bare.data as Record<string, unknown>).gaClientId : "refused", undefined);

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall passed");
