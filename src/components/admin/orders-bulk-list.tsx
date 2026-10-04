"use client";

import { useState } from "react";
import { SellerOrderRow } from "./seller-order-row";
import { OrdersBulkBar } from "./orders-bulk-bar";
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

  /* An order that took real money is not selectable at all, rather than
     selectable and refused on submit. The server checks it again — this is
     the half that stops somebody selecting fifteen, pressing delete and
     being told no because of one of them. */
  const selectable = orders.filter((o) => o.canDelete);
  const allOn = selectable.length > 0 && selectable.every((o) => selected.has(o.orderNumber));

  function toggle(orderNumber: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(orderNumber)) next.delete(orderNumber);
      else next.add(orderNumber);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allOn ? new Set() : new Set(selectable.map((o) => o.orderNumber)));
  }

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

      <OrdersBulkBar
        selected={[...selected]}
        inTrash={inTrash}
        onClear={() => setSelected(new Set())}
        onDone={() => setSelected(new Set())}
      />
    </div>
  );
}
