/**
 * What /track-order says about the money.
 *   npm run check:payment-notice
 */
import { paymentNotice } from "../src/lib/checkout/payment-notice";

let failed = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${JSON.stringify(got)}${ok ? "" : ` (want ${JSON.stringify(want)})`}`);
};
const tone = (paymentStatus: string | null, paymentMethod: string | null) => paymentNotice({ paymentStatus, paymentMethod })?.tone ?? null;

eq("card AUTHORIZED → paid", tone("AUTHORIZED", "PELECARD"), "paid");
eq("card CAPTURED → paid", tone("CAPTURED", "PELECARD"), "paid");
eq("phone-card CAPTURED → paid", tone("CAPTURED", "PHONE_CARD"), "paid");
eq("card PENDING → pending", tone("PENDING", "PELECARD"), "pending");
eq("card FAILED → failed", tone("FAILED", "PELECARD"), "failed");
eq("cash on delivery PENDING → nothing", tone("PENDING", "CASH_ON_DELIVERY"), null);
eq("no method, no status → nothing", tone(null, null), null);
eq("paid says not to pay again", paymentNotice({ paymentStatus: "AUTHORIZED", paymentMethod: "PELECARD" })?.body.includes("אין צורך לשלם שוב"), true);
eq("pending warns not to pay again", paymentNotice({ paymentStatus: "PENDING", paymentMethod: "PELECARD" })?.body.includes("לא לשלם שוב"), true);

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log("all passed");
