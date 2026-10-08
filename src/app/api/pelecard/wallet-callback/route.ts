import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { validateByUniqueKey, getTransaction } from "@/lib/pelecard/client";
import { readFeedback, readsAsRefusal, secretMatches } from "@/lib/pelecard/feedback";
import { pelecardConfig, callbackSecret } from "@/lib/pelecard/config";
import { creditTopup } from "@/lib/wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* The only thing in this system allowed to credit a BuyToday balance from a
   card payment. It is the order callback (api/pelecard/callback) with a
   top-up in place of an order, and it keeps every one of that route's checks
   in the same order, for the same reasons — read the comments there. The
   browser's return to the wallet page credits nothing.

   It deliberately does not consult WALLET_ENABLED. A customer who paid while
   the flag was on and whose notification lands after it was switched off has
   still paid, and the balance is theirs. */

function cardLast4(details: Record<string, unknown>): string | null {
  return String(details.CreditCardNumber ?? "").replace(/\D/g, "").slice(-4) || null;
}

export async function POST(req: Request) {
  const url = new URL(req.url);

  // 1. Our secret, in the URL we gave Pelecard and nowhere else.
  let expectedSecret: string;
  try {
    expectedSecret = callbackSecret();
  } catch (error) {
    console.error("[wallet] callback secret missing", error);
    return new NextResponse("not configured", { status: 503 });
  }
  if (!secretMatches(url.searchParams.get("secret") ?? "", expectedSecret)) {
    console.error("[wallet] callback rejected: bad secret");
    return new NextResponse("forbidden", { status: 403 });
  }

  const { feedback, raw: rawBody } = await readFeedback(req);

  // Which top-up: our own URL first, ParamX as the fallback.
  const topupId = url.searchParams.get("topup") || feedback.ParamX;
  if (!topupId) return new NextResponse("missing top-up reference", { status: 400 });

  const topup = await db.walletTopup.findUnique({ where: { id: topupId } });
  if (!topup) return new NextResponse("unknown top-up", { status: 404 });

  // 2. Idempotency: credited once. creditTopup checks again under a lock, so
  //    two deliveries racing past this line still credit once.
  if (topup.status === "PAID") return NextResponse.json({ ok: true });

  const fail = async (reason: string, extra?: unknown) => {
    console.error("[wallet] top-up rejected", {
      topupId,
      reason,
      statusCode: feedback.PelecardStatusCode ?? null,
      errorMessage: feedback.ErrorMessage ?? null,
      transactionId: feedback.PelecardTransactionId ?? null,
      extra,
    });
    // Only a PENDING top-up is marked failed; the condition makes a late
    // failure unable to touch one that has since been credited.
    await db.walletTopup.updateMany({
      where: { id: topupId, status: "PENDING" },
      data: {
        status: "FAILED",
        pelecardStatusCode: feedback.PelecardStatusCode ?? null,
        pelecardTransactionId: feedback.PelecardTransactionId ?? null,
        rawResponse: { feedback, rawBody, reason, extra } as object,
      },
    });
    // 200: received and understood. A 500 only earns a redelivery.
    return NextResponse.json({ ok: true });
  };

  if (url.searchParams.get("failed")) return fail("error feedback url");

  // 3. Anything but "000" is a decline.
  if (feedback.PelecardStatusCode !== "000") return fail(`status ${feedback.PelecardStatusCode}`);

  // 4. The sum charged is the package's, to the agora.
  const uniqueKey = feedback.UserKey || feedback.PelecardTransactionId;
  if (!uniqueKey || !topup.confirmationKey) return fail("missing keys");
  if (Number(feedback.TotalX100) !== topup.paidAgorot) {
    return fail("amount mismatch", { charged: feedback.TotalX100, expected: topup.paidAgorot });
  }

  // 5. Ask Pelecard. A forged POST can claim "000"; it cannot produce a
  //    transaction Pelecard will confirm.
  let validation: unknown;
  try {
    validation = await validateByUniqueKey({
      ConfirmationKey: topup.confirmationKey,
      UniqueKey: uniqueKey,
      TotalX100: String(topup.paidAgorot),
    });
  } catch (error) {
    return fail("validate threw", String(error));
  }
  if (!validation || (typeof validation === "object" && Object.keys(validation).length === 0)) {
    return fail("validation empty");
  }
  if (readsAsRefusal(validation)) return fail("validation refused", validation);

  // 6. The full record, best effort — never a reason to refuse a valid payment.
  let details: Record<string, unknown> = { ...(feedback.ResultData ?? {}) };
  try {
    if (feedback.PelecardTransactionId) {
      const transaction = await getTransaction(feedback.PelecardTransactionId);
      details = { ...details, ...(transaction.ResultData ?? {}) };
    }
  } catch (error) {
    console.error("[wallet] GetTransaction failed (payment still valid)", { topupId, error });
  }

  // 7. Credited: PAID + TOPUP + BONUS in one transaction, exactly once.
  const approvalNo = feedback.ApprovalNo ?? (details.DebitApproveNumber as string | undefined) ?? null;
  await creditTopup(topupId, {
    environment: pelecardConfig().environment,
    pelecardTransactionId: feedback.PelecardTransactionId ?? null,
    pelecardStatusCode: feedback.PelecardStatusCode ?? null,
    approvalNo,
    cardLast4: cardLast4(details),
    rawResponse: { feedback, rawBody, validation, details } as object,
  });

  return NextResponse.json({ ok: true });
}
