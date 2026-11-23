"use client";

import { useActionState } from "react";
import { Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BUSINESS } from "@/lib/business";
import { requestCallbackAction, type CallbackState } from "@/actions/checkout-callback";

/**
 * The "a person will call you" button on the failure page. It is the most
 * visible thing on the page after the retry, because a payment that failed is
 * a customer who is still at the screen and wanted to buy, and the ones who
 * were recovered were recovered by a phone call.
 *
 * It asks for a phone only when the order has none, tells the shop (the order
 * gets a "ביקש חזרה" mark in the back office and the owner is mailed), and
 * promises nothing beyond the call: no discount, no price.
 */
export function CallbackRequest({
  order,
  needsPhone,
  phoneOpen,
}: {
  order: string;
  needsPhone: boolean;
  /** The phone line is staffed right now (lib/phone-hours). Decides what may be promised. */
  phoneOpen: boolean;
}) {
  const [state, action, pending] = useActionState<CallbackState, FormData>(requestCallbackAction, { status: "idle" });

  if (state.status === "done") {
    return (
      <div role="status" className="border-brand/40 bg-brand/5 rounded-xl border-2 px-4 py-4 text-center">
        <p className="font-bold">קיבלנו את הבקשה.</p>
        <p className="text-muted-foreground mt-1 text-sm">
          {phoneOpen ? "נציג יחזור אליך בטלפון." : "נחזור אליך בפתיחת שעות הפעילות."} שעות הפעילות: {BUSINESS.phoneHoursLabel}
        </p>
      </div>
    );
  }
  return (
    <form action={action} className="border-brand/40 bg-brand/5 flex flex-col gap-3 rounded-xl border-2 p-4">
      <input type="hidden" name="order" value={order} />
      {needsPhone && (
        <input
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          placeholder="מספר טלפון לחזרה"
          className="border-input bg-background h-11 w-full rounded-lg border px-3 text-base"
        />
      )}
      <Button
        type="submit"
        variant="brand"
        disabled={pending}
        className="h-auto min-h-14 w-full gap-2 py-3 text-base leading-snug font-bold whitespace-normal"
      >
        <Phone className="size-5 shrink-0" />
        {pending
          ? "שולח…"
          : phoneOpen
            ? "נציג יחזור אליך תוך דקות להשלמת ההזמנה בטלפון"
            : "נחזור אליך בפתיחת שעות הפעילות להשלמת ההזמנה"}
      </Button>
      <p className="text-muted-foreground text-center text-xs">שעות הפעילות: {BUSINESS.phoneHoursLabel}</p>
      {state.status === "error" && (
        <p role="alert" className="text-destructive text-center text-sm">
          {state.message}
        </p>
      )}
    </form>
  );
}
