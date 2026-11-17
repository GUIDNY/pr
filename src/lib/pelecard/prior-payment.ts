import "server-only";
import { db } from "@/lib/db";
import { validateByUniqueKey } from "./client";
import { PRIOR_WINDOW_MS, combine, readValidation, verdictFor, type PriorVerdict } from "./prior-payment-rules";

export type PriorCheck =
  | { verdict: "ALLOW" }
  | { verdict: "WAIT" }
  | { verdict: "PAID"; orderNumber: string };

/**
 * Before a new card form opens for `order`: is an earlier form — on this order
 * or another order from the same visit, opened in the last 15 minutes and
 * still PENDING here — possibly paid already? See prior-payment-rules.ts.
 *
 * Read-only towards Pelecard (ValidateByUniqueKey) and towards our records:
 * it settles nothing. A paid form is settled by its own callback, which is
 * the one path that records the transaction; this only refuses to open a
 * second form in the meantime. Never throws — a failed check reads as WAIT,
 * the safe answer for money.
 */
export async function checkPriorPayments(order: {
  id: string;
  visitSid: string | null;
}, now: Date = new Date()): Promise<PriorCheck> {
  try {
    const priors = await db.payment.findMany({
      where: {
        provider: "PELECARD",
        status: "PENDING",
        createdAt: { gte: new Date(now.getTime() - PRIOR_WINDOW_MS) },
        confirmationKey: { not: null },
        amountAgorot: { not: null },
        order: {
          paymentStatus: "PENDING",
          OR: [{ id: order.id }, ...(order.visitSid ? [{ visitSid: order.visitSid }] : [])],
        },
      },
      select: {
        createdAt: true,
        confirmationKey: true,
        amountAgorot: true,
        order: { select: { id: true, orderNumber: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    if (priors.length === 0) return { verdict: "ALLOW" };

    /* Which of those forms the customer actually typed in. */
    const touches = await db.visitEvent.findMany({
      where: {
        type: "payment_form_touch",
        createdAt: { gte: new Date(now.getTime() - PRIOR_WINDOW_MS) },
        OR: priors.map((p) => ({ meta: { path: ["orderNumber"], equals: p.order.orderNumber } })),
      },
      select: { meta: true },
    });
    const touched = new Set(touches.map((t) => (t.meta as { orderNumber?: string } | null)?.orderNumber).filter(Boolean));

    /* In parallel, so a slow Pelecard holds checkout for one call's timeout,
       not one per earlier form. */
    const verdicts: { verdict: PriorVerdict; orderNumber: string }[] = await Promise.all(
      priors.map(async (p) => {
        let answer: ReturnType<typeof readValidation> | null = null;
        try {
          answer = readValidation(
            await validateByUniqueKey({
              ConfirmationKey: p.confirmationKey!,
              UniqueKey: p.order.id,
              TotalX100: String(p.amountAgorot),
            }),
          );
        } catch (error) {
          console.error("[pelecard] prior-form check threw", { orderNumber: p.order.orderNumber, error });
        }
        return {
          verdict: verdictFor(answer, p.createdAt, now, touched.has(p.order.orderNumber)),
          orderNumber: p.order.orderNumber,
        };
      }),
    );

    const overall = combine(verdicts.map((v) => v.verdict));
    console.info("[pelecard] prior-form check", { orderId: order.id, overall, verdicts });
    if (overall === "PAID") {
      return { verdict: "PAID", orderNumber: verdicts.find((v) => v.verdict === "PAID")!.orderNumber };
    }
    return { verdict: overall };
  } catch (error) {
    console.error("[pelecard] prior-form check failed", { orderId: order.id, error });
    return { verdict: "WAIT" };
  }
}
