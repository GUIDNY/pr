import { db } from "@/lib/db";

export const FREE_DELIVERY_THRESHOLD = 500;
export const STANDARD_DELIVERY_FEE = 49;

export type CartLine = { productId: string; price: number; quantity: number; categoryId: string; brandId: string };

export async function resolveCoupon(code: string | null | undefined, subtotal: number) {
  if (!code) return { discount: 0, error: null as string | null, promotion: null };

  const promo = await db.promotion.findUnique({ where: { code: code.trim().toUpperCase() } });
  if (!promo || !promo.isActive) return { discount: 0, error: "קוד קופון לא תקין", promotion: null };

  const now = new Date();
  if (promo.startsAt && now < promo.startsAt) return { discount: 0, error: "הקופון עדיין לא פעיל", promotion: null };
  if (promo.endsAt && now > promo.endsAt) return { discount: 0, error: "תוקף הקופון פג", promotion: null };
  if (promo.minCartAmount && subtotal < promo.minCartAmount) {
    return {
      discount: 0,
      error: `הקופון תקף להזמנה מעל ${promo.minCartAmount} ש"ח`,
      promotion: null,
    };
  }

  const discount = promo.type === "PERCENTAGE" ? Math.round((subtotal * promo.value) / 100) : Math.min(promo.value, subtotal);
  return { discount, error: null, promotion: promo };
}

export function computeDeliveryFee(subtotal: number) {
  return subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : STANDARD_DELIVERY_FEE;
}

export function computeCartSubtotal(lines: { price: number; quantity: number }[]) {
  return lines.reduce((sum, l) => sum + l.price * l.quantity, 0);
}

export function generateOrderNumber() {
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `PR-${rand}`;
}
