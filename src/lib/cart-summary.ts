import "server-only";
import { computeCartSubtotal, computeDeliveryFee, resolveCoupon } from "@/lib/pricing";

type CartWithItems = {
  id: string;
  couponCode: string | null;
  items: {
    id: string;
    quantity: number;
    product: {
      id: string;
      title: string;
      slug: string;
      price: number;
      compareAtPrice: number | null;
      stockStatus: string;
      stockQty: number;
      brand: { name: string };
      images: { url: string; alt: string | null }[];
    };
  }[];
};

export type CartSummary = {
  id: string;
  items: {
    id: string;
    productId: string;
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
