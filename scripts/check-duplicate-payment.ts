/**
 * When a paid order is a suspected double charge. The founding case is the
 * 17 November customer: PR-913025 and PR-245761, 7,700 ₪ each, 14 minutes
 * apart, same visit, same phone, same email (contact details here are made up).
 *
 *   npm run check:duplicate-payment
 */
import { findDuplicatePayments, normalisePhone, type PaidOrderLike } from "../src/lib/notify/duplicate-payment-match";

let failed = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${JSON.stringify(got)}${ok ? "" : ` (want ${JSON.stringify(want)})`}`);
};

const at = (hhmm: string) => new Date(`2026-11-17T${hhmm}:00+02:00`);
const base: PaidOrderLike = {
  id: "a",
  orderNumber: "PR-913025",
  total: 7700,
  createdAt: at("22:20"),
  paymentStatus: "AUTHORIZED",
  phone: "050-1234567",
  email: "Test.Buyer@example.com",
  visitSid: "sid-1",
};
const o = (over: Partial<PaidOrderLike>): PaidOrderLike => ({ ...base, id: Math.random().toString(36).slice(2), ...over });
const reasons = (order: PaidOrderLike, others: PaidOrderLike[]) =>
  findDuplicatePayments(order, others).map((d) => `${d.order.orderNumber}:${d.reasons.join("+")}`);

// The founding case: the second payment, 14 minutes later.
const second = o({ orderNumber: "PR-245761", createdAt: at("22:34"), phone: "+972501234567", email: "test.buyer@example.com " });
eq("17 Nov second payment flags the first", reasons(second, [base]), ["PR-913025:phone+email+visit"]);

// Each signal on its own is enough.
eq("phone only (different spelling)", reasons(o({ visitSid: "x", email: null, phone: "972-50-123-4567" }), [base]), ["PR-913025:phone"]);
eq("email only (case/space)", reasons(o({ visitSid: "x", phone: null, email: " TEST.BUYER@EXAMPLE.COM" }), [base]), ["PR-913025:email"]);
eq("visit only", reasons(o({ phone: null, email: null }), [base]), ["PR-913025:visit"]);

// Negatives.
eq("61 minutes apart is outside the window", reasons(o({ createdAt: at("23:21") }), [base]), []);
eq("pending second order is not a payment", reasons(o({ paymentStatus: "PENDING" }), [base]), []);
eq("failed earlier order is not a payment", reasons(o({ createdAt: at("22:30") }), [{ ...base, paymentStatus: "FAILED" }]), []);
eq("different customer, same minute", reasons(o({ phone: "052-9999999", email: "other@example.com", visitSid: "sid-2" }), [base]), []);
eq("itself is never its own duplicate", reasons(base, [base]), []);
eq("short or empty phone never matches", reasons(o({ phone: "123", email: null, visitSid: null }), [{ ...base, phone: "123" }]), []);

// Three payments: the third sees both earlier ones, oldest first.
const third = o({ orderNumber: "PR-315128", createdAt: at("22:37"), paymentStatus: "CAPTURED" });
eq("third payment lists both", reasons(third, [second, base]), ["PR-913025:phone+email+visit", "PR-245761:phone+email+visit"]);

eq("phone normalisation", [normalisePhone("+972 50-123-4567"), normalisePhone("0501234567"), normalisePhone("")], ["0501234567", "0501234567", null]);

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log("all passed");
