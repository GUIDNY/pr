"use server";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { initPayment, getTransaction, SUPPORTED_CARDS } from "@/lib/pelecard/client";
import {
  pelecardConfig,
  toAgorot,
  siteUrl,
  callbackSecret,
  isPelecardLiveTest,
  isPelecardConsoleAvailable,
  LIVE_TEST_MAX_SHEKELS,
} from "@/lib/pelecard/config";
import { generateOrderNumber } from "@/lib/pricing";

/**
 * Creates a throwaway order and opens a payment against it, so the flow can be
 * exercised without a real cart.
 *
 * It runs in one of two modes, and which one is decided in gateway.ts, never
 * here:
 *
 *   SANDBOX — the test gateway. No money moves, and a result can be forced with
 *   QAResultStatus so the failure paths are reachable without hunting for a card
 *   that declines.
 *
 *   LIVE TEST — the production gateway, deliberately. Every payment is a REAL
 *   charge on a REAL card. It exists because the test gateway cannot complete a
 *   transaction against this terminal at all, which left the merchant unable to
 *   find out whether their own terminal works. Forcing a result is impossible
 *   here (initPayment() throws), the amount is capped, and the order says in its
 *   own number what it is.
 *
 * Admin only in both, and unreachable entirely on the production deployment.
 */
export async function createSandboxTestOrderAction(amountShekels: number, qaResultStatus: string) {
  const session = await requireAdmin();

  if (!isPelecardConsoleAvailable()) {
    return { success: false as const, error: "זמין רק בסביבת הבדיקה" };
  }
  const liveTest = isPelecardLiveTest();

  if (!Number.isFinite(amountShekels) || amountShekels <= 0) {
    return { success: false as const, error: "סכום לא תקין" };
  }
  if (liveTest && amountShekels > LIVE_TEST_MAX_SHEKELS) {
    return {
      success: false as const,
      error: `בבדיקה חיה מותר עד ₪${LIVE_TEST_MAX_SHEKELS} — זהו חיוב אמיתי.`,
    };
  }
  // Forcing a result is a sandbox affordance. initPayment() refuses it against
  // production anyway; refusing it here means the request never gets that far.
  if (!liveTest && !/^\d{3}$/.test(qaResultStatus)) {
    return { success: false as const, error: "קוד תוצאה חייב להיות 3 ספרות" };
  }

  const config = pelecardConfig();
  const amountAgorot = toAgorot(amountShekels);
  const site = siteUrl();

  const order = await db.order.create({
    data: {
      orderNumber: `${liveTest ? "LIVETEST" : "TEST"}-${generateOrderNumber()}`,
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
      customerNote: liveTest
        ? `בדיקה חיה מול פלאקארד — חיוב אמיתי של ₪${amountShekels}. לא הזמנת לקוח.`
        : `הזמנת בדיקה אוטומטית (QAResultStatus=${qaResultStatus}) — לא הזמנה אמיתית`,
    },
  });

  // The order id travels in the callback URL, not only in ParamX inside the
  // body: the URL is ours and authenticated by the secret, so a notification
  // whose body we cannot read is still a notification we can act on.
  const callback = `${site}/api/pelecard/callback?secret=${encodeURIComponent(callbackSecret())}&order=${order.id}`;

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
      SupportedCards: SUPPORTED_CARDS,
      TakeIshurPopUp: "False",
    },
    liveTest ? undefined : { qaResultStatus }
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

/**
 * Asks Pelecard what they know about one transaction.
 *
 * Their reports system only lists transactions that were transmitted to the
 * card companies, and a sandbox transaction never is — so a payment made here
 * is invisible in their UI even though it exists on their side. This is how to
 * see it: give the transaction id and read their own answer.
 *
 * It is also the diagnostic for the case where a notification never arrived.
 * Whatever our database believes, this says what Pelecard believes.
 */
export async function lookupTransactionAction(transactionId: string) {
  await requireAdmin();

  if (!isPelecardConsoleAvailable()) {
    return { success: false as const, error: "זמין רק בסביבת הבדיקה" };
  }
  const id = transactionId.trim();
  if (!id) return { success: false as const, error: "יש להזין מזהה עסקה" };

  try {
    const transaction = await getTransaction(id);
    const empty =
      !transaction ||
      ((!transaction.ResultData || Object.keys(transaction.ResultData).length === 0) &&
        (!transaction.UserData || Object.keys(transaction.UserData).length === 0));
    if (empty) {
      return {
        success: false as const,
        error: "פלאקארד לא מכירים מזהה עסקה כזה — או שהעסקה מעולם לא נוצרה אצלם.",
      };
    }
    return { success: true as const, transaction };
  } catch (error) {
    console.error("[pelecard] transaction lookup failed", { transactionId: id, error });
    return { success: false as const, error: `השליפה נכשלה: ${String(error)}` };
  }
}
