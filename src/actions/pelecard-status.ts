"use server";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { getTransaction } from "@/lib/pelecard/client";
import { pelecardConfigured } from "@/lib/pelecard/config";
import { logAudit } from "@/lib/audit";
import { readPelecardStatus, type PelecardStatus } from "@/lib/pelecard/transaction-status";

/**
 * "בדוק סטטוס בפלאקארד" — asks Pelecard what it holds for this order's
 * payment, and shows it. Read only.
 *
 * The owner asked for it on 19 November after PR-577373, a bit payment from
 * 9 November whose temporary approval nobody could date. GetTransaction is a
 * lookup: it charges, completes, cancels and releases nothing. Like the
 * reconcile action beside it, IT REPORTS AND IT DOES NOT SETTLE — the answer
 * is shown to a person and nothing in our records changes because of it.
 *
 * Admin only: it uses the shop's Pelecard credentials, and what comes back is
 * a customer's transaction.
 */

export type StatusResult = { ok: true; status: PelecardStatus } | { ok: false; error: string };

export async function checkPelecardStatusAction(orderNumber: string): Promise<StatusResult> {
  const session = await requireAdmin();
  if (!pelecardConfigured()) return { ok: false, error: "הסליקה אינה מוגדרת" };

  const order = await db.order.findUnique({
    where: { orderNumber },
    select: {
      id: true,
      payments: {
        where: { provider: "PELECARD", pelecardTransactionId: { not: null } },
        orderBy: { createdAt: "desc" },
        select: { pelecardTransactionId: true, status: true },
      },
    },
  });
  if (!order) return { ok: false, error: `הזמנה ${orderNumber} לא נמצאה` };

  const payment =
    order.payments.find((p) => p.status === "AUTHORIZED" || p.status === "CAPTURED") ?? order.payments[0];
  if (!payment?.pelecardTransactionId) {
    return { ok: false, error: "אין להזמנה הזאת מספר עסקה בפלאקארד לבדוק לפיו" };
  }

  try {
    const answer = await getTransaction(payment.pelecardTransactionId);
    await logAudit({
      actorId: session.sub,
      action: "PELECARD_STATUS_CHECKED",
      entityType: "Order",
      entityId: order.id,
      metadata: { transactionId: payment.pelecardTransactionId },
    });
    return { ok: true, status: readPelecardStatus(answer) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "פלאקארד לא ענו" };
  }
}
