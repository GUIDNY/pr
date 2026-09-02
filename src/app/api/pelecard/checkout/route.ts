import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { initPayment, SUPPORTED_CARDS } from "@/lib/pelecard/client";
import {
  pelecardConfig,
  pelecardEnabled,
  toAgorot,
  siteUrl,
  callbackSecret,
} from "@/lib/pelecard/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Opens a Pelecard payment for an order that already exists in the database,
 * and hands back the URL of Pelecard's own payment page.
 *
 * The amount is read from the order. Never from the request body: the caller
 * is a browser, and a browser that can name the price can name it as 1.
 */
export async function POST(req: Request) {
  if (!pelecardEnabled()) {
    return NextResponse.json({ error: "pelecard disabled" }, { status: 503 });
  }

  let config;
  try {
    config = pelecardConfig();
  } catch (error) {
    console.error("[pelecard] configuration refused", error);
    return NextResponse.json({ error: "payment not configured" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    orderId?: string;
    qaResultStatus?: string;
  };
  if (!body.orderId) return NextResponse.json({ error: "orderId is required" }, { status: 400 });

  const order = await db.order.findUnique({ where: { id: body.orderId } });
  if (!order) return NextResponse.json({ error: "order not found" }, { status: 404 });
  if (order.paymentStatus === "CAPTURED") {
    return NextResponse.json({ error: "already paid" }, { status: 409 });
  }

  const amountAgorot = toAgorot(order.total);
  const site = siteUrl();
  // The order id travels in the callback URL, not only in ParamX inside the
  // body: the URL is ours and authenticated by the secret, so a notification
  // whose body we cannot read is still a notification we can act on.
  const callback = `${site}/api/pelecard/callback?secret=${encodeURIComponent(callbackSecret())}&order=${order.id}`;

  let result;
  try {
    result = await initPayment(
      {
        ActionType: "J4", // straight charge
        Currency: "1", // ILS
        Total: String(amountAgorot),
        FreeTotal: "False",
        GoodURL: `${site}/checkout/success/${order.orderNumber}`,
        ErrorURL: `${site}/checkout/error?order=${order.orderNumber}`,
        CancelURL: `${site}/checkout/cancelled?order=${order.orderNumber}`,
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
      },
      // Forcing a result is a sandbox affordance. initPayment() throws if this
      // ever reaches the production gateway; the guard here means a request
      // carrying it never even gets that far in a live build.
      config.isSandbox && body.qaResultStatus ? { qaResultStatus: body.qaResultStatus } : undefined
    );
  } catch (error) {
    console.error("[pelecard] init threw", { orderId: order.id, error });
    return NextResponse.json({ error: "payment init failed" }, { status: 502 });
  }

  const errCode = result.Error?.ErrCode;
  if (!result.URL || !result.ConfirmationKey || (errCode !== 0 && errCode !== "0" && errCode !== undefined)) {
    console.error("[pelecard] init failed", { orderId: order.id, error: result.Error });
    return NextResponse.json({ error: "payment init failed" }, { status: 502 });
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

  return NextResponse.json({ redirectUrl: result.URL, orderId: order.id });
}
