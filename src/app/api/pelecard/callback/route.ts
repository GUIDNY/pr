import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  validateByUniqueKey,
  getTransaction,
  CLEARERS,
  holdThenCapture,
  holdDays,
  authorizationUidFrom,
  type PelecardFeedback,
} from "@/lib/pelecard/client";
import { readFeedback, readsAsRefusal, secretMatches } from "@/lib/pelecard/feedback";
import { pelecardConfig, callbackSecret } from "@/lib/pelecard/config";
import { customerHasPaid } from "@/lib/order-signal";
import { afterOrderPaid } from "@/lib/order-paid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* The only thing in this system allowed to mark an order paid.
   The browser's return to GoodURL marks nothing: anyone can type that address,
   and a shop that trusts it hands out orders for free. Every check below has a
   specific forgery it exists to stop, so none of them is optional. */

/**
 * The columns worth having as columns.
 *
 * Everything Pelecard says is kept verbatim in `rawResponse`, which stays the
 * source of truth. But a blob cannot be queried, sorted or shown in a table, so
 * the handful of fields the shop actually looks up — approval number, last four
 * digits, which card company, how many instalments — are lifted out as well.
 *
 * This runs on declines too, and deliberately: "which card was refused" is the
 * first question asked when a customer phones about a payment that did not go
 * through, and it was being thrown away.
 */
function paymentColumns(feedback: PelecardFeedback, details: Record<string, unknown>) {
  const cardNumber = String(details.CreditCardNumber ?? "");
  const clearerCode = String(details.CreditCardCompanyClearer ?? "");
  return {
    pelecardStatusCode: feedback.PelecardStatusCode ?? null,
    // The GUID, not TransactionPelecardId: this is the id GetTransaction takes
    // and the one the admin lookup needs. The numeric id is an approval-side
    // reference and is kept in `reference` instead.
    pelecardTransactionId: feedback.PelecardTransactionId ?? null,
    approvalNo: feedback.ApprovalNo ?? (details.DebitApproveNumber as string | undefined) ?? null,
    voucherId: (details.VoucherId as string | undefined) ?? null,
    cardLast4: cardNumber.replace(/\D/g, "").slice(-4) || null,
    // The card company, from its code — not TerminalName, which is this shop's
    // own name and would label every payment "פ.ר אלקטרוניקה".
    clearerName: CLEARERS[clearerCode] ?? null,
    totalPayments: Number(details.TotalPayments) || 1,
  };
}

export async function POST(req: Request) {
  const url = new URL(req.url);

  // 1. The secret is in the callback URL we handed Pelecard at init, and
  //    nowhere else, so a POST from anyone else stops here.
  let expectedSecret: string;
  try {
    expectedSecret = callbackSecret();
  } catch (error) {
    console.error("[pelecard] callback secret missing", error);
    return new NextResponse("not configured", { status: 503 });
  }
  if (!secretMatches(url.searchParams.get("secret") ?? "", expectedSecret)) {
    console.error("[pelecard] callback rejected: bad secret");
    return new NextResponse("forbidden", { status: 403 });
  }

  const { feedback, raw: rawBody } = await readFeedback(req);

  /* Which order this is about comes from our own callback URL first. We built
     that URL at init and it is authenticated by the secret above, so it holds
     even when the body is something we cannot read — and the body is exactly
     what a gateway is free to change the shape of. ParamX is the fallback. */
  const orderId = url.searchParams.get("order") || feedback.ParamX;
  if (!orderId) {
    console.error("[pelecard] callback with no order reference", { keys: Object.keys(feedback) });
    return new NextResponse("missing order reference", { status: 400 });
  }

  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) return new NextResponse("unknown order", { status: 404 });

  const payment = await db.payment.findFirst({
    where: { orderId, provider: "PELECARD" },
    orderBy: { createdAt: "desc" },
  });
  if (!payment) return new NextResponse("no pending payment", { status: 404 });

  // 2. Idempotency. Pelecard may deliver the same callback twice, and a retry
  //    must not produce a second payment record or a second status entry.
  if (customerHasPaid(order.paymentStatus)) return NextResponse.json({ ok: true });

  const fail = async (reason: string, extra?: unknown) => {
    // Pelecard's own verdict, in our logs. `reason` is our summary of why we
    // refused it; the code and their message are the evidence, and printing the
    // summary alone is how a real answer ("terminal not allowed to accept
    // Imex/36") gets thrown away in favour of "error feedback url".
    console.error("[pelecard] payment rejected", {
      orderId,
      reason,
      statusCode: feedback.PelecardStatusCode ?? null,
      errorMessage: feedback.ErrorMessage ?? null,
      transactionId: feedback.PelecardTransactionId ?? null,
      extra,
    });

    /* A failed payment moves the order, and that is the whole point: until now
       paymentStatus went to FAILED while status stayed PAYMENT_PENDING, so in
       the admin a declined order was indistinguishable from one the customer
       is still paying for.

       Only from the two statuses where it can be true, though. A late or
       redelivered failure must not drag an order that has since been paid for
       by other means — or already shipped — backwards. */
    const movesToFailed = order.status === "PAYMENT_PENDING" || order.status === "NEW";
    const details = feedback.ResultData ?? {};

  await db.$transaction([
      db.payment.update({
        where: { id: payment.id },
        data: {
          status: "FAILED",
          ...paymentColumns(feedback, details),
          reference: feedback.PelecardTransactionNumber ?? null,
          rawResponse: { feedback, rawBody, reason, extra } as object,
        },
      }),
      db.order.update({
        where: { id: orderId },
        data: { paymentStatus: "FAILED", ...(movesToFailed ? { status: "PAYMENT_FAILED" } : {}) },
      }),
      db.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: order.status,
          toStatus: movesToFailed ? "PAYMENT_FAILED" : order.status,
          note: [
            `תשלום נכשל · ${reason}`,
            feedback.PelecardStatusCode ? `קוד ${feedback.PelecardStatusCode}` : null,
            feedback.ErrorMessage,
          ]
            .filter(Boolean)
            .join(" · "),
        },
      }),
    ]);
    // 200 on purpose: the payment failed, but the notification was received and
    // recorded. A 500 here only makes Pelecard redeliver something we already
    // understand.
    return NextResponse.json({ ok: true });
  };

  if (url.searchParams.get("failed")) return fail("error feedback url");

  // 3. Anything but "000" is a decline.
  if (feedback.PelecardStatusCode !== "000") {
    return fail(`status ${feedback.PelecardStatusCode}`);
  }

  // 4. The sum charged must be the sum we asked for, to the agora. Compared
  //    against the integer we sent to the gateway, never against the float on
  //    the order. Checked before the validation call rather than after it (the
  //    spec has these the other way round): a payload that already contradicts
  //    our own record is settled without a round trip to Pelecard.
  const uniqueKey = feedback.UserKey || feedback.PelecardTransactionId;
  if (!uniqueKey || !payment.confirmationKey || payment.amountAgorot === null) {
    return fail("missing keys");
  }
  if (Number(feedback.TotalX100) !== payment.amountAgorot) {
    return fail("amount mismatch", {
      charged: feedback.TotalX100,
      expected: payment.amountAgorot,
    });
  }

  // 5. Don't believe the payload — ask Pelecard. A forged POST can claim
  //    "000"; it cannot produce a transaction Pelecard will confirm.
  let validation: unknown;
  try {
    validation = await validateByUniqueKey({
      ConfirmationKey: payment.confirmationKey,
      UniqueKey: uniqueKey,
      TotalX100: String(payment.amountAgorot),
    });
  } catch (error) {
    return fail("validate threw", String(error));
  }
  if (!validation || (typeof validation === "object" && Object.keys(validation).length === 0)) {
    return fail("validation empty");
  }
  if (readsAsRefusal(validation)) {
    return fail("validation refused", validation);
  }

  // 6. The full record, for the day a charge is disputed. The notification
  //    already carries most of it, so that is the starting point and
  //    GetTransaction only adds to it: a payment that is otherwise valid is
  //    never failed — nor left without a card number and an approval number —
  //    over a call that did not answer.
  let details: Record<string, unknown> = { ...(feedback.ResultData ?? {}) };
  try {
    if (feedback.PelecardTransactionId) {
      const transaction = await getTransaction(feedback.PelecardTransactionId);
      details = { ...details, ...(transaction.ResultData ?? {}) };
    }
  } catch (error) {
    console.error("[pelecard] GetTransaction failed (payment still valid)", { orderId, error });
  }

  const { environment } = pelecardConfig();

  // 7. Paid. Status, payment record and history in one transaction — a
  //    half-written payment is worse than none.
  /* A J5 authorisation is not a payment. The gateway reports both the same
     way — an approved transaction — and the only thing that separates them is
     what we asked it for, so this has to come from our own switch and never
     from the feedback. Backwards, it marks held money as collected: the order
     ships, the day's revenue counts it, and nobody ever presses the button
     that actually takes it. */
  const held = holdThenCapture();
  const settled = held ? "AUTHORIZED" : "CAPTURED";
  const orderStatus = held ? "NEW" : "PAID";

  /* A hold we cannot name is a hold we cannot collect: CompleteDebitByUid
     takes a uid and nothing else identifies the authorisation to Pelecard.
     The money would sit frozen on the customer's card until it lapsed, and
     nothing in the ordinary flow would ever say so — the order looks
     perfectly normal, orange light and all.

     So it is recorded and, when it is missing, shouted about with every key
     the reply actually carried. That listing is deliberate: their field name
     for this is not in the three endpoints this integration already speaks,
     so the first hold in the sandbox is what tells us what to look for. */
  const authorizationUid = held ? authorizationUidFrom(feedback) : null;
  const holdExpiresAt = held ? new Date(Date.now() + holdDays() * 86_400_000) : null;
  if (held && !authorizationUid) {
    await db.inventoryAlert.create({
      data: {
        type: "MANUAL_URGENT",
        severity: "CRITICAL",
        sourceSku: order.orderNumber,
        message:
          `הזמנה ${order.orderNumber}: נתפסה מסגרת בכרטיס אבל לא נמצא מזהה תפיסה (UID) בתשובה של פלאקארד, ` +
          `ולכן אי אפשר לגבות אותה מהממשק. השדות שחזרו: ${Object.keys(feedback.ResultData ?? {}).join(", ") || "אין"}. ` +
          `צריך לזהות את שם השדה הנכון מול Hotels API Technical Guide ולהשלים את הגבייה ידנית מול פלאקארד.`,
      },
    });
  }

  await db.$transaction([
    db.payment.update({
      where: { id: payment.id },
      data: {
        status: settled,
        environment,
        ...(held
          ? { authorizationUid, authorizedAt: new Date(), holdExpiresAt }
          : { capturedAt: new Date() }),
        ...paymentColumns(feedback, details),
        reference: feedback.PelecardTransactionNumber ?? feedback.PelecardTransactionId ?? null,
        rawResponse: { feedback, rawBody, validation, details } as object,
      },
    }),
    db.order.update({
      where: { id: orderId },
      data: { paymentStatus: settled, paymentMethod: "PELECARD", status: orderStatus },
    }),
    db.orderStatusHistory.create({
      data: {
        orderId,
        fromStatus: order.status,
        toStatus: orderStatus,
        note: `${held ? "דפוזיט" : "תשלום"} פלאקארד (${environment}) · אסמכתה ${feedback.PelecardTransactionId ?? "—"} · אישור ${feedback.ApprovalNo ?? "—"}`,
      },
    }),
  ]);

  /* Everything a paid order sets off — the wheel coupon retired, the club's
     cashback, the address filed, both mails — in one function shared with
     the balance lane (lib/wallet.ts), so an order paid from the BuyToday
     balance is followed through exactly the way a card-paid one is. */
  await afterOrderPaid(order);

  return NextResponse.json({ ok: true });
}
