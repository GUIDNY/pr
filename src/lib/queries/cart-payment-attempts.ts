import "server-only";
import { db } from "@/lib/db";
import { waNumber } from "@/lib/notify/whatsapp-link";

/**
 * Which abandoned carts belong to somebody who already reached payment and
 * did not complete it (an order of theirs in PAYMENT_FAILED or
 * PAYMENT_PENDING in the last 30 days). The WhatsApp for those says "you
 * tried to order", not "you were interested". Matched on phone (normalised,
 * so +972… and 0… agree), email or account; one query for the page.
 */
export async function cartIdsWithPaymentAttempt(
  carts: { id: string; contactPhone: string | null; contactEmail: string | null; userId: string | null }[],
): Promise<Set<string>> {
  const out = new Set<string>();
  if (carts.length === 0) return out;
  const since = new Date(Date.now() - 30 * 86_400_000);
  const orders = await db.order.findMany({
    where: { status: { in: ["PAYMENT_FAILED", "PAYMENT_PENDING"] }, createdAt: { gte: since }, deletedAt: null },
    select: { guestPhone: true, guestEmail: true, userId: true },
    take: 500,
  });
  const phones = new Set<string>();
  const emails = new Set<string>();
  const users = new Set<string>();
  for (const o of orders) {
    const n = waNumber(o.guestPhone);
    if (n) phones.add(n);
    if (o.guestEmail) emails.add(o.guestEmail.trim().toLowerCase());
    if (o.userId) users.add(o.userId);
  }
  for (const c of carts) {
    const n = waNumber(c.contactPhone);
    const e = c.contactEmail?.trim().toLowerCase();
    if ((n && phones.has(n)) || (e && emails.has(e)) || (c.userId && users.has(c.userId))) out.add(c.id);
  }
  return out;
}
