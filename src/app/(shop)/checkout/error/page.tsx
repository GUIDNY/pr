import Link from "next/link";
import { XCircle, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { PELECARD_STATUS_MESSAGES, NO_RETRY_STATUS_CODES } from "@/lib/pelecard/client";

export const metadata = { title: "התשלום לא הושלם" };
export const dynamic = "force-dynamic";

/**
 * Where Pelecard sends a customer whose payment did not go through.
 *
 * The reason is read from our own payment record — written by the server-side
 * callback — and not from the query string, which the customer's browser
 * carries and can therefore say anything.
 *
 * The one case with no "try again" button is a timeout (301): there the charge
 * may well have gone through, and offering a retry is how somebody gets billed
 * twice for the same fridge.
 */
export default async function CheckoutErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order: orderNumber } = await searchParams;

  const order = orderNumber
    ? await db.order.findUnique({
        where: { orderNumber },
        select: { id: true, orderNumber: true, paymentStatus: true },
      })
    : null;

  const payment = order
    ? await db.payment.findFirst({
        where: { orderId: order.id },
        orderBy: { createdAt: "desc" },
        select: { pelecardStatusCode: true },
      })
    : null;

  const statusCode = payment?.pelecardStatusCode ?? null;
  const message =
    (statusCode && PELECARD_STATUS_MESSAGES[statusCode]) ??
    "התשלום לא הושלם. לא בוצע חיוב, וניתן לנסות שוב.";
  const allowRetry = !statusCode || !NO_RETRY_STATUS_CODES.includes(statusCode);

  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <div className="flex flex-col items-center gap-3 text-center">
        <XCircle className="text-destructive size-14" strokeWidth={1.5} />
        <h1 className="text-2xl font-bold">התשלום לא הושלם</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">{message}</p>
        {order && (
          <p className="text-muted-foreground text-sm">
            מספר הזמנה <span className="text-foreground font-semibold">{order.orderNumber}</span> — ההזמנה נשמרה
            וממתינה לתשלום.
          </p>
        )}
      </div>

      <div className="mt-8 flex flex-col gap-2 sm:flex-row">
        {allowRetry && (
          <Button variant="brand" asChild className="flex-1">
            <Link href="/checkout">ניסיון נוסף</Link>
          </Button>
        )}
        <Button variant="outline" asChild className="flex-1">
          <Link href={order ? `/track-order?order=${order.orderNumber}` : "/track-order"}>מעקב אחר ההזמנה</Link>
        </Button>
      </div>

      <p className="text-muted-foreground mt-6 flex items-center justify-center gap-1.5 text-sm">
        <Phone className="size-3.5" />
        לעזרה:{" "}
        <a href="tel:04-6639510" className="text-brand hover:underline">
          04-6639510
        </a>
      </p>
    </div>
  );
}
