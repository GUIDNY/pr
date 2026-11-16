/**
 * Meta's customer-service window: a business may send free text on WhatsApp
 * only within 24 hours of the customer's own last message. Outside it only
 * an approved template goes through, and we have none for this — so the
 * reply box locks and the page says to phone instead.
 *
 * Measured from the last CUSTOMER message, not from `lastMessageAt`, which
 * a staff reply also moves: a reply must not reopen the window it used.
 */
export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isServiceWindowOpen(lastCustomerMessageAt: Date | null, now: Date = new Date()): boolean {
  if (!lastCustomerMessageAt) return false;
  return now.getTime() - lastCustomerMessageAt.getTime() < SERVICE_WINDOW_MS;
}
