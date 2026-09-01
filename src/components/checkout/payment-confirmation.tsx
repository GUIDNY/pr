"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCartStore } from "@/stores/cart-store";
import { clearPaidOrderCartAction } from "@/actions/orders";

/**
 * What the customer sees on top of the confirmation page after coming back
 * from the gateway.
 *
 * It reports the payment; it never decides it. The status is read from the
 * server, which learned it from Pelecard's own server-side callback — landing
 * on this page (which anyone can do by typing the address) changes nothing.
 *
 * The polling is here because that callback and the customer's browser race:
 * the redirect back is often a second or two ahead of the notification, and
 * without this the customer would be told their payment failed while it was
 * still being confirmed.
 */

const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 30_000;

type Status = "PENDING" | "CAPTURED" | "FAILED" | "TIMED_OUT" | string;

export function PaymentConfirmation({
  orderNumber,
  initialStatus,
  approvalNo,
  cardLast4,
  clearerName,
}: {
  orderNumber: string;
  initialStatus: Status;
  approvalNo: string | null;
  cardLast4: string | null;
  clearerName: string | null;
}) {
  const [status, setStatus] = useState<Status>(initialStatus);
  const setCart = useCartStore((s) => s.setCart);
  const cart = useCartStore((s) => s.cart);

  useEffect(() => {
    if (status !== "PENDING") return;
    const startedAt = Date.now();
    let cancelled = false;

    const timer = setInterval(async () => {
      if (cancelled) return;
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        clearInterval(timer);
        setStatus("TIMED_OUT");
        return;
      }
      try {
        const res = await fetch(`/api/pelecard/status?order=${encodeURIComponent(orderNumber)}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { paymentStatus?: string };
        if (data.paymentStatus && data.paymentStatus !== "PENDING") {
          clearInterval(timer);
          setStatus(data.paymentStatus);
        }
      } catch {
        // A failed poll is not a failed payment — keep waiting for the next one.
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [status, orderNumber]);

  // The cart is emptied only once the payment is confirmed, and the server
  // re-checks the order before doing it.
  useEffect(() => {
    if (status !== "CAPTURED") return;
    void clearPaidOrderCartAction(orderNumber).then((result) => {
      if (result.success) {
        setCart({
          ...cart,
          items: [],
          itemCount: 0,
          subtotal: 0,
          discount: 0,
          deliveryFee: 0,
          total: 0,
          couponCode: null,
        });
      }
    });
    // Runs once on the transition to paid; cart is read fresh inside.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, orderNumber]);

  if (status === "CAPTURED") {
    return (
      <div className="border-success/30 bg-success/5 mb-6 flex flex-col items-center gap-2 rounded-xl border p-5 text-center">
        <CheckCircle2 className="text-success size-10" strokeWidth={1.5} />
        <p className="text-success font-semibold">התשלום התקבל</p>
        <p className="text-muted-foreground text-sm">
          {approvalNo && <>מספר אישור {approvalNo}</>}
          {cardLast4 && <> · כרטיס המסתיים ב-{cardLast4}</>}
          {clearerName && <> · {clearerName}</>}
        </p>
      </div>
    );
  }

  if (status === "PENDING") {
    return (
      <div className="border-border bg-muted/40 mb-6 flex flex-col items-center gap-2 rounded-xl border p-5 text-center">
        <Loader2 className="text-brand size-8 animate-spin" />
        <p className="font-semibold">מאמתים את התשלום...</p>
        <p className="text-muted-foreground text-sm">זה לוקח כמה שניות. אין צורך לרענן את העמוד.</p>
      </div>
    );
  }

  if (status === "TIMED_OUT") {
    return (
      <div className="border-warning/40 bg-warning/10 mb-6 flex flex-col items-center gap-2 rounded-xl border p-5 text-center">
        <Loader2 className="text-warning-foreground size-8" />
        <p className="font-semibold">האימות מתעכב</p>
        <p className="text-muted-foreground text-sm">
          ההזמנה נשמרה ואנחנו ממתינים לאישור מחברת האשראי. <strong>אין לבצע תשלום נוסף.</strong> נעדכן אתכם, וניתן
          לבדוק בעמוד מעקב ההזמנה או ליצור קשר בטלפון 04-6639510.
        </p>
      </div>
    );
  }

  return (
    <div className="border-destructive/30 bg-destructive/5 mb-6 flex flex-col items-center gap-2 rounded-xl border p-5 text-center">
      <XCircle className="text-destructive size-10" strokeWidth={1.5} />
      <p className="text-destructive font-semibold">התשלום לא הושלם</p>
      <p className="text-muted-foreground text-sm">
        ההזמנה נשמרה אך טרם שולמה. אפשר לנסות שוב או ליצור איתנו קשר.
      </p>
      <div className="mt-2 flex gap-2">
        <Button variant="brand" size="sm" asChild>
          <Link href="/checkout">חזרה לתשלום</Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href="/contact">צרו קשר</Link>
        </Button>
      </div>
    </div>
  );
}
