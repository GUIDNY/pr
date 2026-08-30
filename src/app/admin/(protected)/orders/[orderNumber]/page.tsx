import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight, MapPin, Package, Phone, Mail, Truck, CreditCard, User as UserIcon } from "lucide-react";
import { getAdminOrderDetail, getStaffUsers } from "@/lib/queries/admin-orders";
import { OrderStatusControl } from "@/components/admin/order-status-control";
import { OrderAssign } from "@/components/admin/order-assign";
import { OrderNotes } from "@/components/admin/order-notes";
import { OrderTimeline } from "@/components/order/order-timeline";
import { formatPrice, formatDateTime } from "@/lib/format";
import { OrderDeliveryDate } from "@/components/admin/order-delivery-date";
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_COLORS,
  DELIVERY_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_COLORS,
  type OrderStatus,
  type DeliveryMethod,
  type PaymentStatus,
} from "@/lib/enums";

export default async function AdminOrderDetailPage({ params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = await params;
  const [order, staff] = await Promise.all([getAdminOrderDetail(orderNumber), getStaffUsers()]);
  if (!order) notFound();

  const customerName = order.user?.name ?? order.guestName ?? "אורח";
  const customerPhone = order.user?.phone ?? order.guestPhone;
  const customerEmail = order.user?.email ?? order.guestEmail;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/orders" className="text-muted-foreground hover:text-foreground mb-2 flex items-center gap-1 text-sm">
          <ArrowRight className="size-4 rtl:rotate-180" /> חזרה להזמנות
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">הזמנה {order.orderNumber}</h1>
          <span className={`rounded-full px-3 py-1 text-sm font-medium ${ORDER_STATUS_COLORS[order.status as OrderStatus]}`}>
            {ORDER_STATUS_LABELS[order.status as OrderStatus]}
          </span>
        </div>
        <p className="text-muted-foreground mt-1 text-sm">נוצרה ב-{formatDateTime(order.createdAt)}</p>
      </div>

      <div className="border-border bg-card rounded-xl border p-5">
        <OrderTimeline status={order.status as OrderStatus} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <div className="border-border bg-card rounded-xl border p-5">
            <h2 className="mb-3 flex items-center gap-2 font-semibold">
              <Package className="size-4" /> פריטי הזמנה
            </h2>
            <ul className="divide-border divide-y">
              {order.items.map((item) => (
                <li key={item.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <Link href={`/product/${item.product.slug}`} target="_blank" className="font-medium hover:underline">
                      {item.titleSnap}
                    </Link>
                    <p className="text-muted-foreground text-xs">מק&quot;ט: {item.skuSnap} · כמות: {item.quantity}</p>
                  </div>
                  <span className="font-semibold tabular-nums">{formatPrice(item.priceSnap * item.quantity)}</span>
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
                  <span>הנחה {order.couponCode ? `(${order.couponCode})` : ""}</span>
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

          <div className="border-border bg-card rounded-xl border p-5">
            <h2 className="mb-3 font-semibold">הערות ותקשורת</h2>
            <OrderNotes
              orderId={order.id}
              initialNotes={order.notes.map((n) => ({
                id: n.id,
                body: n.body,
                isInternal: n.isInternal,
                createdAt: n.createdAt.toISOString(),
                authorName: n.author?.name ?? null,
              }))}
            />
          </div>

          <div className="border-border bg-card rounded-xl border p-5">
            <h2 className="mb-3 font-semibold">היסטוריית סטטוסים</h2>
            <ul className="divide-border divide-y">
              {order.statusHistory.map((h) => (
                <li key={h.id} className="py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{ORDER_STATUS_LABELS[h.toStatus as OrderStatus] ?? h.toStatus}</span>
                    <span className="text-muted-foreground text-xs">{formatDateTime(h.createdAt)}</span>
                  </div>
                  {h.note && <p className="text-muted-foreground mt-0.5 text-xs">{h.note}</p>}
                  {h.changedBy && <p className="text-muted-foreground text-xs">על ידי {h.changedBy.name}</p>}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="border-border bg-card rounded-xl border p-5">
            <h2 className="mb-3 font-semibold">עדכון סטטוס</h2>
            <OrderStatusControl orderId={order.id} currentStatus={order.status as OrderStatus} />
          </div>

          <div className="border-border bg-card rounded-xl border p-5">
            <h2 className="mb-3 font-semibold">שיוך עובד</h2>
            <OrderAssign orderId={order.id} currentAssigneeId={order.assignedToId} staff={staff} />
          </div>

          <div className="border-border bg-card rounded-xl border p-5">
            <h2 className="mb-3 flex items-center gap-2 font-semibold">
              <UserIcon className="size-4" /> פרטי לקוח
            </h2>
            <p className="text-sm font-medium">{customerName}</p>
            {/* Clickable, because the reason this panel is open is usually
                that someone is about to ring the customer. */}
            {customerPhone && (
              <div className="mt-1 flex items-center gap-2 text-sm">
                <a href={`tel:${customerPhone}`} className="text-brand flex items-center gap-1.5 hover:underline">
                  <Phone className="size-3.5" /> {customerPhone}
                </a>
                <a
                  href={`https://wa.me/972${customerPhone.replace(/\D/g, "").replace(/^0/, "")}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-success hover:underline"
                >
                  וואטסאפ
                </a>
              </div>
            )}
            {customerEmail && (
              <a
                href={`mailto:${customerEmail}`}
                className="text-muted-foreground hover:text-brand mt-1 flex items-center gap-1.5 text-sm"
              >
                <Mail className="size-3.5" /> {customerEmail}
              </a>
            )}
            {!order.user && <p className="text-muted-foreground mt-2 text-xs">הזמנת אורח</p>}
          </div>

          <div className="border-border bg-card rounded-xl border p-5">
            <h2 className="mb-3 flex items-center gap-2 font-semibold">
              <Truck className="size-4" /> משלוח
            </h2>
            <p className="text-sm">{DELIVERY_METHOD_LABELS[order.deliveryMethod as DeliveryMethod]}</p>
            {order.address && (
              <p className="text-muted-foreground mt-1 flex items-start gap-1.5 text-sm">
                <MapPin className="mt-0.5 size-3.5 shrink-0" />
                {order.address.city}, {order.address.street} {order.address.houseNo}
                {order.address.apartment ? `, דירה ${order.address.apartment}` : ""}
              </p>
            )}
            {order.customerNote && (
              <p className="border-warning/30 bg-warning/10 mt-2 rounded-lg border p-2 text-xs">
                <span className="font-medium">הערת הלקוח: </span>
                {order.customerNote}
              </p>
            )}
            <div className="mt-3 border-t pt-3">
              <p className="mb-2 text-sm font-medium">תאריך אספקה משוער</p>
              <OrderDeliveryDate
                orderId={order.id}
                currentDate={order.expectedDeliveryAt ? order.expectedDeliveryAt.toISOString().slice(0, 10) : null}
              />
            </div>
          </div>

          <div className="border-border bg-card rounded-xl border p-5">
            <h2 className="mb-3 flex items-center gap-2 font-semibold">
              <CreditCard className="size-4" /> תשלום
            </h2>
            <p className="text-sm">שיטה: {order.paymentMethod === "CASH_ON_DELIVERY" ? "מזומן באספקה" : "כרטיס אשראי"}</p>
            {/* Was printed raw, so the back office read "CAPTURED" on a
                Hebrew screen. */}
            <p className="mt-1 flex items-center gap-1.5 text-sm">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  PAYMENT_STATUS_COLORS[order.paymentStatus as PaymentStatus]
                }`}
              >
                {PAYMENT_STATUS_LABELS[order.paymentStatus as PaymentStatus] ?? order.paymentStatus}
              </span>
            </p>
            {order.payments.map((p) => (
              <p key={p.id} className="text-muted-foreground mt-1 text-xs">
                {p.reference} · {formatPrice(p.amount)} · {formatDateTime(p.createdAt)}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
