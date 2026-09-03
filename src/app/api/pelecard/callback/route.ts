import { NextResponse } from "next/server";
import { timingSafeEqual as nodeTimingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import {
  validateByUniqueKey,
  getTransaction,
  normalizeFeedback,
  CLEARERS,
  type PelecardFeedback,
} from "@/lib/pelecard/client";
import { pelecardConfig, callbackSecret } from "@/lib/pelecard/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* The only thing in this system allowed to mark an order paid.
   The browser's return to GoodURL marks nothing: anyone can type that address,
   and a shop that trusts it hands out orders for free. Every check below has a
   specific forgery it exists to stop, so none of them is optional. */

function secretMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  // Compare lengths first — timingSafeEqual throws on a mismatch — and still
  // run the comparison so the answer doesn't depend on where they diverge.
  if (a.length !== b.length) return false;
  return nodeTimingSafeEqual(a, b);
}

/**
 * Reads Pelecard's notification whatever shape it arrives in.
 *
 * We ask for JSON at init, and the first real transaction proved that is not
 * what turns up: the body came in a form Request.json() could not parse, this
 * route answered 400 twice, Pelecard treated the unacknowledged notification
 * as a failed transaction and sent the customer to the error page — for a
 * payment that may well have gone through at their end.
 *
 * So the parser accepts what a gateway actually sends: JSON, form-encoded, or
 * a query string. An unreadable body is no longer a reason to reject a
 * notification we can still identify from our own callback URL.
 *
 * Whatever the encoding, the result goes through normalizeFeedback(), because
 * the field names are not the ones the browser return uses either — see there.
 */
async function readFeedback(req: Request): Promise<{ feedback: PelecardFeedback; raw: string }> {
  const raw = await req.text().catch(() => "");
  if (!raw.trim()) return { feedback: {}, raw };

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return { feedback: normalizeFeedback(parsed as Record<string, unknown>), raw };
    }
  } catch {
    // Not JSON — fall through to the form encoding.
  }

  try {
    const form = Object.fromEntries(new URLSearchParams(raw)) as Record<string, unknown>;
    // A form-encoded body cannot nest, so Pelecard flattens ResultData back
    // into a JSON string under that key. Unwrapping it here means the
    // normaliser sees the same shape either way.
    if (typeof form.ResultData === "string") {
      try {
        form.ResultData = JSON.parse(form.ResultData);
      } catch {
        delete form.ResultData;
      }
    }
    return { feedback: normalizeFeedback(form), raw };
  } catch {
    console.error("[pelecard] unreadable callback body", { sample: raw.slice(0, 200) });
    return { feedback: {}, raw };
  }
}

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
  if (order.paymentStatus === "CAPTURED") return NextResponse.json({ ok: true });

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
  await db.$transaction([
    db.payment.update({
      where: { id: payment.id },
      data: {
        status: "CAPTURED",
        environment,
        ...paymentColumns(feedback, details),
        reference: feedback.PelecardTransactionNumber ?? feedback.PelecardTransactionId ?? null,
        rawResponse: { feedback, rawBody, validation, details } as object,
      },
    }),
    db.order.update({
      where: { id: orderId },
      data: { paymentStatus: "CAPTURED", paymentMethod: "PELECARD", status: "PAID" },
    }),
    db.orderStatusHistory.create({
      data: {
        orderId,
        fromStatus: order.status,
        toStatus: "PAID",
        note: `תשלום פלאקארד (${environment}) · אסמכתה ${feedback.PelecardTransactionId ?? "—"} · אישור ${feedback.ApprovalNo ?? "—"}`,
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
