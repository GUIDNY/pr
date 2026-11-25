"use client";

import { useActionState, useState } from "react";
import { submitCancelRequestAction, type CancelState } from "@/actions/cancel-request";

const initial: CancelState = { status: "idle", message: "" };
const field = "border-input bg-background w-full rounded-md border px-3 py-2 text-sm";

export function CancelOrderForm() {
  const [state, action, pending] = useActionState(submitCancelRequestAction, initial);
  const [scope, setScope] = useState<"ALL" | "ITEM">("ALL");

  if (state.status === "done") {
    return <p className="rounded-md border border-green-600/30 bg-green-50 p-4 text-sm font-medium text-green-800">{state.message}</p>;
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm font-medium">
        שם מלא
        <input name="name" required maxLength={100} autoComplete="name" className={field} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        טלפון
        <input name="phone" type="tel" required maxLength={30} autoComplete="tel" dir="ltr" className={`${field} text-right`} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        מספר הזמנה
        <input name="order" required maxLength={40} dir="ltr" className={`${field} text-right`} />
      </label>
      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="mb-1 font-medium">מה מבטלים</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name="scope" value="ALL" checked={scope === "ALL"} onChange={() => setScope("ALL")} />
          את כל ההזמנה
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="scope" value="ITEM" checked={scope === "ITEM"} onChange={() => setScope("ITEM")} />
          מוצר מסוים
        </label>
        {scope === "ITEM" && (
          <input name="item" required maxLength={300} placeholder="איזה מוצר?" className={field} />
        )}
      </fieldset>
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
      {state.status === "error" && <p className="text-destructive text-sm">{state.message}</p>}
      <button type="submit" disabled={pending} className="bg-brand text-primary-foreground rounded-md px-4 py-2.5 text-sm font-semibold disabled:opacity-60">
        {pending ? "שולח..." : "שליחת בקשת ביטול"}
      </button>
    </form>
  );
}
