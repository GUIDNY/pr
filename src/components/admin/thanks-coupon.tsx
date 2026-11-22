"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bot, Gift, MessageCircle, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { createThanksCouponAction, recordThanksCouponSentAction, sendThanksCouponFromBotAction } from "@/actions/admin-thanks-coupon";
import { waHref } from "@/lib/notify/whatsapp-link";
import { firstNameOf, productPhrase } from "@/lib/notify/wa-reminder";
import { thanksText } from "@/lib/thanks-coupon";

const untilLabel = (iso: string) =>
  new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));

/**
 * "תודה + קופון": the coupon is made only when the owner presses the button,
 * then the message is shown for editing and opened in WhatsApp (nothing is
 * sent by the system). Opening it is noted on the order.
 */
export function ThanksCoupon({
  orderId,
  name,
  phone,
  optIn,
  titles,
  existingCode,
  alreadySent,
  botSent,
  botReady,
}: {
  orderId: string;
  name: string | null;
  phone: string;
  optIn: boolean | null;
  titles: string[];
  existingCode: string | null;
  alreadySent: boolean;
  botSent: boolean;
  botReady: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [coupon, setCoupon] = useState<{ code: string; endsAt: string } | null>(null);
  const [text, setText] = useState("");
  const href = coupon ? waHref(phone, text) : null;

  function make() {
    startTransition(async () => {
      const r = await createThanksCouponAction(orderId);
      if (!r.success) return void toast.error(r.error);
      setCoupon({ code: r.code, endsAt: r.endsAt });
      setText(thanksText(firstNameOf(name), productPhrase(titles), r.code, untilLabel(r.endsAt)));
    });
  }

  /* Marketing message: only to a customer who agreed to WhatsApp, and only
     once Meta has approved the template. */
  const botBlocked = botSent
    ? "כבר נשלח קופון מהבוט להזמנה הזאת"
    : !botReady
      ? "ממתין לאישור Meta"
      : optIn !== true
        ? "הלקוח לא אישר וואטסאפ"
        : null;

  function sendFromBot() {
    startTransition(async () => {
      const r = await sendThanksCouponFromBotAction(orderId);
      if (!r.success) return void toast.error(r.error);
      toast.success(`נשלח קופון ${r.code} מהבוט`);
      router.refresh();
    });
  }

  function openWhatsapp() {
    if (!coupon || !href) return;
    window.open(href, "_blank", "noopener,noreferrer");
    startTransition(async () => {
      const r = await recordThanksCouponSentAction(orderId, coupon.code);
      if (!r.success) toast.error(r.error ?? "לא נרשם שהקופון נשלח");
      else router.refresh();
    });
  }

  return (
    <div className="flex w-full max-w-xl flex-col gap-2">
      {(alreadySent || existingCode) && (
        <p className="flex items-start gap-2 rounded-lg bg-yellow-100 px-3 py-2 text-sm text-yellow-900">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          {alreadySent ? "כבר נשלח קופון להזמנה הזאת" : `כבר נוצר קופון להזמנה הזאת (${existingCode}), עדיין לא נרשם שנשלח`}
          . לחיצה לא תיצור קופון נוסף.
        </p>
      )}
      {optIn === false && (
        <p className="flex items-start gap-2 rounded-lg bg-yellow-100 px-3 py-2 text-sm text-yellow-900">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          הלקוח לא אישר וואטסאפ, עדיף להתקשר
        </p>
      )}
      <Button
        type="button"
        onClick={sendFromBot}
        disabled={pending || botBlocked !== null}
        className="h-12 w-full gap-2 bg-green-600 text-base text-white hover:bg-green-700 disabled:bg-muted disabled:text-muted-foreground sm:w-auto"
      >
        <Bot className="size-5" /> {pending ? "שולח…" : "שלח מהבוט"}
      </Button>
      {botBlocked && <p className="text-muted-foreground text-xs">{botBlocked}</p>}
      <p className="text-muted-foreground mt-1 text-xs">או ידנית, מהוואטסאפ שלך:</p>
      {!coupon ? (
        <Button
          type="button"
          onClick={make}
          disabled={pending}
          className="h-12 w-full gap-2 sm:w-auto"
          variant="outline"
        >
          <Gift className="size-5" /> {pending ? "יוצר…" : "צור קופון ושלח (ידני)"}
        </Button>
      ) : !href ? (
        <span className="text-muted-foreground text-xs">מספר טלפון לא תקין לוואטסאפ. הקופון {coupon.code} נוצר.</span>
      ) : (
        <>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} className="text-base" />
          <Button
            type="button"
            onClick={openWhatsapp}
            disabled={pending || !text.trim()}
            className="h-12 w-full gap-2 bg-green-600 text-base text-white hover:bg-green-700"
          >
            <MessageCircle className="size-5" /> פתח בוואטסאפ
          </Button>
        </>
      )}
    </div>
  );
}
