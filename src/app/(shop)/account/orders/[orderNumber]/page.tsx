import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight, MapPin, Truck } from "lucide-react";
import { getSession } from "@/lib/auth";
import { getOrderByNumber } from "@/lib/queries/orders";
import { OrderTimeline } from "@/components/order/order-timeline";
import { formatPrice, formatDateTime } from "@/lib/format";
import { DELIVERY_METHOD_LABELS, type OrderStatus, type DeliveryMethod } from "@/lib/enums";

export default async function AccountOrderDetailPage({ params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = await params;
  const session = await getSession();
  if (!session) return null;

  const order = await getOrderByNumber(orderNumber);
  if (!order || order.userId !== session.sub) notFound();

  return (
    <div>
      <Link href="/account/orders" className="text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1 text-sm">
        <ArrowRight className="size-4 rtl:rotate-180" /> חזרה להזמנות
      </Link>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">הזמנה {order.orderNumber}</h1>
        <span className="text-muted-foreground text-sm">{formatDateTime(order.createdAt)}</span>
      </div>

      <div className="border-border mb-6 rounded-xl border p-5">
        <OrderTimeline status={order.status as OrderStatus} />
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="border-border rounded-xl border p-5">
          <h2 className="mb-3 font-semibold">פריטים</h2>
          <ul className="divide-border divide-y">
            {order.items.map((item) => (
              <li key={item.id} className="flex justify-between py-2 text-sm">
                <span>
                  {item.titleSnap} <span className="text-muted-foreground">× {item.quantity}</span>
                </span>
                <span className="tabular-nums">{formatPrice(item.priceSnap * item.quantity)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-col gap-1 border-t pt-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">סכום ביניים</span>
              <span className="tabular-nums">{formatPrice(order.subtotal)}</span>
            </div>
            {order.discountTotal > 0 && (
              <div className="text-success flex justify-between">
                <span>הנחה</span>
                <span className="tabular-nums">-{formatPrice(order.discountTotal)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">משלוח</span>
              <span className="tabular-nums">{order.deliveryFee === 0 ? "חינם" : formatPrice(order.deliveryFee)}</span>
            </div>
            <div className="flex justify-between text-base font-bold">
              <span>סה&quot;כ</span>
              <span className="tabular-nums">{formatPrice(order.total)}</span>
            </div>
          </div>
        </div>

        <div className="border-border rounded-xl border p-5">
          <h2 className="mb-3 font-semibold">פרטי משלוח</h2>
          <p className="mb-3 flex items-center gap-2 text-sm">
            <Truck className="size-4" /> {DELIVERY_METHOD_LABELS[order.deliveryMethod as DeliveryMethod]}
          </p>
          {order.address && (
            <p className="text-muted-foreground flex items-start gap-2 text-sm">
              <MapPin className="mt-0.5 size-4 shrink-0" />
              {order.address.city}, {order.address.street} {order.address.houseNo}
              {order.address.apartment ? `, דירה ${order.address.apartment}` : ""}
            </p>
          )}

          {order.notes.length > 0 && (
            <div className="mt-4 border-t pt-4">
              <h3 className="mb-2 text-sm font-semibold">עדכונים</h3>
              <ul className="flex flex-col gap-2">
                {order.notes.map((n) => (
                  <li key={n.id} className="text-sm">
                    <span className="text-muted-foreground text-xs">{formatDateTime(n.createdAt)} — </span>
                    {n.body}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
