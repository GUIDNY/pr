"use server";

import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getOrCreateCart } from "@/lib/cart";
import { buildCartSummary } from "@/lib/cart-summary";
import { generateOrderNumber } from "@/lib/pricing";
import { pelecardConfigured, TEST_ORDER_SHEKELS } from "@/lib/pelecard/config";

/**
 * The merchant's own way into the real payment page.
 *
 * Pelecard's test gateway cannot complete a transaction against this terminal,
 * so the only way to see the live payment form — the styling, 3D Secure, the
 * callback, the whole round trip — is to make a real charge on a real card.
 * This opens exactly one kind of order for that: one shekel, from the cart
 * that is already on screen, marked in its own order number as a test.
 *
 * It exists so the two things can be worked on separately: this lane against
 * the live terminal, and the ordinary DEMO_CARD checkout for everything around
 * it. Customers stay on the second until PELECARD_ENABLED is turned on, which
 * this action does not read and cannot change.
 *
 * Admin or staff only. The amount is a constant, not an argument — see
 * TEST_ORDER_SHEKELS.
 */
export async function createTestPaymentOrderAction() {
  const session = await getSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "STAFF")) {
    return { success: false as const, error: "אין הרשאה" };
  }

  if (!pelecardConfigured()) {
    return {
      success: false as const,
      error:
        "פלאקארד לא מוגדר בסביבה הזו. חסרים PELECARD_BASE_URL / PELECARD_ALLOW_PRODUCTION / פרטי המסוף.",
    };
  }

  const cart = await getOrCreateCart();
  if (cart.items.length === 0) {
    return { success: false as const, error: "צריך מוצר בעגלה כדי לפתוח בדיקה" };
  }

  /* The order carries one line, priced at the test amount, taken from the
     first thing in the cart. Snapshotting the real cart at its real prices and
     then charging a shekel would leave an order whose items and total disagree
     — which is indistinguishable, in the admin list and in any report, from a
     pricing bug. One honest line is worth more than a realistic-looking one. */
  const summary = await buildCartSummary(cart);
  const first = summary.items[0];
  const product = await db.product.findUnique({
    where: { id: first.productId },
    select: { sku: true },
  });

  let orderNumber = `TEST-${generateOrderNumber()}`;
  for (let i = 0; i < 5; i++) {
    const clash = await db.order.findUnique({ where: { orderNumber } });
    if (!clash) break;
    orderNumber = `TEST-${generateOrderNumber()}`;
  }

  const order = await db.order.create({
    data: {
      orderNumber,
      userId: session.sub,
      guestName: "בדיקת סליקה",
      guestEmail: "test@prec.co.il",
      guestPhone: "0000000000",
      deliveryMethod: "PICKUP",
      status: "PAYMENT_PENDING",
      subtotal: TEST_ORDER_SHEKELS,
      discountTotal: 0,
      deliveryFee: 0,
      total: TEST_ORDER_SHEKELS,
      paymentStatus: "PENDING",
      paymentMethod: "PELECARD",
      customerNote: `בדיקת סליקה — חיוב אמיתי של ₪${TEST_ORDER_SHEKELS}. לא הזמנת לקוח.`,
      items: {
        create: {
          productId: first.productId,
          titleSnap: first.title,
          skuSnap: product?.sku ?? "TEST",
          priceSnap: TEST_ORDER_SHEKELS,
          quantity: 1,
        },
      },
    },
  });

  /* The cart is left alone on purpose. This is a test standing next to the
     merchant's real session, not a purchase, and emptying their cart every
     time they check the payment page would make the lane annoying enough to
     stop using. */
  return { success: true as const, orderNumber: order.orderNumber, orderId: order.id };
}
