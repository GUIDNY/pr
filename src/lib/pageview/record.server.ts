import "server-only";
import { db } from "@/lib/db";
import { sanitizeEventMeta, type VisitEventType } from "@/lib/pageview/events";

/**
 * Record an action the server learned of — a payment's result arrives in
 * Pelecard's callback, not in the customer's browser — against the visit
 * that placed the order (Order.visitSid). Nothing is written for an order
 * without one: the visit had lapsed, or the cookie never reached the
 * checkout, and inventing an id would be the one thing this log must not do.
 */
export async function recordOrderVisitEvent(
  orderId: string,
  type: VisitEventType,
  path: string,
  meta: Record<string, unknown>,
): Promise<void> {
  try {
    const order = await db.order.findUnique({ where: { id: orderId }, select: { visitSid: true } });
    if (!order?.visitSid) return;
    await db.visitEvent.create({
      data: { sid: order.visitSid, type, path, meta: sanitizeEventMeta(type, meta) ?? undefined, isBot: false, isRsc: true },
    });
  } catch (error) {
    console.error("[visit-event] server record failed", { orderId, type, error });
  }
}
