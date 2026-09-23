"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Search } from "lucide-react";
import { reconcileOrderAction, type ReconcileResult } from "@/actions/pelecard-reconcile";
import { formatPrice, formatDateTime } from "@/lib/format";

/**
 * The orders nobody heard back about, and a button that asks Pelecard.
 *
 * An order waits at PAYMENT_PENDING until their server-side callback settles
 * it. When that callback never arrives it waits for ever, and the shop is left
 * unable to answer the only question that matters — was the card charged? The
 * back office showed such an order as "awaiting payment", which is indis-
 * tinguishable from a customer who simply walked away, and that is how a paid
 * order goes unshipped.
 *
 * The answer comes back raw and a person reads it. Nothing here marks an order
 * paid: settling from a response shape nobody has seen yet is how you ship
 * goods against a payment that never happened, and this panel exists precisely
 * because guessing at the gateway's answers has already cost us once.
 */
export function PelecardReconcilePanel({
  orders,
}: {
  orders: { orderNumber: string; total: number; createdAt: Date; guestName: string | null }[];
}) {
  const [pending, startTransition] = useTransition();
  const [results, setResults] = useState<Record<string, ReconcileResult>>({});
  const [busy, setBusy] = useState<string | null>(null);

  function ask(orderNumber: string) {
    setBusy(orderNumber);
    startTransition(async () => {
      const result = await reconcileOrderAction(orderNumber);
      setResults((r) => ({ ...r, [orderNumber]: result }));
      setBusy(null);
    });
  }

  return (
    <div className="border-border bg-card rounded-xl border p-5">
      <h2 className="mb-1 flex items-center gap-2 font-semibold">
        <AlertTriangle className="size-4" aria-hidden />
        הזמנות שממתינות לתשובה מפלאקארד
      </h2>
      <p className="text-muted-foreground mb-4 text-sm">
        נוצרו, נשלחו לסליקה, ומעולם לא חזר עליהן אישור או דחייה. אי אפשר לדעת מהן לבד אם ירד כסף — הכפתור
        שואל את פלאקארד ישירות ומציג את התשובה כפי שהיא. שום דבר כאן לא מסמן הזמנה כמשולמת.
      </p>

      {orders.length === 0 ? (
        <p className="text-muted-foreground text-sm">אין הזמנות תקועות. זה המצב הרצוי.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {orders.map((o) => {
            const result = results[o.orderNumber];
            return (
              <li key={o.orderNumber} className="border-border/60 rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm">
                    <span className="font-semibold">{o.orderNumber}</span>
                    <span className="text-muted-foreground"> · {formatPrice(o.total)}</span>
                    {o.guestName && <span className="text-muted-foreground"> · {o.guestName}</span>}
                    <span className="text-muted-foreground"> · {formatDateTime(o.createdAt)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => ask(o.orderNumber)}
                    disabled={pending && busy === o.orderNumber}
                    className="border-border hover:bg-secondary flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-60"
                  >
                    <Search className="size-3.5" aria-hidden />
                    {pending && busy === o.orderNumber ? "שואל…" : "שאל את פלאקארד"}
                  </button>
                </div>

                {result && (
                  <pre
                    dir="ltr"
                    className="bg-muted mt-2 max-h-56 overflow-auto rounded-md p-2 text-start font-mono text-xs"
                  >
                    {result.ok ? JSON.stringify(result.answer, null, 2) : result.error}
                  </pre>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
