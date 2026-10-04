"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Phone } from "lucide-react";
import { OrderStatusSelect } from "./order-status-select";
import { OrdersBulkBar } from "./orders-bulk-bar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_COLORS,
  type OrderStatus,
  type PaymentStatus,
} from "@/lib/enums";
import { formatPrice, formatDateTime } from "@/lib/format";
import type { getAdminOrders } from "@/lib/queries/admin-orders";

type AdminOrderRow = Awaited<ReturnType<typeof getAdminOrders>>["orders"][number];

/** "לפני 3 שעות" / "לפני יומיים" — how long this order has been where it is. */
function ageLabel(hoursInStatus: number) {
  const hours = Math.floor(hoursInStatus);
  if (hours < 1) return "עכשיו";
  if (hours < 24) return `לפני ${hours} שעות`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "לפני יום";
  if (days === 2) return "לפני יומיים";
  return `לפני ${days} ימים`;
}

/**
 * The manager's orders table, with the same selection and the same bin as
 * the salesperson's list.
 *
 * A client component for one reason: the checkbox column needs state, and
 * the state belongs to the table rather than to each row — "select all" is
 * a question about the page, not about any one order. Everything the rows
 * render is already serialisable, and the status dropdown in the last
 * column was a client component before this.
 */
export function AdminOrdersTable({
  orders,
  bin,
}: {
  orders: AdminOrderRow[];
  bin: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

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

  return (
    <>
      <div className="border-border bg-card overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  checked={allOn}
                  disabled={selectable.length === 0}
                  onChange={() =>
                    setSelected(allOn ? new Set() : new Set(selectable.map((o) => o.orderNumber)))
                  }
                  aria-label="בחר את כל ההזמנות בעמוד"
                  className="accent-brand size-4 cursor-pointer disabled:opacity-30"
                />
              </TableHead>
              <TableHead>מספר הזמנה</TableHead>
              <TableHead>לקוח</TableHead>
              <TableHead>נפתחה</TableHead>
              <TableHead>עודכן</TableHead>
              <TableHead>פריטים</TableHead>
              <TableHead>תשלום</TableHead>
              <TableHead>סכום</TableHead>
              <TableHead>אחראי</TableHead>
              <TableHead className="min-w-[180px]">סטטוס</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-muted-foreground py-10 text-center">
                  {bin ? "הפח ריק" : "לא נמצאו הזמנות תואמות"}
                </TableCell>
              </TableRow>
            ) : (
              orders.map((order) => {
                const orderStatus = order.status as OrderStatus;
                const phone = order.user?.phone ?? order.guestPhone;
                const on = selected.has(order.orderNumber);

                return (
                  <TableRow key={order.id} className={on ? "bg-brand/5" : "hover:bg-muted/50"}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(order.orderNumber)}
                        disabled={!order.canDelete}
                        aria-label={`בחר הזמנה ${order.orderNumber}`}
                        title={
                          order.canDelete
                            ? undefined
                            : "נגבה בהזמנה הזאת כסף אמיתי — אפשר לבטל אותה, לא למחוק"
                        }
                        className="accent-brand size-4 cursor-pointer disabled:cursor-not-allowed disabled:opacity-30"
                      />
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/admin/orders/${order.orderNumber}`}
                        className="text-brand font-medium hover:underline"
                      >
                        {order.orderNumber}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div>{order.user?.name ?? order.guestName ?? "אורח"}</div>
                      {phone && (
                        <a
                          href={`tel:${phone}`}
                          className="text-muted-foreground hover:text-brand flex items-center gap-1 text-xs"
                        >
                          <Phone className="size-3" />
                          {phone}
                        </a>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                      {formatDateTime(order.createdAt)}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {order.isStale ? (
                        <span
                          className="text-destructive flex items-center gap-1 font-medium"
                          title={`ההזמנה לא זזה כבר ${Math.floor(order.hoursInStatus)} שעות`}
                        >
                          <AlertTriangle className="size-3.5" />
                          {ageLabel(order.hoursInStatus)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{ageLabel(order.hoursInStatus)}</span>
                      )}
                    </TableCell>
                    <TableCell>{order.items.length}</TableCell>
                    <TableCell>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          PAYMENT_STATUS_COLORS[order.paymentStatus as PaymentStatus]
                        }`}
                      >
                        {PAYMENT_STATUS_LABELS[order.paymentStatus as PaymentStatus] ?? order.paymentStatus}
                      </span>
                    </TableCell>
                    <TableCell className="font-semibold tabular-nums whitespace-nowrap">
                      {formatPrice(order.total)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {order.assignedTo?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      {/* Changed here, in the row. Working through a morning's
                          orders used to mean opening each one in turn. In the
                          bin there is nothing to move an order along to —
                          restore it first. */}
                      {bin ? (
                        <span className="text-muted-foreground text-xs">בפח</span>
                      ) : (
                        <OrderStatusSelect
                          orderId={order.id}
                          currentStatus={orderStatus}
                          className="h-8 text-xs"
                        />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <OrdersBulkBar
        selected={[...selected]}
        inTrash={bin}
        onClear={() => setSelected(new Set())}
        onDone={() => setSelected(new Set())}
      />
    </>
  );
}
