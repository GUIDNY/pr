"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { requestCallbackAction, type CallbackState } from "@/actions/checkout-callback";

/** The "call me back" button on the failure page. Asks for a phone only when
    the order has none. */
export function CallbackRequest({ order, needsPhone }: { order: string; needsPhone: boolean }) {
  const [state, action, pending] = useActionState<CallbackState, FormData>(requestCallbackAction, { status: "idle" });

  if (state.status === "done") {
    return (
      <p role="status" className="bg-muted rounded-lg px-4 py-3 text-center text-sm">
        קיבלנו את הבקשה. נציג יחזור אליכם בשעות הפעילות.
      </p>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-2">
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
      <Button type="submit" variant="outline" disabled={pending} className="h-12 w-full">
        {pending ? "שולח…" : "רוצים שנחזור אליכם?"}
      </Button>
      {state.status === "error" && (
        <p role="alert" className="text-destructive text-center text-sm">
          {state.message}
        </p>
      )}
    </form>
  );
}
