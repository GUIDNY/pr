"use client";

import { useState, useTransition } from "react";
import { Truck, Store, Phone, AlertTriangle, Check, Loader2 } from "lucide-react";
import type { SellerOrder } from "@/lib/queries/seller-orders";
import { paymentSignal, SIGNAL_DOT, SIGNAL_CHIP } from "@/lib/order-signal";
import { ORDER_STATUS_LABELS } from "@/lib/enums";
import { formatPrice, formatDateTime } from "@/lib/format";
import { approveOrderAction, closeOrderAction } from "@/actions/seller-orders";

/**
 * One order, as one card, for someone whose job is to get it out of the door.
 *
 * The order of the card is the order of the questions actually asked, which
 * is not the order a database row is in:
 *
 *   Is it paid — the light, biggest thing on the card.
 *   Where is it going — delivery and the address, or collection.
 *   Is anything wrong — the problems, and nothing at all when there are none.
 *   What is in it.
 *
 * Everything the admin table carries and this does not — assignee, stale
 * timer, supplier, the status dropdown with thirteen values — is missing on
 * purpose. Thirteen statuses is a vocabulary for describing an order; a
 * salesperson needs two verbs, approve and close, and a dropdown of thirteen
 * is how the wrong one gets picked.
 */
export function SellerOrderCard({ order, closed }: { order: SellerOrder; closed: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const signal = paymentSignal(order.paymentStatus);

  const blocked = order.problems.some((p) => p.severity === "block");
  const canApprove = !closed && (order.paymentStatus === "AUTHORIZED" || order.paymentStatus === "CAPTURED");

  function run(action: () => Promise<{ success: boolean; error: string | null }>) {
    setError(null);
    start(async () => {
      const result = await action();
      if (!result.success) setError(result.error);
    });
  }

  return (
    <div className="border-border bg-background flex flex-col gap-3 rounded-2xl border p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-bold ${SIGNAL_CHIP[signal.colour]}`}>
          <span className={`size-2.5 rounded-full ${SIGNAL_DOT[signal.colour]}`} aria-hidden="true" />
          {signal.label}
        </span>
        <span className="text-base font-black">{order.orderNumber}</span>
        <span className="text-muted-foreground text-sm">{formatDateTime(order.createdAt)}</span>
        <span className="ms-auto text-lg font-black">{formatPrice(order.total)}</span>
      </div>

      <p className="text-muted-foreground text-sm">{signal.hint}</p>

      <div className="border-border grid gap-2 border-t pt-3 text-sm sm:grid-cols-2">
        <div>
          <span className="font-semibold">{order.customerName}</span>
          {order.customerPhone && (
            <a href={`tel:${order.customerPhone}`} className="text-brand mt-0.5 flex items-center gap-1.5">
              <Phone className="size-3.5" />
              {order.customerPhone}
            </a>
          )}
        </div>
        {/* Delivery or collection, said in words rather than shown as an icon
            alone: this is the single thing most often got wrong on a picking
            list, and an icon is something you learn, not something you read. */}
        <div className="flex items-start gap-2">
          {order.delivery.toCustomer ? (
            <Truck className="text-brand mt-0.5 size-4 shrink-0" />
          ) : (
            <Store className="text-brand mt-0.5 size-4 shrink-0" />
          )}
          <div>
            <div className="font-semibold">
              {order.delivery.toCustomer ? "משלוח עד הבית" : "איסוף עצמי מהחנות"}
              {order.delivery.toCustomer && order.delivery.fee === 0 && " · ללא חיוב"}
              {order.delivery.toCustomer && order.delivery.fee > 0 && ` · ${formatPrice(order.delivery.fee)}`}
            </div>
            {order.delivery.toCustomer && (
              <div className="text-muted-foreground">{order.delivery.address ?? "אין כתובת"}</div>
            )}
          </div>
        </div>
      </div>

      <div className="border-border border-t pt-3">
        <div className="text-muted-foreground mb-1.5 text-xs font-semibold">
          מצב ההזמנה: <span className="text-foreground">{ORDER_STATUS_LABELS[order.status]}</span>
        </div>
        <ul className="flex flex-col gap-1 text-sm">
          {order.items.map((item, i) => (
            <li key={i} className="flex items-baseline gap-2">
              <span className="font-semibold">{item.quantity}×</span>
              <span className="flex-1">{item.title}</span>
              <span className="text-muted-foreground shrink-0 text-xs">{item.sku}</span>
            </li>
          ))}
        </ul>
      </div>

      {order.problems.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {order.problems.map((problem, i) => (
            <li
              key={i}
              className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
                problem.severity === "block"
                  ? "bg-destructive/10 text-destructive"
                  : "bg-warning/10 text-warning-foreground"
              }`}
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {problem.text}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm font-medium">{error}</p>
      )}

      {!closed && (
        <div className="flex flex-wrap gap-2">
          {canApprove && order.status !== "PROCESSING" && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => approveOrderAction(order.orderNumber))}
              className="bg-brand text-brand-foreground hover:bg-brand-hover flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60"
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {order.paymentStatus === "AUTHORIZED" ? "אשר תשלום" : "אשר הזמנה"}
            </button>
          )}
          <button
            type="button"
            disabled={pending || blocked}
            onClick={() => run(() => closeOrderAction(order.orderNumber))}
            title={blocked ? "יש בעיה פתוחה בהזמנה" : undefined}
            className="border-border hover:bg-muted rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            סגור הזמנה
          </button>
        </div>
      )}
    </div>
  );
}
