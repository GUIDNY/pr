/**
 * Whether a new card form may open while an earlier one may already be paid.
 * Fixtures only — no gateway, no database.
 *
 *   npm run check:prior-payment
 */
import { combine, readValidation, verdictFor, STILL_PAYING_MS } from "../src/lib/pelecard/prior-payment-rules";

let failed = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${JSON.stringify(got)}${ok ? "" : ` (want ${JSON.stringify(want)})`}`);
};

// ValidateByUniqueKey answers. The number 1 is what all 21 real successful
// payments stored in Payment.rawResponse.validation.
eq("1 (number, as stored on every real success)", readValidation(1), "PAID");
eq('"1"', readValidation("1"), "PAID");
eq("0", readValidation(0), "REFUSED");
eq('{ Result: "0" }', readValidation({ Result: "0" }), "REFUSED");
eq("{ Error: { ErrCode: 3 } }", readValidation({ Error: { ErrCode: 3 } }), "REFUSED");
eq("empty object is unknown, never paid", readValidation({}), "UNKNOWN");
eq("null is unknown", readValidation(null), "UNKNOWN");
eq("a string we have not seen is unknown", readValidation("OK"), "UNKNOWN");

const now = new Date("2026-11-17T22:34:50+02:00");
const ago = (ms: number) => new Date(now.getTime() - ms);

// 17 November: the form opened at 22:20, paid at 22:21, the customer back at 22:34.
eq("17 Nov: earlier form paid → PAID (no second form)", verdictFor("PAID", ago(14 * 60_000), now, true), "PAID");
eq("refused, touched, 1 min ago → WAIT (may be in 3DS)", verdictFor("REFUSED", ago(60_000), now, true), "WAIT");
eq("refused, NOT touched, 10 s ago → ALLOW ('לשנות את הפרטים')", verdictFor("REFUSED", ago(10_000), now, false), "ALLOW");
eq("refused, touched, past the window → ALLOW", verdictFor("REFUSED", ago(STILL_PAYING_MS + 1000), now, true), "ALLOW");
eq("unknown answer → WAIT", verdictFor("UNKNOWN", ago(5 * 60_000), now, false), "WAIT");
eq("call failed → WAIT", verdictFor(null, ago(5 * 60_000), now, true), "WAIT");

eq("combine: one paid among several → PAID", combine(["ALLOW", "WAIT", "PAID"]), "PAID");
eq("combine: wait beats allow", combine(["ALLOW", "WAIT"]), "WAIT");
eq("combine: all allow", combine(["ALLOW", "ALLOW"]), "ALLOW");
eq("combine: nothing to ask about", combine([]), "ALLOW");

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log("all passed");
