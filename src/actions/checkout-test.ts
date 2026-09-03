"use server";

import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getOrCreateCart } from "@/lib/cart";
import { buildCartSummary } from "@/lib/cart-summary";
import { generateOrderNumber } from "@/lib/pricing";
import { pelecardConfig, siteUrl, callbackSecret, TEST_ORDER_SHEKELS } from "@/lib/pelecard/config";
import { PELECARD_PROD_BASE } from "@/lib/pelecard/gateway";

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

  const missing = whatIsMissing();
  if (missing) return { success: false as const, error: missing };

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

/**
 * Names the one variable that is actually missing.
 *
 * The first version of this listed every variable that could have caused the
 * refusal, which is the same as naming none of them: the person reading it is
 * standing in the Vercel dashboard trying to work out which row to add, and a
 * message that lists three is a message that sends them to check all three.
 *
 * Safe to show, because it names variables and never values, and because the
 * only caller is behind an admin session.
 */
function whatIsMissing(): string | null {
  try {
    pelecardConfig();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("is not set")) {
      return `חסר PELECARD_BASE_URL. הוסיפו אותו ב-Vercel (Production) עם הערך ${PELECARD_PROD_BASE}`;
    }
    if (message.includes("must be exactly")) {
      return `PELECARD_BASE_URL מכיל ערך לא תקין. הוא חייב להיות בדיוק ${PELECARD_PROD_BASE}`;
    }
    if (message.includes("Refusing to use")) {
      return "חסר PELECARD_ALLOW_PRODUCTION. הערך חייב להיות בדיוק I_UNDERSTAND";
    }
    if (message.includes("credentials are missing")) {
      return "חסרים פרטי המסוף: PELECARD_TERMINAL / PELECARD_USER / PELECARD_PASSWORD";
    }
    return `פלאקארד לא מוגדר: ${message}`;
  }

  /* Not part of pelecardConfig(), and both are needed before a payment can be
     opened: one builds the customer's return links, the other authenticates
     the notification that is the only thing allowed to mark an order paid. */
  try {
    siteUrl();
  } catch {
    return "חסר NEXT_PUBLIC_SITE_URL";
  }
  try {
    callbackSecret();
  } catch {
    return "חסר PELECARD_CALLBACK_SECRET";
  }

  return null;
}
