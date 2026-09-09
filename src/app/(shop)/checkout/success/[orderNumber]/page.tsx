import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, MapPin, Package, Truck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrderTimeline } from "@/components/order/order-timeline";
import { getOrderByNumber, getLatestPaymentForOrder } from "@/lib/queries/orders";
import { getSession } from "@/lib/auth";
import { browserPlacedOrder } from "@/lib/order-receipts";
import { orderShippingAddress, formatShippingAddress } from "@/lib/order-address";
import { PaymentConfirmation } from "@/components/checkout/payment-confirmation";
import { MetaPurchase } from "@/components/analytics/meta-events";
import { formatPrice, formatDateTime } from "@/lib/format";
import type { OrderStatus, DeliveryMethod } from "@/lib/enums";
import { DELIVERY_METHOD_LABELS } from "@/lib/enums";
import { customerHasPaid } from "@/lib/order-signal";

export default async function CheckoutSuccessPage({ params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = await params;
  const order = await getOrderByNumber(orderNumber);
  if (!order) notFound();

  /* This page has to open for a customer who may have no account, the second
     their order exists, so it cannot demand a sign-in — and it was therefore
     showing any order to anyone who could name one. Order numbers are six
     digits, so "anyone who can name one" includes anyone willing to guess.

     Two things open it: the account that owns the order, or the browser that
     placed it (see order-receipts). Everyone else is sent to order tracking
     with the number filled in, where naming the email or the phone on the
     order is what opens it. Nothing is denied to the customer — only moved
     behind the check that already exists for exactly this question. */
  const session = await getSession();
  const isOwner = Boolean(order.userId && session?.sub === order.userId);
  if (!isOwner && !(await browserPlacedOrder(order.orderNumber))) {
    redirect(`/track-order?order=${order.orderNumber}`);
  }

  const shipping = orderShippingAddress(order);
  /* Signed in, this order is already in their account. A guest has nowhere to
     come back to — and we are holding the name, email and phone they just
     typed, so the invitation costs them one field. */
  const isGuest = !session;

  /* An order paid through the gateway is only confirmed by Pelecard's
     server-side callback, and that can land a second or two after the customer
     is redirected back here — so the page reports whatever the database
     currently says and lets the panel below poll until it settles. This page
     never writes a payment status. */
  const payment = order.paymentMethod === "PELECARD" ? await getLatestPaymentForOrder(order.id) : null;
  const awaitingGateway = order.paymentMethod === "PELECARD";

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      {/* Only a paid order is a purchase. A gateway order that has not been
          confirmed yet reports nothing here and waits for the callback that
          PaymentConfirmation is already polling for — see MetaPurchase. */}
      <MetaPurchase
        orderNumber={order.orderNumber}
        captured={!awaitingGateway || customerHasPaid(order.paymentStatus)}
        value={order.total}
        contents={order.items.map((i) => ({ id: i.skuSnap, quantity: i.quantity }))}
      />
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <CheckCircle2 className="text-success size-16" strokeWidth={1.5} />
        <h1 className="text-2xl font-bold">
          {awaitingGateway && !customerHasPaid(order.paymentStatus) ? "ההזמנה נשמרה" : "ההזמנה התקבלה בהצלחה!"}
        </h1>
        <p className="text-muted-foreground">
          מספר הזמנה <span className="text-foreground font-semibold">{order.orderNumber}</span> · בוצעה ב-{formatDateTime(order.createdAt)}
        </p>
      </div>

      {awaitingGateway && (
        <PaymentConfirmation
          orderNumber={order.orderNumber}
          initialStatus={order.paymentStatus}
          approvalNo={payment?.approvalNo ?? null}
          cardLast4={payment?.cardLast4 ?? null}
          clearerName={payment?.clearerName ?? null}
        />
      )}

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
        {/* Shown back to the customer while they are still on the page and can
            phone about a typo — and it is also the proof the address was
            recorded at all, which for a guest order it previously was not. */}
        {shipping && (
          <p className="text-muted-foreground mt-1 flex items-start gap-2 text-sm">
            <MapPin className="mt-0.5 size-4 shrink-0" /> {formatShippingAddress(shipping)}
          </p>
        )}
      </div>

      {/* A guest leaves this page with an order number and nothing else: no
          account, and nothing on the page that offers one. Their name, email
          and phone are already in the order, so the form on the other side of
          this link is one password. */}
      {isGuest && (
        <div className="border-brand/30 bg-brand/5 mb-6 rounded-xl border p-5">
          <h2 className="mb-1 flex items-center gap-2 font-semibold">
            <UserPlus className="text-brand size-4" /> לפתוח חשבון ולשמור את ההזמנה?
          </h2>
          <p className="text-muted-foreground mb-3 text-sm leading-relaxed">
            עם חשבון ההזמנה הזו תופיע באזור האישי יחד עם כל ההזמנות הבאות, בלי לחפש מספר הזמנה בכל פעם.
            הפרטים שמסרתם כבר כאן — נשאר רק לבחור סיסמה.
          </p>
          <Button variant="brand" asChild>
            <Link
              href={{
                pathname: "/register",
                query: {
                  name: order.guestName ?? "",
                  email: order.guestEmail ?? "",
                  phone: order.guestPhone ?? "",
                },
              }}
            >
              יצירת חשבון
            </Link>
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="brand" asChild className="flex-1">
          <Link href={`/track-order?order=${order.orderNumber}`}>מעקב אחר ההזמנה</Link>
        </Button>
        {!isGuest && (
          <Button variant="outline" asChild className="flex-1">
            <Link href="/account/orders">
              <Package className="size-4" /> ההזמנות שלי
            </Link>
          </Button>
        )}
        <Button variant="outline" asChild className="flex-1">
          <Link href="/">המשך בקניות</Link>
        </Button>
      </div>
    </div>
  );
}
