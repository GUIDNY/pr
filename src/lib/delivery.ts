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

export function computeDeliveryFee(subtotal: number) {
  return subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : STANDARD_DELIVERY_FEE;
}
