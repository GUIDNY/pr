import { db } from "@/lib/db";
import type { PromotionType } from "@/lib/enums";

export { FREE_DELIVERY_THRESHOLD, HOME_DELIVERY_FEE, computeDeliveryFee } from "@/lib/delivery";

export type CartLine = { productId: string; price: number; quantity: number; categoryId: string; brandId: string };

/** One cart line as the coupon rules see it. parentCategoryId lets a coupon
    on a department ("מקררים") take a product filed under its leaf. */
export type CouponLine = {
  productId: string;
  price: number;
  quantity: number;
  categoryId: string;
  parentCategoryId: string | null;
  brandId: string;
};

/** Who is holding the cart, for the per-customer and first-order rules.
    Either may be missing — a guest who has not typed an email yet is simply
    not limited until they do, and the order action asks again with the
    email from the form. */
export type CouponCustomer = { userId?: string | null; email?: string | null };

export type CouponResult = {
  discount: number;
  /** The code waives the home-delivery fee (type FREE_DELIVERY). */
  freeDelivery: boolean;
  /** What to show beside "קופון X הופעל". */
  label: string | null;
  error: string | null;
  promotion: { id: string; code: string; type: string } | null;
};

const NONE: CouponResult = { discount: 0, freeDelivery: false, label: null, error: null, promotion: null };
function refuse(error: string): CouponResult {
  return { ...NONE, error };
}

/** Orders that count as a redemption: money taken, not a checkout that was
    abandoned at the gateway. */
const PAID = ["AUTHORIZED", "CAPTURED"];

/**
 * What a coupon code is worth on this cart, or why it is not.
 *
 * Every rule a coupon can carry is checked here and nowhere else, so the
 * cart drawer, the cart page, the checkout and the order that is written
 * all reach the same answer. The scope rules were the gap: CATEGORY, BRAND
 * and PRODUCT existed in the schema and the admin form offered them, but
 * the discount was always taken off the whole subtotal. A "10% על מקררים"
 * coupon was 10% on anything.
 */
export async function resolveCoupon(
  code: string | null | undefined,
  lines: CouponLine[],
  customer: CouponCustomer = {},
): Promise<CouponResult> {
  if (!code) return NONE;

  const promo = await db.promotion.findUnique({ where: { code: code.trim().toUpperCase() } });
  if (!promo || !promo.isActive) return refuse("קוד קופון לא תקין");

  const now = new Date();
  if (promo.startsAt && now < promo.startsAt) return refuse("הקופון עדיין לא פעיל");
  if (promo.endsAt && now > promo.endsAt) return refuse("תוקף הקופון פג");

  const subtotal = computeCartSubtotal(lines);
  if (promo.minCartAmount && subtotal < promo.minCartAmount) {
    return refuse(`הקופון תקף להזמנה מעל ${promo.minCartAmount} ש"ח`);
  }

  /* What the code applies to. A scoped coupon on a cart with nothing in its
     scope is refused with a reason, not silently worth zero. */
  const inScope = lines.filter((l) => {
    switch (promo.scope) {
      case "CATEGORY":
        return l.categoryId === promo.scopeRefId || l.parentCategoryId === promo.scopeRefId;
      case "BRAND":
        return l.brandId === promo.scopeRefId;
      case "PRODUCT":
        return l.productId === promo.scopeRefId;
      default:
        return true;
    }
  });
  const eligible = computeCartSubtotal(inScope);
  if (promo.scope !== "CART" && eligible === 0) {
    return refuse("הקופון לא חל על המוצרים שבעגלה");
  }

  /* Limits, counted from orders rather than kept in a counter: a counter
     drifts the first time an order is deleted or a callback is replayed,
     and the orders are the record anyway. Only when a limit is set, so an
     ordinary coupon costs no extra query. */
  const email = customer.email?.trim().toLowerCase() || null;
  const whoClauses = [
    ...(customer.userId ? [{ userId: customer.userId }] : []),
    ...(email ? [{ guestEmail: { equals: email, mode: "insensitive" as const } }] : []),
  ];

  if (promo.usageLimit) {
    const used = await db.order.count({ where: { couponCode: promo.code!, paymentStatus: { in: PAID } } });
    if (used >= promo.usageLimit) return refuse("הקופון נוצל במלואו");
  }
  if (whoClauses.length > 0) {
    if (promo.perCustomerLimit) {
      const mine = await db.order.count({
        where: { couponCode: promo.code!, paymentStatus: { in: PAID }, OR: whoClauses },
      });
      if (mine >= promo.perCustomerLimit) {
        return refuse(promo.perCustomerLimit === 1 ? "הקופון כבר נוצל בהזמנה קודמת" : "הקופון נוצל את מלוא הפעמים");
      }
    }
    if (promo.firstOrderOnly) {
      const previous = await db.order.count({ where: { paymentStatus: { in: PAID }, OR: whoClauses } });
      if (previous > 0) return refuse("הקופון מיועד להזמנה ראשונה בלבד");
    }
  }

  const type = promo.type as PromotionType;
  if (type === "FREE_DELIVERY") {
    return {
      discount: 0,
      freeDelivery: true,
      label: promo.description || "משלוח עד הבית חינם",
      error: null,
      promotion: { id: promo.id, code: promo.code!, type },
    };
  }

  const raw = type === "PERCENTAGE" ? Math.round((eligible * promo.value) / 100) : Math.min(promo.value, eligible);
  // A percentage can carry a ceiling (the mall wheel's 5% stops at ₪100).
  const discount = promo.maxDiscount ? Math.min(raw, promo.maxDiscount) : raw;
  return {
    discount,
    freeDelivery: false,
    label: promo.description || (type === "PERCENTAGE" ? `${promo.value}% הנחה` : `₪${promo.value} הנחה`),
    error: null,
    promotion: { id: promo.id, code: promo.code!, type },
  };
}

export function computeCartSubtotal(lines: { price: number; quantity: number }[]) {
  return lines.reduce((sum, l) => sum + l.price * l.quantity, 0);
}

export function generateOrderNumber() {
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `PR-${rand}`;
}
