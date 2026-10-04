"use client";

import { useState, useTransition } from "react";
import { RotateCcw, Trash2, X } from "lucide-react";
import { SellerOrderRow } from "./seller-order-row";
import { purgeOrdersAction, restoreOrdersAction, trashOrdersAction } from "@/actions/seller-orders";
import type { SellerOrderSummary } from "@/lib/queries/seller-orders";
import { TRASH_STAGE, type OrderStage } from "@/lib/order-stage";

/**
 * The orders queue, with a checkbox in front of every row.
 *
 * Why selection lives here and not in the row: the row is a link, the whole
 * of it, because this list is worked through on a phone with one thumb. A
 * checkbox inside a link is a checkbox that navigates, so the box sits
 * beside the link as its sibling and the selection it belongs to is held by
 * the list.
 *
 * The bar only appears once something is selected. A permanent action that
 * is on screen all day is one that gets clicked by accident on the day
 * somebody is tired, and this one deletes orders.
 */
export function OrdersBulkList({
  orders,
  stage,
}: {
  orders: SellerOrderSummary[];
  stage: OrderStage;
}) {
  const inTrash = stage === TRASH_STAGE;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();

  /* An order that took real money is not selectable at all, rather than
     selectable and refused on submit. The server checks it again — this is
     the half that stops somebody selecting fifteen, pressing delete and
     being told no because of one of them. */
  const selectable = orders.filter((o) => o.canDelete);
  const allOn = selectable.length > 0 && selectable.every((o) => selected.has(o.orderNumber));

  function toggle(orderNumber: string) {
    setArmed(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(orderNumber)) next.delete(orderNumber);
      else next.add(orderNumber);
      return next;
    });
  }

  function toggleAll() {
    setArmed(false);
    setSelected(allOn ? new Set() : new Set(selectable.map((o) => o.orderNumber)));
  }

  function run(action: (numbers: string[]) => Promise<{ success: boolean; error: string | null }>) {
    const numbers = [...selected];
    setError(null);
    startTransition(async () => {
      const result = await action(numbers);
      if (!result.success) {
        setError(result.error);
        setArmed(false);
        return;
      }
      setSelected(new Set());
      setArmed(false);
    });
  }

  const count = selected.size;

  return (
    <div className="flex flex-col gap-2">
      {selectable.length > 0 && (
        <label className="text-muted-foreground flex w-fit cursor-pointer items-center gap-2 px-1 text-xs font-semibold">
          <input
            type="checkbox"
            checked={allOn}
            onChange={toggleAll}
            className="accent-brand size-4 cursor-pointer"
          />
          בחר הכול ({selectable.length})
        </label>
      )}

      {orders.map((order) => (
        <div key={order.id} className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={selected.has(order.orderNumber)}
            onChange={() => toggle(order.orderNumber)}
            disabled={!order.canDelete}
            aria-label={`בחר הזמנה ${order.orderNumber}`}
            title={
              order.canDelete
                ? undefined
                : "נגבה בהזמנה הזאת כסף אמיתי — אפשר לבטל אותה, לא למחוק"
            }
            className="accent-brand size-4 shrink-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-30"
          />
          <div className="min-w-0 flex-1">
            <SellerOrderRow order={order} />
          </div>
        </div>
      ))}

      {error && (
        <p className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm font-semibold">
          {error}
        </p>
      )}

      {count > 0 && (
        <div className="border-border bg-card sticky bottom-3 z-10 mt-2 flex flex-wrap items-center gap-2 rounded-xl border p-3 shadow-lg">
          <span className="text-sm font-black">נבחרו {count}</span>

          <button
            type="button"
            onClick={() => {
              setArmed(false);
              setSelected(new Set());
            }}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold"
          >
            <X className="size-3.5" /> בטל בחירה
          </button>

          <div className="flex-1" />

          {inTrash ? (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(restoreOrdersAction)}
                className="hover:bg-muted flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-40"
              >
                <RotateCcw className="size-4" /> שחזר
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => (armed ? run(purgeOrdersAction) : setArmed(true))}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold disabled:opacity-40"
              >
                <Trash2 className="size-4" />
                {armed ? `לחץ שוב — ${count} יימחקו ולא יחזרו` : `מחק ${count} לצמיתות`}
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(trashOrdersAction)}
              className="text-destructive hover:bg-destructive/10 flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold disabled:opacity-40"
            >
              <Trash2 className="size-4" /> העבר {count} לפח
            </button>
          )}
        </div>
      )}
    </div>
  );
}
