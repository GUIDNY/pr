import Link from "next/link";
import { XCircle, Phone, MessageCircle, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { PELECARD_STATUS_MESSAGES, NO_RETRY_STATUS_CODES } from "@/lib/pelecard/client";
import { CallbackRequest } from "@/components/checkout/callback-request";
import { BUSINESS } from "@/lib/business";
import {
  gatewayErrorMessage,
  issuerRejected3DS,
  ISSUER_REJECTED_3DS_MESSAGE,
  paymentPageExpired,
  PAYMENT_PAGE_EXPIRED_MESSAGE,
} from "@/lib/pelecard/failure";

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
        select: { id: true, orderNumber: true, paymentStatus: true, guestPhone: true, user: { select: { phone: true } } },
      })
    : null;

  const payment = order
    ? await db.payment.findFirst({
        where: { orderId: order.id },
        orderBy: { createdAt: "desc" },
        select: { pelecardStatusCode: true, pelecardTransactionId: true, rawResponse: true },
      })
    : null;

  const statusCode = payment?.pelecardStatusCode ?? null;
  /* A 301 is either a lost answer or a form that expired untouched, and only
     the first is a reason to keep a customer from trying again — see
     lib/pelecard/failure.ts. */
  const expired = paymentPageExpired({
    statusCode,
    transactionId: payment?.pelecardTransactionId,
    errorMessage: gatewayErrorMessage(payment?.rawResponse),
  });
  /* A 650 the issuer rejected (not one the customer left unfinished) gets the
     decline wording and the "another card" button — see issuerRejected3DS. */
  const issuerRejected = statusCode === "650" && issuerRejected3DS(payment?.rawResponse);
  const message = expired
    ? PAYMENT_PAGE_EXPIRED_MESSAGE
    : issuerRejected
      ? ISSUER_REJECTED_3DS_MESSAGE
      : ((statusCode && PELECARD_STATUS_MESSAGES[statusCode]) ?? "התשלום לא הושלם. לא בוצע חיוב, וניתן לנסות שוב.");
  const allowRetry = expired || !statusCode || !NO_RETRY_STATUS_CODES.includes(statusCode);

  return (
    <div className="mx-auto max-w-lg px-4 pt-16 pb-44 lg:pb-16">
      <div className="flex flex-col items-center gap-3 text-center">
        <XCircle className="text-destructive size-14" strokeWidth={1.5} />
        <h1 className="text-2xl font-bold">התשלום לא הושלם</h1>
        {/* Only where it is true: after a timeout (301) a charge may have gone
            through, so that case says nothing of the kind. */}
        {allowRetry && (
          <p className="bg-muted w-full rounded-lg px-4 py-3 text-base font-semibold">לא בוצע חיוב.</p>
        )}
        <p className="text-muted-foreground text-sm leading-relaxed">{message}</p>
        {order && (
          <p className="text-muted-foreground text-sm">
            מספר הזמנה <span className="text-foreground font-semibold">{order.orderNumber}</span> — ההזמנה נשמרה
            וממתינה לתשלום.
          </p>
        )}
        {/* Said outright, because it is the thing a customer on this screen
            assumes is lost: the cart is only ever emptied once a payment is
            confirmed, so everything they chose is still in it. */}
        {allowRetry && (
          <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
            <ShoppingCart className="size-3.5" /> שמרנו לכם את העגלה — אין צורך לבחור את המוצרים מחדש.
          </p>
        )}
      </div>

      <div className="mt-8 flex flex-col gap-2 sm:flex-row">
        {allowRetry && (
          <Button variant="brand" asChild className="h-12 w-full shrink-0 text-base sm:w-auto sm:flex-1">
            <Link href="/checkout">נסו שוב, אפשר גם בביט</Link>
          </Button>
        )}
        <Button variant="outline" asChild className="h-12 w-full shrink-0 sm:w-auto sm:flex-1">
          <Link href={order ? `/track-order?order=${order.orderNumber}` : "/track-order"}>מעקב אחר ההזמנה</Link>
        </Button>
      </div>

      {order && (
        <div className="mt-3">
          <CallbackRequest
            order={order.orderNumber}
            needsPhone={!(order.guestPhone?.trim() || order.user?.phone?.trim())}
          />
        </div>
      )}

      {/* A person, not only a button. Someone whose bank just refused them
          wants to talk to someone, and WhatsApp is where this shop answers. */}
      <p className="text-muted-foreground mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm">
        <span className="flex items-center gap-1.5">
          <Phone className="size-3.5" />
          <a href={BUSINESS.phoneHref} className="text-brand hover:underline">
            {BUSINESS.phone}
          </a>
        </span>
        <span className="flex items-center gap-1.5">
          <MessageCircle className="size-3.5" />
          <a href={BUSINESS.whatsappHref} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
            וואטסאפ {BUSINESS.whatsapp}
          </a>
        </span>
      </p>
    </div>
  );
}
