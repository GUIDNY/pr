import Link from "next/link";
import Image from "next/image";
import { ShieldCheck, Lock, Phone, RotateCcw, SearchX } from "lucide-react";
import { db } from "@/lib/db";
import { openPelecardPayment } from "@/lib/pelecard/open-payment";
import { formatPrice } from "@/lib/format";
import { PaymentFrame } from "@/components/checkout/payment-frame";

export const metadata = { title: "תשלום מאובטח", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * The payment step, on our own page.
 *
 * Pelecard's hosted form is embedded rather than navigated to. The form itself
 * is still theirs and the card number still never touches our servers — that
 * does not change and must not — but everything around it is ours: the logo,
 * the order being paid for, the reassurances, the phone number. A customer who
 * presses "pay" and lands on a stranger's page has to decide all over again
 * whether these are the people they meant to buy from, and that decision is
 * where a checkout is abandoned.
 *
 * It also sidesteps the thing we cannot control: Pelecard ignore a CssURL that
 * their support has not whitelisted, so the form's own skin is not ours to
 * choose yet. The page around it always was.
 */
export default async function PayPage({ params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = await params;

  const order = await db.order.findUnique({
    where: { orderNumber },
    include: { items: { select: { id: true, titleSnap: true, quantity: true, priceSnap: true } } },
  });
  /* Deliberately not notFound(). By the time this runs the shop's shell has
     already begun streaming, so notFound() cannot set a status any more and
     Next falls back to client rendering with an error in the console — the
     customer gets a blank flash and we get a false alarm in the logs. And a
     bare 404 is the wrong answer anyway: whoever is here followed a payment
     link that no longer matches an order, and the useful reply is to say so and
     give them a phone number. The page is noindex either way. */
  if (!order) return <OrderNotFound orderNumber={orderNumber} />;

  // An order already paid for has no business opening a second payment, and
  // sending the customer back to the form would invite exactly that.
  if (order.paymentStatus === "CAPTURED") {
    return <Settled orderNumber={order.orderNumber} />;
  }

  const opened = await openPelecardPayment(order.id);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 flex flex-col items-center gap-2 text-center">
        <Image src="/brand/logo.png" alt="A&I Electronics" width={132} height={132} className="h-14 w-auto" priority />
        <h1 className="text-2xl font-bold">תשלום מאובטח</h1>
        <p className="text-muted-foreground text-sm">
          הזמנה <span className="text-foreground font-semibold">{order.orderNumber}</span>
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div className="order-2 lg:order-1">
          {opened.ok ? (
            <PaymentFrame src={opened.redirectUrl} />
          ) : (
            <FrameFailed reason={opened.error} orderNumber={order.orderNumber} />
          )}
        </div>

        <aside className="order-1 flex flex-col gap-4 lg:order-2">
          <section className="border-border bg-card rounded-xl border p-4">
            <h2 className="mb-3 font-semibold">מה משלמים עליו</h2>
            <ul className="divide-border flex flex-col divide-y text-sm">
              {order.items.map((item) => (
                <li key={item.id} className="flex justify-between gap-3 py-2">
                  <span className="text-muted-foreground">
                    {item.titleSnap}
                    {item.quantity > 1 && <span className="text-xs"> × {item.quantity}</span>}
                  </span>
                  <span className="tabular-nums whitespace-nowrap">
                    {formatPrice(item.priceSnap * item.quantity)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="border-border mt-3 flex items-baseline justify-between border-t pt-3">
              <span className="font-semibold">סה״כ לתשלום</span>
              <span className="text-brand text-2xl font-bold tabular-nums">{formatPrice(order.total)}</span>
            </div>
          </section>

          <section className="border-border bg-card text-muted-foreground flex flex-col gap-2.5 rounded-xl border p-4 text-sm">
            <p className="flex items-start gap-2">
              <Lock className="text-success mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                פרטי הכרטיס נמסרים ישירות לחברת הסליקה ו<strong>אינם עוברים דרך האתר שלנו</strong> ואינם נשמרים
                אצלנו.
              </span>
            </p>
            <p className="flex items-start gap-2">
              <ShieldCheck className="text-success mt-0.5 size-4 shrink-0" aria-hidden />
              <span>הסליקה מאובטחת בתקן PCI DSS ומוצפנת ב-SSL.</span>
            </p>
            <p className="flex items-start gap-2">
              <Phone className="text-brand mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                נתקעתם? <a href="tel:04-6639510" className="text-brand underline underline-offset-2">04-6639510</a>
              </span>
            </p>
          </section>

          <p className="text-muted-foreground text-center text-xs">
            <Link href="/privacy" className="underline underline-offset-2">מדיניות פרטיות</Link>
            {" · "}
            <Link href="/accessibility" className="underline underline-offset-2">הצהרת נגישות</Link>
          </p>
        </aside>
      </div>
    </div>
  );
}

function OrderNotFound({ orderNumber }: { orderNumber: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-20 text-center">
      <SearchX className="text-muted-foreground size-12" strokeWidth={1.5} />
      <h1 className="text-xl font-bold">לא מצאנו את ההזמנה הזו</h1>
      <p className="text-muted-foreground text-sm">
        מספר ההזמנה <span className="text-foreground font-mono">{orderNumber}</span> לא קיים אצלנו. ייתכן שהקישור
        ישן או שנפלה טעות בהעתקה. <strong>לא בוצע שום חיוב.</strong>
      </p>
      <div className="mt-1 flex flex-wrap justify-center gap-2">
        <Link href="/track-order" className="bg-brand text-brand-foreground rounded-lg px-4 py-2 text-sm font-medium">
          מעקב אחר הזמנה
        </Link>
        <a href="tel:04-6639510" className="border-border rounded-lg border px-4 py-2 text-sm font-medium">
          04-6639510
        </a>
      </div>
    </div>
  );
}

function Settled({ orderNumber }: { orderNumber: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-20 text-center">
      <ShieldCheck className="text-success size-12" strokeWidth={1.5} />
      <h1 className="text-xl font-bold">ההזמנה הזו כבר שולמה</h1>
      <p className="text-muted-foreground text-sm">אין צורך לשלם שוב.</p>
      <Link
        href={`/checkout/success/${encodeURIComponent(orderNumber)}`}
        className="bg-brand text-brand-foreground rounded-lg px-4 py-2 text-sm font-medium"
      >
        לפרטי ההזמנה
      </Link>
    </div>
  );
}

/* The gateway refused to open a payment. The order exists and is unpaid, so the
   honest thing is to say so and offer the one action that can help, rather than
   an empty box the customer will stare at. */
function FrameFailed({ reason, orderNumber }: { reason: string; orderNumber: string }) {
  return (
    <div className="border-destructive/30 bg-destructive/5 flex flex-col items-center gap-3 rounded-xl border p-8 text-center">
      <p className="font-semibold">לא הצלחנו לפתוח את דף התשלום</p>
      <p className="text-muted-foreground text-sm">
        ההזמנה {orderNumber} נשמרה ולא בוצע חיוב. אפשר לנסות שוב, או להתקשר ונסגור את זה בטלפון.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Link
          href={`/checkout/pay/${encodeURIComponent(orderNumber)}`}
          className="bg-brand text-brand-foreground flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium"
        >
          <RotateCcw className="size-4" aria-hidden />
          ניסיון נוסף
        </Link>
        <a href="tel:04-6639510" className="border-border rounded-lg border px-4 py-2 text-sm font-medium">
          04-6639510
        </a>
      </div>
      <p className="text-muted-foreground/70 font-mono text-[0.7rem]" dir="ltr">
        {reason}
      </p>
    </div>
  );
}
