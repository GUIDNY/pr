/**
 * The delivery policy, in a file with no server imports so the product page,
 * the cart drawer, the checkout, the Merchant Center feed and the product
 * page's structured data can all state the same numbers.
 *
 * They used to live only in pricing.ts, next to the database client, which
 * meant the one place a shopper was told what delivery costs was the cart
 * total after they had already decided. Unexpected costs at checkout are
 * the single largest reason people abandon a purchase, and the fix is not
 * clever: say the number where the decision is made.
 *
 * THE POLICY, as the shop runs it with צ'יטה:
 *
 *   ≥ ₪600   home delivery is free
 *   < ₪600   a pickup point is free; bringing it to the door costs ₪40
 *   always   collecting from the Hadera branch is free
 *
 * So the fee has exactly one cause: asking for the door on a basket under
 * the threshold. Every other combination is zero, which is why the function
 * below reads the way it does rather than as a table.
 */
export const FREE_DELIVERY_THRESHOLD = 600;

/** What it costs to upgrade from a pickup point to the door, under the
    threshold. Named for what it buys rather than "standard", because there
    are three standard methods now and two of them are free. */
export const HOME_DELIVERY_FEE = 40;

/** Named on the checkout and the shipping policy. A shopper choosing a
    pickup point is agreeing to be contacted by a company whose name they
    should have seen first. */
export const DELIVERY_CARRIER = "צ'יטה";

/**
 * DELIVERY      to the address the customer gives
 * PICKUP_POINT  to one of the carrier's collection points
 * PICKUP        from the shop's own counter in Hadera
 *
 * PICKUP_POINT sits between the two on purpose: it is the free option for a
 * small basket, and it is the one most shoppers under the threshold should
 * be choosing.
 */
export type DeliveryMethod = "DELIVERY" | "PICKUP_POINT" | "PICKUP";

/**
 * What delivery costs — and nothing costs delivery when there is none.
 *
 * The method used to be missing from this calculation entirely, so an order
 * collected from the counter in Hadera was charged to deliver it there. The
 * checkout showed the charge and the order carried it, consistently and
 * wrongly, which is the kind of error nobody reports as a bug: the customer
 * assumes it is the shop's policy and either pays it or leaves.
 *
 * Defaulted to DELIVERY so the callers that genuinely do not know the method
 * yet — the cart drawer, where nobody has chosen; the feed, where Google is
 * being told the worst case — keep quoting the number a shopper should plan
 * for. Choosing a pickup point or the branch is what removes it.
 */
export function computeDeliveryFee(subtotal: number, method: DeliveryMethod = "DELIVERY") {
  // Both collection methods are free at every basket size.
  if (method !== "DELIVERY") return 0;
  return subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : HOME_DELIVERY_FEE;
}

/**
 * Whether this method needs a street address.
 *
 * A pickup point does, which is the part that surprises people: the carrier
 * arranges the point with the customer afterwards, and it needs to know
 * where they are to offer one near them. Only collecting from our own
 * counter needs no address, because the address is ours.
 */
export function requiresAddress(method: DeliveryMethod): boolean {
  return method !== "PICKUP";
}
