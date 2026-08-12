import { CartHydrator } from "@/components/cart/cart-hydrator";
import { getCart } from "@/lib/cart";
import { buildCartSummary } from "@/lib/cart-summary";

// Isolated in its own async Server Component (rather than awaited directly
// in the root layout) so it can sit inside a <Suspense> boundary — that lets
// the page content start streaming immediately instead of every single
// navigation waiting on a cart DB round-trip before anything renders.
export async function CartProvider() {
  const cart = await getCart();
  const cartSummary = await buildCartSummary(cart);
  return <CartHydrator initialCart={cartSummary} />;
}
