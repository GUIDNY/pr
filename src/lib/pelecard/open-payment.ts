import "server-only";
import { db } from "@/lib/db";
import { initPayment, SUPPORTED_CARDS, paymentPageStyle, holdThenCapture } from "./client";
import { pelecardConfig, pelecardConfigured, paymentLaneFor, toAgorot, siteUrl, callbackSecret } from "./config";
import type { CheckoutViewer } from "./config";
import { maxPaymentsFor } from "./instalments";
import { customerHasPaid } from "@/lib/order-signal";

type InitResult = Awaited<ReturnType<typeof initPayment>>;

/** Pelecard said yes: a form to send the customer to, and no error with it.
    A type guard rather than a boolean, so that the two fields it just proved
    are present stay proven to the compiler afterwards. */
function initAccepted(result: InitResult | undefined): result is InitResult & { URL: string; ConfirmationKey: string } {
  if (!result?.URL || !result.ConfirmationKey) return false;
  const errCode = result.Error?.ErrCode;
  return errCode === 0 || errCode === "0" || errCode === undefined;
}

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
 *   global switch is the default, a back-office role is always demo, and an
 *   account named in PELECARD_DEMO_EMAILS or PELECARD_LIVE_EMAILS overrides it
 *   in either direction. The viewer must come from the signed cookie — the
 *   address typed into the checkout form is whatever the shopper typed, and
 *   deciding the lane from it would let anyone type their way onto the gateway.
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
  { lane = "customer", viewer }: { lane?: PaymentLane; viewer?: CheckoutViewer | null } = {},
): Promise<OpenPaymentResult> {
  const armed = lane === "test" ? pelecardConfigured() : paymentLaneFor(viewer) === "gateway";
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
  if (customerHasPaid(order.paymentStatus)) return { ok: false, status: 409, error: "already paid" };

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

  /* How many payments this basket may be split into — the table is in
     lib/pelecard/instalments.ts and is meant to be edited. Their form shows
     the field only when the maximum differs from the minimum, which is why
     there was no instalments control at all while this was 1. */
  const wantedPayments = maxPaymentsFor(order.total);

  const initParams = (maxPayments: number) => ({
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
      /* WHAT THEIR FORM ASKS FOR, and it is four fields shorter than it was.
         The name, the email and the phone were all typed into step 1 of our
         own checkout a moment earlier and are already on the order; asking for
         them again on their page is the same customer answering the same
         question twice, and it is the second time that gets abandoned.

         It became the whole experience once the wallets arrived. These
         parameters are not per-method — they dress the page — so choosing
         Google Pay or bit still produced a form to fill in before the wallet
         button could be pressed, which is the opposite of what a wallet is
         for: one tap, the details come from the wallet.

         Hide is their own word for it, and for most of these it is their
         DEFAULT — we had been switching on fields that ship off. The one
         exception is the id number, which defaults to shown-and-optional, so
         it has to be named to go away.

         CVV stays Must. It is not a convenience field: a card-not-present
         transaction without it authorises worse, and a wallet does not need it
         because the wallet has already authenticated. That their page shows it
         on the wallet tabs anyway is theirs to fix, not ours to work around by
         weakening the card lane. */
      /* WHAT THEIR FORM ASKS FOR, and the answer is "nothing it can be told".
         Pelecard accept a VALUE for these fields, not only show-or-hide, and a
         filled field is what both of the previous versions were reaching for.

         It asked for all of them empty first: the name, the id, the email and
         the phone, every one already typed into step 1 of our own checkout a
         moment earlier. The same customer answering the same questions twice,
         and it is the second time that gets abandoned.

         So they were hidden — and that broke bit. Their form makes the phone
         REQUIRED on the bit tab, because that number is where bit sends the
         payment request. With nothing to send to, a ₪8,579 payment came back
         as error 599 and the customer's phone never rang. Hiding a field does
         not tell you what the field was for.

         Filling them is the version that serves both: bit has its number, the
         customer types nothing, and the details on their page are the ones the
         order already carries rather than a second copy that can disagree with
         it. Empty strings fall back to hidden, which is these fields' own
         default and the right answer when we have nothing to offer.

         CVV stays Must, and is the one field we genuinely cannot supply. A
         card-not-present transaction without it authorises worse, and a wallet
         has already authenticated its holder — that their page still shows the
         box on the wallet tabs is theirs to fix, not a reason to weaken the
         card lane. */
      Cvv2Field: "must",
      CustomerIdField: "Hide",
      CardHolderName: order.guestName || "Hide",
      EmailField: order.guestEmail || "Hide",
      TelField: order.guestPhone || "Hide",
      MaxPayments: maxPayments,
      /* Always 1, so that "one payment" stays on the list. Their rule is that
         a minimum equal to the maximum hides the field; a minimum of two would
         force everyone to split. */
      MinPayments: 1,
      /* They compute the first instalment and the customer cannot edit it.
         "Manual" opens that box for editing, which is a field to get wrong on
         a page we are trying to shorten. */
      FirstPayment: "auto",
      ShopNo: "001",
      UseLuhnAlgorithm: "True",
      SupportedCards: SUPPORTED_CARDS,
      TakeIshurPopUp: "False",
    ...paymentPageStyle(),
  });

  /* THE INSTALMENT ATTEMPT IS ALLOWED TO FAIL.
     A terminal that is not cleared for instalments refuses the init outright,
     and a refusal here is not a missing dropdown — it is a checkout that never
     opens, for every customer, with "payment init failed" where the card form
     should be. Nobody in this repo can read the terminal's permissions, and
     finding out by shipping it is how a live shop stops taking money.

     So the same order is opened a second time as a single payment and the
     customer pays. The shop loses the option, never the sale, and the reason
     is in the log rather than in a phone call. It costs one extra round trip
     only on the deployment where it is going to fail anyway, and it stops
     costing anything the day Pelecard switch instalments on — the first
     attempt simply starts succeeding. */
  let result: InitResult | undefined;
  for (const maxPayments of wantedPayments > 1 ? [wantedPayments, 1] : [1]) {
    try {
      result = await initPayment(initParams(maxPayments));
    } catch (error) {
      console.error("[pelecard] init threw", { orderId: order.id, maxPayments, error });
      result = undefined;
    }
    if (initAccepted(result)) break;
    if (maxPayments > 1) {
      console.error("[pelecard] init refused with instalments — retrying as a single payment", {
        orderId: order.id,
        maxPayments,
        error: result?.Error,
      });
    }
  }

  if (!result) return { ok: false, status: 502, error: "payment init failed" };

  if (!initAccepted(result)) {
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
