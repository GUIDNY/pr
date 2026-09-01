import { NextResponse } from "next/server";
import { timingSafeEqual as nodeTimingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import {
  validateByUniqueKey,
  getTransaction,
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

  const feedback = (await req.json().catch(() => null)) as PelecardFeedback | null;
  if (!feedback) return new NextResponse("bad payload", { status: 400 });

  const orderId = feedback.ParamX;
  if (!orderId) return new NextResponse("missing ParamX", { status: 400 });

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
    console.error("[pelecard] payment rejected", { orderId, reason, extra });
    await db.$transaction([
      db.payment.update({
        where: { id: payment.id },
        data: {
          status: "FAILED",
          pelecardStatusCode: feedback.PelecardStatusCode,
          pelecardTransactionId: feedback.PelecardTransactionId,
          rawResponse: { feedback, reason, extra } as object,
        },
      }),
      db.order.update({ where: { id: orderId }, data: { paymentStatus: "FAILED" } }),
      db.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: order.status,
          toStatus: order.status,
          note: `תשלום נכשל · ${reason}${feedback.PelecardStatusCode ? ` · קוד ${feedback.PelecardStatusCode}` : ""}`,
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

  // 6. The full record, for the day a charge is disputed. Best effort: a
  //    payment that is otherwise valid is not failed over a missing detail.
  let details: Record<string, unknown> = {};
  try {
    if (feedback.PelecardTransactionId) {
      const transaction = await getTransaction(feedback.PelecardTransactionId);
      details = transaction.ResultData ?? {};
    }
  } catch (error) {
    console.error("[pelecard] GetTransaction failed (payment still valid)", { orderId, error });
  }

  const { environment } = pelecardConfig();
  const cardNumber = String(details.CreditCardNumber ?? "");

  // 7. Paid. Status, payment record and history in one transaction — a
  //    half-written payment is worse than none.
  await db.$transaction([
    db.payment.update({
      where: { id: payment.id },
      data: {
        status: "CAPTURED",
        environment,
        reference: feedback.ApprovalNo ?? feedback.PelecardTransactionId ?? null,
        pelecardTransactionId: feedback.PelecardTransactionId,
        pelecardStatusCode: feedback.PelecardStatusCode,
        approvalNo: feedback.ApprovalNo ?? (details.DebitApproveNumber as string | undefined) ?? null,
        voucherId: (details.VoucherId as string | undefined) ?? null,
        cardLast4: cardNumber.slice(-4) || null,
        clearerName: CLEARERS[String(details.CreditCardCompanyClearer)] ?? null,
        totalPayments: Number(details.TotalPayments) || 1,
        rawResponse: { feedback, validation, details } as object,
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
