"use client";

import { useState, useTransition, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarDays, PackageSearch, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OrderTimeline } from "@/components/order/order-timeline";
import { trackOrderAction } from "@/actions/orders";
import { formatPrice, formatDate, formatDateTime } from "@/lib/format";
import type { OrderStatus } from "@/lib/enums";

type TrackedOrder = NonNullable<Awaited<ReturnType<typeof trackOrderAction>>["order"]>;

function TrackOrderForm() {
  const searchParams = useSearchParams();
  const [orderNumber, setOrderNumber] = useState(searchParams.get("order") ?? "");
  const [contact, setContact] = useState("");
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await trackOrderAction(orderNumber, contact);
      if (!result.success) {
        setError(result.error);
        setOrder(null);
        return;
      }
      setOrder(result.order);
    });
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8 text-center">
        <PackageSearch className="text-brand mx-auto mb-3 size-12" strokeWidth={1.5} />
        <h1 className="text-2xl font-bold">מעקב אחר הזמנה</h1>
        <p className="text-muted-foreground mt-1 text-sm">הזינו את מספר ההזמנה ופרטי הקשר שהוזנו בעת הרכישה</p>
      </div>

      <form onSubmit={submit} className="border-border mb-8 flex flex-col gap-4 rounded-xl border p-5">
        <div>
          <Label className="mb-1.5">מספר הזמנה</Label>
          <Input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} placeholder="PR-100001" required />
        </div>
        <div>
          <Label className="mb-1.5">טלפון או אימייל</Label>
          <Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="050-1234567" required />
        </div>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <Button type="submit" variant="brand" disabled={isPending} className="gap-1.5">
          <Search className="size-4" />
          {isPending ? "מחפש..." : "בדיקת סטטוס"}
        </Button>
      </form>

      {order && (
        <div className="flex flex-col gap-6">
          <div className="border-border rounded-xl border p-5">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-semibold">הזמנה {order.orderNumber}</span>
              <span className="text-muted-foreground text-sm">{formatDateTime(order.createdAt)}</span>
            </div>
            <OrderTimeline status={order.status as OrderStatus} />
            {/* The date the shop set on the order. It was already being sent
                to this page and never shown, so "מתי זה מגיע" — the one
                question this page exists to answer — was a phone call. */}
            {order.expectedDeliveryAt && (
              <p className="border-brand/30 bg-brand/5 mt-4 flex items-center gap-2 rounded-lg border p-3 text-sm">
                <CalendarDays className="text-brand size-4 shrink-0" />
                <span>
                  מועד אספקה משוער: <strong>{formatDate(order.expectedDeliveryAt)}</strong>
                </span>
              </p>
            )}
          </div>

          <div className="border-border rounded-xl border p-5">
            <h2 className="mb-3 font-semibold">פריטים בהזמנה</h2>
            <ul className="divide-border divide-y">
              {order.items.map((item, i) => (
                <li key={i} className="flex justify-between py-2 text-sm">
                  <span>
                    {item.title} <span className="text-muted-foreground">× {item.quantity}</span>
                  </span>
                  <span className="tabular-nums">{formatPrice(item.price * item.quantity)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex justify-between border-t pt-3 font-bold">
              <span>סה&quot;כ</span>
              <span className="tabular-nums">{formatPrice(order.total)}</span>
            </div>
          </div>

          {order.notes.length > 0 && (
            <div className="border-border rounded-xl border p-5">
              <h2 className="mb-3 font-semibold">עדכונים</h2>
              <ul className="flex flex-col gap-2">
                {order.notes.map((n, i) => (
                  <li key={i} className="text-sm">
                    <span className="text-muted-foreground text-xs">{formatDateTime(n.createdAt)} — </span>
                    {n.body}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function TrackOrderPage() {
  return (
    <Suspense>
      <TrackOrderForm />
    </Suspense>
  );
}
