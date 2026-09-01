"use server";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { initPayment } from "@/lib/pelecard/client";
import {
  pelecardConfig,
  toAgorot,
  siteUrl,
  callbackSecret,
  isPelecardSandbox,
} from "@/lib/pelecard/config";
import { generateOrderNumber } from "@/lib/pricing";

/**
 * Creates a throwaway order and opens a sandbox payment against it, so every
 * failure path can be exercised without a real cart and without hunting for a
 * card that declines.
 *
 * Three separate refusals stand between this and a real charge: it is admin
 * only, it stops unless the configured gateway is the test one, and
 * initPayment() throws if the QA parameters would ever reach production. The
 * orders it creates are marked in their own number and note so nobody mistakes
 * one for a customer's.
 */
export async function createSandboxTestOrderAction(amountShekels: number, qaResultStatus: string) {
  const session = await requireAdmin();

  if (!isPelecardSandbox()) {
    return { success: false as const, error: "זמין רק בסביבת הבדיקה" };
  }
  if (!Number.isFinite(amountShekels) || amountShekels <= 0) {
    return { success: false as const, error: "סכום לא תקין" };
  }
  if (!/^\d{3}$/.test(qaResultStatus)) {
    return { success: false as const, error: "קוד תוצאה חייב להיות 3 ספרות" };
  }

  const config = pelecardConfig();
  const amountAgorot = toAgorot(amountShekels);
  const site = siteUrl();

  const order = await db.order.create({
    data: {
      orderNumber: `TEST-${generateOrderNumber()}`,
      userId: session.sub,
      guestName: "בדיקת סליקה",
      guestEmail: "sandbox@prec.co.il",
      guestPhone: "0000000000",
      deliveryMethod: "PICKUP",
      status: "PAYMENT_PENDING",
      subtotal: amountShekels,
      total: amountShekels,
      paymentStatus: "PENDING",
      paymentMethod: "PELECARD",
      customerNote: `הזמנת בדיקה אוטומטית (QAResultStatus=${qaResultStatus}) — לא הזמנה אמיתית`,
    },
  });

  const callback = `${site}/api/pelecard/callback?secret=${encodeURIComponent(callbackSecret())}`;

  const result = await initPayment(
    {
      ActionType: "J4",
      Currency: "1",
      Total: String(amountAgorot),
      FreeTotal: "False",
      GoodURL: `${site}/checkout/success/${order.orderNumber}`,
      ErrorURL: `${site}/checkout/error?order=${order.orderNumber}`,
      CancelURL: `${site}/checkout/cancelled?order=${order.orderNumber}`,
      ServerSideGoodFeedbackURL: callback,
      ServerSideErrorFeedbackURL: `${callback}&failed=1`,
      ServerSideFeedbackContentType: "application/json",
      FeedbackDataTransferMethod: "POST",
      ParamX: order.id,
      UserKey: order.id,
      Language: "HE",
      AccessibilityMode: "True",
      Cvv2Field: "must",
      MaxPayments: 1,
      MinPayments: 1,
      FirstPayment: "auto",
      ShopNo: "001",
      UseLuhnAlgorithm: "True",
      TakeIshurPopUp: "False",
    },
    { qaResultStatus }
  );

  const errCode = result.Error?.ErrCode;
  if (!result.URL || !result.ConfirmationKey || (errCode !== 0 && errCode !== "0" && errCode !== undefined)) {
    console.error("[pelecard] sandbox init failed", { orderId: order.id, error: result.Error });
    return { success: false as const, error: result.Error?.ErrMsg ?? "פתיחת העסקה נכשלה" };
  }

  await db.payment.create({
    data: {
      orderId: order.id,
      provider: "PELECARD",
      amount: amountShekels,
      amountAgorot,
      status: "PENDING",
      environment: config.environment,
      confirmationKey: result.ConfirmationKey,
    },
  });

  return { success: true as const, redirectUrl: result.URL, orderNumber: order.orderNumber };
}
