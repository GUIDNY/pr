import "server-only";
import { db } from "@/lib/db";
import { initPayment, SUPPORTED_CARDS, paymentPageStyle, holdThenCapture } from "./client";
import { pelecardConfig, pelecardConfigured, paymentLaneFor, toAgorot, siteUrl, callbackSecret } from "./config";

/**
 * Opens a Pelecard payment for an order that already exists, and hands back the
 * address of their payment form.
 *
 * One implementation, two callers: the API route the checkout form posts to,
 * and the page that embeds the form in a frame. They had drifted into two
 * copies of the same twenty lines once already, and the copy that gets a fix is
 * never both.
 *
 * The amount is read from the order and never from a caller. A browser that can
 * name the price can name it as 1.
 *
 * Two lanes, and the difference is only which switch has to be on:
 *
 *   "customer" — the storefront. Armed by paymentLaneFor(), which answers the
 *   question per signed-in account rather than once for the whole shop: the
 *   global switch is the default, and an account named in PELECARD_DEMO_EMAILS
 *   or PELECARD_LIVE_EMAILS overrides it in either direction. sessionEmail must
 *   come from the signed cookie — the address typed into the checkout form is
 *   whatever the shopper typed, and deciding the lane from it would let anyone
 *   type their way onto the gateway.
 *
 *   "test" — the merchant's own ₪1 transaction against the live terminal, so
 *   the real payment page can be worked on before customers are sent to it.
 *   Requires only that Pelecard is configured. It does NOT check who is asking:
 *   the caller must have established that already, and both callers do.
 */

export type OpenPaymentResult =
  | { ok: true; redirectUrl: string; orderId: string }
  | { ok: false; status: number; error: string };

export type PaymentLane = "customer" | "test";

export async function openPelecardPayment(
  orderId: string,
  { lane = "customer", sessionEmail }: { lane?: PaymentLane; sessionEmail?: string | null } = {},
): Promise<OpenPaymentResult> {
  const armed = lane === "test" ? pelecardConfigured() : paymentLaneFor(sessionEmail) === "gateway";
  if (!armed) return { ok: false, status: 503, error: "pelecard disabled" };

  /* siteUrl() and callbackSecret() throw as readily as pelecardConfig() does,
     and they used to be called further down, outside any try — so a deployment
     with the gateway configured but NEXT_PUBLIC_SITE_URL or
     PELECARD_CALLBACK_SECRET missing did not reach the "payment unavailable"
     state, it threw through the page and rendered a crash. All three resolve
     here, together, and a missing one is a refusal like any other. */
  let config;
  let site;
  let secret;
  try {
    config = pelecardConfig();
    site = siteUrl();
    secret = callbackSecret();
  } catch (error) {
    console.error("[pelecard] configuration refused", error);
    return { ok: false, status: 503, error: "payment not configured" };
  }

  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) return { ok: false, status: 404, error: "order not found" };
  if (order.paymentStatus === "CAPTURED") return { ok: false, status: 409, error: "already paid" };

  const amountAgorot = toAgorot(order.total);

  /* The order id travels in the callback URL, not only in ParamX inside the
     body: the URL is ours and authenticated by the secret, so a notification
     whose body we cannot read is still one we can act on. */
  const callback = `${site}/api/pelecard/callback?secret=${encodeURIComponent(secret)}&order=${order.id}`;

  /* Where the customer's browser lands afterwards. In the framed flow these
     open inside the frame, so they go to a page whose only job is to put the
     whole window back where it belongs — see /checkout/frame-return. */
  const returnTo = (to: string) =>
    `${site}/checkout/frame-return?to=${to}&order=${encodeURIComponent(order.orderNumber)}`;

  let result;
  try {
    result = await initPayment({
      // J4 charges now; J5 holds the amount on the card and leaves the
      // charge to a person pressing "אשר תשלום" in the back office. The
      // switch is off until the terminal and the capture call both exist —
      // see holdThenCapture.
      ActionType: holdThenCapture() ? "J5" : "J4",
      Currency: "1", // ILS
      Total: String(amountAgorot),
      FreeTotal: "False",
      GoodURL: returnTo("success"),
      ErrorURL: returnTo("error"),
      CancelURL: returnTo("cancelled"),
      ServerSideGoodFeedbackURL: callback,
      ServerSideErrorFeedbackURL: `${callback}&failed=1`,
      ServerSideFeedbackContentType: "application/json",
      FeedbackDataTransferMethod: "POST",
      ParamX: order.id, // comes back on every response — our link to the order
      UserKey: order.id,
      Language: "HE",
      AccessibilityMode: "True",
      Cvv2Field: "must",
      CustomerIdField: "optional",
      CardHolderName: "optional",
      EmailField: "optional",
      TelField: "optional",
      MaxPayments: 1, // until there is an instalments agreement with Pelecard
      MinPayments: 1,
      FirstPayment: "auto",
      ShopNo: "001",
      UseLuhnAlgorithm: "True",
      SupportedCards: SUPPORTED_CARDS,
      TakeIshurPopUp: "False",
      ...paymentPageStyle(),
    });
  } catch (error) {
    console.error("[pelecard] init threw", { orderId: order.id, error });
    return { ok: false, status: 502, error: "payment init failed" };
  }

  const errCode = result.Error?.ErrCode;
  if (!result.URL || !result.ConfirmationKey || (errCode !== 0 && errCode !== "0" && errCode !== undefined)) {
    console.error("[pelecard] init failed", { orderId: order.id, error: result.Error });
    return { ok: false, status: 502, error: result.Error?.ErrMsg ?? "payment init failed" };
  }

  await db.payment.create({
    data: {
      orderId: order.id,
      provider: "PELECARD",
      amount: order.total,
      amountAgorot,
      status: "PENDING",
      environment: config.environment,
      confirmationKey: result.ConfirmationKey,
    },
  });

  await db.order.update({
    where: { id: order.id },
    data: { paymentMethod: "PELECARD", paymentStatus: "PENDING", status: "PAYMENT_PENDING" },
  });

  return { ok: true, redirectUrl: result.URL, orderId: order.id };
}
