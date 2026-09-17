import "server-only";
import { computeCartSubtotal, computeDeliveryFee, resolveCoupon } from "@/lib/pricing";
import { isBulkyCategory } from "@/lib/bulky";
import { resolveRemovalGroup, type RecyclingRow, type RemovalGroup } from "@/lib/recycling";

type CartWithItems = {
  id: string;
  couponCode: string | null;
  items: {
    id: string;
    quantity: number;
    product: {
      id: string;
      sku: string;
      title: string;
      slug: string;
      price: number;
      compareAtPrice: number | null;
      stockStatus: string;
      stockQty: number;
      brand: { name: string };
      // Needed to decide whether the order can go to a collection point —
      // see lib/bulky.ts. Carried on the item rather than recomputed at the
      // checkout, so the cart and the checkout cannot reach different
      // answers about the same basket.
      category: { slug: string; parent: { slug: string } | null; recyclingCategory: RecyclingRow | null };
      // Which old appliance buying this one entitles the customer to hand
      // over. Resolved once here so the cart, the checkout and the order all
      // read the same answer — see lib/recycling.ts.
      recyclingOptOut: boolean;
      recyclingCategory: RecyclingRow | null;
      images: { url: string; alt: string | null }[];
    };
  }[];
};

export type CartSummary = {
  id: string;
  items: {
    id: string;
    productId: string;
    // See mapProductToCard: the sku is the identifier every external report
    // keys on, and a cart is where AddToCart, InitiateCheckout and Purchase
    // all read their content_ids from.
    sku: string;
    slug: string;
    title: string;
    brandName: string;
    image: string | null;
    price: number;
    compareAtPrice: number | null;
    quantity: number;
    lineTotal: number;
    stockStatus: string;
    maxQuantity: number;
    /** Too big for a צ'יטה collection point. Collecting it from the Hadera
        counter is still fine. */
    isBulky: boolean;
    /** The old appliance this line entitles its buyer to hand over, or null
        when this product's category is not mapped to an equipment group. */
    removal: RemovalGroup | null;
  }[];
  itemCount: number;
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
  couponCode: string | null;
  couponError: string | null;
};

export async function buildCartSummary(cart: CartWithItems): Promise<CartSummary> {
  const items = cart.items.map((i) => ({
    id: i.id,
    productId: i.product.id,
    sku: i.product.sku,
    slug: i.product.slug,
    title: i.product.title,
    brandName: i.product.brand.name,
    image: i.product.images[0]?.url ?? null,
    price: i.product.price,
    compareAtPrice: i.product.compareAtPrice,
    quantity: i.quantity,
    lineTotal: i.product.price * i.quantity,
    stockStatus: i.product.stockStatus,
    maxQuantity: i.product.stockStatus === "OUT_OF_STOCK" ? 0 : Math.max(1, Math.min(i.product.stockQty, 10)),
    isBulky: isBulkyCategory(i.product.category.slug, i.product.category.parent?.slug ?? null),
    removal: resolveRemovalGroup(i.product),
  }));

  const subtotal = computeCartSubtotal(items);
  const { discount, error } = await resolveCoupon(cart.couponCode, subtotal);
  const deliveryFee = computeDeliveryFee(subtotal - discount);

  return {
    id: cart.id,
    items,
    itemCount: items.reduce((s, i) => s + i.quantity, 0),
    subtotal,
    discount,
    deliveryFee,
    total: Math.max(0, subtotal - discount + deliveryFee),
    couponCode: error ? null : cart.couponCode,
    couponError: error,
  };
}
