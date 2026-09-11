import Link from "next/link";
import { Truck, Store, AlertTriangle, ChevronLeft } from "lucide-react";
import type { SellerOrderSummary } from "@/lib/queries/seller-orders";
import { paymentSignal, SIGNAL_DOT, SIGNAL_CHIP } from "@/lib/order-signal";
import { ORDER_STATUS_LABELS } from "@/lib/enums";
import { formatPrice, formatDateTime } from "@/lib/format";

/**
 * One order in a list, sized to be scanned rather than read.
 *
 * The whole row is the link. A row with a button in it is a row where the
 * 40 pixels around the button do nothing, and this list is worked through on
 * a phone with one thumb.
 *
 * Four things and no more: is it paid, who and where, what it is worth, and
 * whether anything is wrong. Everything else — the items, the history, the
 * payment record — is one tap away on the order's own page, which exists
 * precisely so this row does not have to carry it.
 */
export function SellerOrderRow({ order }: { order: SellerOrderSummary }) {
  const signal = paymentSignal(order.paymentStatus);
  const blockers = order.problems.filter((p) => p.severity === "block").length;

  return (
    <Link
      href={`/admin/orders/${order.orderNumber}`}
      className="border-border bg-background hover:border-brand/50 hover:bg-muted/30 flex items-center gap-3 rounded-xl border p-3 transition-colors"
    >
      <span
        className={`size-3 shrink-0 rounded-full ${SIGNAL_DOT[signal.colour]}`}
        aria-label={signal.label}
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-black">{order.orderNumber}</span>
          <span className="truncate font-medium">{order.customerName}</span>
          <span className="text-muted-foreground text-xs">{formatDateTime(order.createdAt)}</span>
        </div>
        <div className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
          {order.delivery.toCustomer ? (
            <span className="flex items-center gap-1">
              <Truck className="size-3.5" />
              {order.delivery.address ?? "אין כתובת"}
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <Store className="size-3.5" /> איסוף עצמי
            </span>
          )}
          <span>·</span>
          <span>{order.itemCount} פריטים</span>
          <span>·</span>
          <span>{ORDER_STATUS_LABELS[order.status]}</span>
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="font-black">{formatPrice(order.total)}</span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${SIGNAL_CHIP[signal.colour]}`}>
          {signal.label}
        </span>
      </div>

      {blockers > 0 && (
        <span
          className="bg-destructive/10 text-destructive flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-bold"
          title={order.problems.filter((p) => p.severity === "block").map((p) => p.text).join(" · ")}
        >
          <AlertTriangle className="size-3.5" />
          {blockers}
        </span>
      )}

      <ChevronLeft className="text-muted-foreground size-4 shrink-0" />
    </Link>
  );
}
