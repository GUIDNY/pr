import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { CheckCircle2, Truck, MapPin, PackageSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrderTimeline } from "@/components/order/order-timeline";
import { getOrderByNumber } from "@/lib/queries/orders";
import { formatPrice, formatDateTime } from "@/lib/format";
import type { OrderStatus, DeliveryMethod } from "@/lib/enums";
import { DELIVERY_METHOD_LABELS } from "@/lib/enums";

// The confirmation page inherited the site-wide title, so a customer who
// kept the tab open (the natural thing to do with a receipt) had nothing to
// tell it apart from the storefront. Name the order in the tab.
export async function generateMetadata({ params }: { params: Promise<{ orderNumber: string }> }): Promise<Metadata> {
  const { orderNumber } = await params;
  const order = await getOrderByNumber(orderNumber);
  return { title: order ? `אישור הזמנה ${order.orderNumber}` : "אישור הזמנה" };
}

export default async function CheckoutSuccessPage({ params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = await params;
  const order = await getOrderByNumber(orderNumber);
  if (!order) notFound();

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <CheckCircle2 className="text-success size-16" strokeWidth={1.5} />
        <h1 className="text-2xl font-bold">ההזמנה התקבלה בהצלחה!</h1>
        <p className="text-muted-foreground">
          מספר הזמנה <span className="text-foreground font-semibold">{order.orderNumber}</span> · בוצעה ב-{formatDateTime(order.createdAt)}
        </p>
      </div>

      <div className="border-border mb-6 rounded-xl border p-5">
        <OrderTimeline status={order.status as OrderStatus} />
      </div>

      <div className="border-border mb-6 rounded-xl border p-5">
        <h2 className="mb-3 font-semibold">פרטי הזמנה</h2>
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
        <div className="mt-3 flex justify-between border-t pt-3 text-base font-bold">
          <span>סה&quot;כ</span>
          <span className="tabular-nums">{formatPrice(order.total)}</span>
        </div>
        <p className="text-muted-foreground mt-3 flex items-center gap-2 text-sm">
          <Truck className="size-4" /> {DELIVERY_METHOD_LABELS[order.deliveryMethod as DeliveryMethod]}
        </p>
      </div>

      {/* The address the customer just typed, read back to them. A delivery
          address is the one field on the checkout form where a typo costs a
          real delivery, and the confirmation is the last moment they can
          still catch it. */}
      {order.address && (
        <div className="border-border mb-6 rounded-xl border p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold">
            <MapPin className="size-4" /> כתובת למשלוח
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {order.address.fullName}
            <br />
            {order.address.street} {order.address.houseNo}
            {order.address.apartment ? `, דירה ${order.address.apartment}` : ""}, {order.address.city}
            <br />
            {order.address.phone}
          </p>
        </div>
      )}

      {/* Order tracking asks for the order number plus the phone or email the
          order was placed under. Saying so here — with the exact details on
          file — is the difference between a customer who can look their own
          order up and one who calls the store to ask where it is. */}
      <div className="border-border bg-muted/40 mb-6 rounded-xl border p-5">
        <h2 className="mb-2 flex items-center gap-2 font-semibold">
          <PackageSearch className="size-4" /> איך עוקבים אחרי ההזמנה
        </h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          בעמוד מעקב ההזמנה הזינו את מספר ההזמנה{" "}
          <span className="text-foreground font-semibold">{order.orderNumber}</span>
          {order.guestPhone || order.guestEmail ? (
            <>
              {" "}
              יחד עם {order.guestPhone ? "הטלפון" : "האימייל"}{" "}
              <span className="text-foreground font-semibold" dir="ltr">
                {order.guestPhone ?? order.guestEmail}
              </span>
            </>
          ) : null}
          .
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="brand" asChild className="flex-1">
          <Link href={`/track-order?order=${order.orderNumber}`}>מעקב אחר ההזמנה</Link>
        </Button>
        <Button variant="outline" asChild className="flex-1">
          <Link href="/">המשך בקניות</Link>
        </Button>
      </div>
    </div>
  );
}
