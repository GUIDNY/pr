/**
 * The rule behind lib/paid-cart.ts, with no database, so that
 * scripts/check-paid-cart.ts can test it anywhere.
 */

/** How long after a payment the same basket counts as "the one just paid for". */
/* 60 minutes — the window the duplicate-payment alert uses (#184). The
   17 November customer came back after 14 minutes; 30 left too little room. */
export const PAID_RECENTLY_MS = 60 * 60_000;

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
 * A recent paid order that shares SOME products with this cart without being
 * the same basket — the customer who paid for a fridge and is back with the
 * fridge and a dishwasher. Not a block: the checkout asks before it charges
 * the fridge again. Returns the order and the overlapping product ids.
 */
export function matchPaidOverlap(
  cart: Line[],
  orders: PaidCandidate[],
  now: Date,
): { orderNumber: string; productIds: string[] } | null {
  if (cart.length === 0) return null;
  const since = now.getTime() - PAID_RECENTLY_MS;
  const inCart = new Set(cart.map((l) => l.productId));
  const hit = orders
    .filter((o) => (SETTLED_PAYMENT_STATUSES as readonly string[]).includes(o.paymentStatus))
    .filter((o) => o.createdAt.getTime() >= since)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((o) => ({ orderNumber: o.orderNumber, productIds: [...new Set(o.items.map((i) => i.productId))].filter((id) => inCart.has(id)) }))
    .find((o) => o.productIds.length > 0);
  return hit ?? null;
}

/** Digits only, Israeli 972 folded to a leading 0; null when too short to
    identify anyone. The same rule the duplicate-payment alert uses. */
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

/** Whether a paid order belongs to the person now checking out, by the
    phone or email typed into the form — for the customer on another device,
    another browser, or after the visit cookie is gone. */
export function sameCustomer(
  typed: { phone?: string | null; email?: string | null },
  order: { guestPhone: string | null; guestEmail: string | null },
): boolean {
  const phone = normalisePhone(typed.phone);
  const email = normaliseEmail(typed.email);
  return (!!phone && normalisePhone(order.guestPhone) === phone) || (!!email && normaliseEmail(order.guestEmail) === email);
}

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
