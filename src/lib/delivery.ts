/**
 * The delivery policy's two numbers, in a file with no server imports so
 * the product page, the cart drawer and the checkout can all state them.
 *
 * They used to live only in pricing.ts, next to the database client, which
 * meant the one place a shopper was told what delivery costs was the cart
 * total after they had already decided. Unexpected costs at checkout are
 * the single largest reason people abandon a purchase, and the fix is not
 * clever: say the number where the decision is made.
 */
export const FREE_DELIVERY_THRESHOLD = 500;
export const STANDARD_DELIVERY_FEE = 49;

export type DeliveryMethod = "DELIVERY" | "PICKUP";

/**
 * What delivery costs — and nothing costs delivery when there is none.
 *
 * The method used to be missing from this calculation entirely, so an order
 * collected from the counter in Hadera was charged ₪49 to deliver it there.
 * The checkout showed the charge and the order carried it, consistently and
 * wrongly, which is the kind of error nobody reports as a bug: the customer
 * assumes it is the shop's policy and either pays it or leaves.
 *
 * Defaulted to DELIVERY so the callers that genuinely do not know the method
 * yet — the cart drawer, where nobody has chosen — keep quoting the number a
 * shopper should plan for. Choosing to collect is what removes it.
 */
export function computeDeliveryFee(subtotal: number, method: DeliveryMethod = "DELIVERY") {
  if (method === "PICKUP") return 0;
  return subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : STANDARD_DELIVERY_FEE;
}
