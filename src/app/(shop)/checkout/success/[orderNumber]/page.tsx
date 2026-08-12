import { notFound } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrderTimeline } from "@/components/order/order-timeline";
import { getOrderByNumber } from "@/lib/queries/orders";
import { formatPrice, formatDateTime } from "@/lib/format";
import type { OrderStatus, DeliveryMethod } from "@/lib/enums";
import { DELIVERY_METHOD_LABELS } from "@/lib/enums";

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
