"use server";

import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getOrCreateCart } from "@/lib/cart";
import { buildCartSummary } from "@/lib/cart-summary";
import { generateOrderNumber } from "@/lib/pricing";
import { pelecardConfig, siteUrl, callbackSecret, TEST_ORDER_SHEKELS } from "@/lib/pelecard/config";
import { PELECARD_PROD_BASE, PELECARD_TEST_BASE } from "@/lib/pelecard/gateway";

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
 * Names every variable that is missing, in one answer.
 *
 * The first version listed all the possible causes without saying which had
 * happened, which is the same as naming none of them. The second read the throw
 * from pelecardConfig() and named one — better, but pelecardConfig() stops at
 * the first failure, so a deployment with nothing set at all reported them one
 * per attempt, and each attempt costs a variable, a redeploy and a wait.
 *
 * So the variables are read here directly rather than inferred from a throw.
 * That duplicates what config.ts knows, which is why pelecardConfig() is still
 * called at the end: it stays the authority on whether a payment can be opened,
 * and anything it refuses for a reason not enumerated above still surfaces
 * rather than being reported as fine.
 *
 * Safe to show, because it names variables and never values, and because the
 * only caller is behind an admin session.
 */
function whatIsMissing(): string | null {
  const missing: string[] = [];

  const base = process.env.PELECARD_BASE_URL?.trim();
  if (!base) {
    missing.push(`PELECARD_BASE_URL = ${PELECARD_PROD_BASE}`);
  } else if (base !== PELECARD_PROD_BASE && base !== PELECARD_TEST_BASE) {
    missing.push(`PELECARD_BASE_URL — הערך הנוכחי לא תקין, חייב להיות בדיוק ${PELECARD_PROD_BASE}`);
  }

  /* The production host is the only one that can complete a transaction against
     this terminal, so an unset host is a host on its way to being that one, and
     reaching it takes a second deliberate acknowledgement either way. */
  const headedForProduction = !base || base === PELECARD_PROD_BASE;
  if (headedForProduction && process.env.PELECARD_ALLOW_PRODUCTION !== "I_UNDERSTAND") {
    missing.push("PELECARD_ALLOW_PRODUCTION = I_UNDERSTAND");
  }

  for (const name of ["PELECARD_TERMINAL", "PELECARD_USER", "PELECARD_PASSWORD"] as const) {
    if (!process.env[name]?.trim()) missing.push(`${name} — מפלאקארד`);
  }

  // Not part of pelecardConfig(), and both are needed before a payment can be
  // opened: one builds the customer's return links, the other authenticates the
  // notification that is the only thing allowed to mark an order paid.
  if (!process.env.NEXT_PUBLIC_SITE_URL?.trim()) missing.push("NEXT_PUBLIC_SITE_URL = https://buytoday.co.il");
  if (!process.env.PELECARD_CALLBACK_SECRET?.trim()) missing.push("PELECARD_CALLBACK_SECRET — 40 תווים אקראיים שאתם ממציאים");

  if (missing.length > 0) {
    return `חסר ב-Vercel → Settings → Environment Variables (Production), ואחרי ההוספה צריך Redeploy:\n\n• ${missing.join("\n• ")}`;
  }

  try {
    pelecardConfig();
    siteUrl();
    callbackSecret();
  } catch (error) {
    return `פלאקארד לא מוגדר: ${error instanceof Error ? error.message : String(error)}`;
  }

  return null;
}
