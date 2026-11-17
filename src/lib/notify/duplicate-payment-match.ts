/**
 * Which paid orders look like the same customer paying twice for one basket.
 *
 * 17 November: a customer's card was authorised for 7,700 ₪ at 22:21 and again
 * at 22:35 — the payment form never reached the confirmation page, the cart
 * was not emptied, and the checkout opened a fresh order. Nothing told anyone;
 * it was found by reading the orders list. This decides when the owner is told
 * at once.
 *
 * Two paid orders (AUTHORIZED or CAPTURED) are a suspected duplicate when they
 * share the phone, the email or the browser visit, and were placed within
 * DUPLICATE_WINDOW_MINUTES of each other. The amount is not part of the test:
 * a second payment for a slightly different basket is still a question the
 * owner wants asked, and the alert shows both totals.
 *
 * Pure, no database: scripts/check-duplicate-payment.ts carries the cases.
 */
export const DUPLICATE_WINDOW_MINUTES = 60;

export type PaidOrderLike = {
  id: string;
  orderNumber: string;
  total: number;
  createdAt: Date;
  paymentStatus: string;
  phone: string | null;
  email: string | null;
  visitSid: string | null;
};

const PAID = new Set(["AUTHORIZED", "CAPTURED"]);

/** Digits only, Israeli 972 folded to a leading 0 — the same normalisation
    order lookup uses, so "050-123 4567" and "+972501234567" are one phone. */
export function normalisePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  const local = digits.startsWith("972") ? `0${digits.slice(3)}` : digits;
  return local.length >= 9 ? local : null;
}

export function normaliseEmail(email: string | null | undefined): string | null {
  const e = email?.trim().toLowerCase();
  return e && e.includes("@") ? e : null;
}

export type DuplicateReason = "phone" | "email" | "visit";

/** The other paid orders that `order` duplicates, each with why. */
export function findDuplicatePayments(
  order: PaidOrderLike,
  others: PaidOrderLike[],
  windowMinutes = DUPLICATE_WINDOW_MINUTES,
): { order: PaidOrderLike; reasons: DuplicateReason[] }[] {
  if (!PAID.has(order.paymentStatus)) return [];
  const phone = normalisePhone(order.phone);
  const email = normaliseEmail(order.email);
  const windowMs = windowMinutes * 60_000;
  const out: { order: PaidOrderLike; reasons: DuplicateReason[] }[] = [];
  for (const other of others) {
    if (other.id === order.id || !PAID.has(other.paymentStatus)) continue;
    if (Math.abs(other.createdAt.getTime() - order.createdAt.getTime()) > windowMs) continue;
    const reasons: DuplicateReason[] = [];
    if (phone && normalisePhone(other.phone) === phone) reasons.push("phone");
    if (email && normaliseEmail(other.email) === email) reasons.push("email");
    if (order.visitSid && other.visitSid === order.visitSid) reasons.push("visit");
    if (reasons.length) out.push({ order: other, reasons });
  }
  return out.sort((a, b) => a.order.createdAt.getTime() - b.order.createdAt.getTime());
}
