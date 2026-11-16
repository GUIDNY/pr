/**
 * The rule behind lib/paid-cart.ts, with no database, so that
 * scripts/check-paid-cart.ts can test it anywhere.
 */

/** How long after a payment the same basket counts as "the one just paid for". */
export const PAID_RECENTLY_MS = 30 * 60_000;

/** The statuses that mean the card was accepted: held (J5) or taken. */
export const SETTLED_PAYMENT_STATUSES = ["AUTHORIZED", "CAPTURED"] as const;

export type Line = { productId: string; quantity: number };

/** The same products in the same quantities, in any order. */
export function sameItems(a: Line[], b: Line[]): boolean {
  const total = (lines: Line[]) => {
    const map = new Map<string, number>();
    for (const l of lines) map.set(l.productId, (map.get(l.productId) ?? 0) + l.quantity);
    return map;
  };
  const left = total(a);
  const right = total(b);
  if (left.size !== right.size) return false;
  for (const [id, qty] of left) if (right.get(id) !== qty) return false;
  return true;
}

export type PaidCandidate = {
  orderNumber: string;
  paymentStatus: string;
  createdAt: Date;
  items: Line[];
};

/**
 * Which of these orders, if any, is the cart already paid for. Pure, so the
 * rule is tested without a database (scripts/check-paid-cart.ts).
 */
export function matchPaidOrder(cart: Line[], orders: PaidCandidate[], now: Date): string | null {
  if (cart.length === 0) return null;
  const since = now.getTime() - PAID_RECENTLY_MS;
  const hit = orders
    .filter((o) => (SETTLED_PAYMENT_STATUSES as readonly string[]).includes(o.paymentStatus))
    .filter((o) => o.createdAt.getTime() >= since)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .find((o) => sameItems(cart, o.items));
  return hit?.orderNumber ?? null;
}
