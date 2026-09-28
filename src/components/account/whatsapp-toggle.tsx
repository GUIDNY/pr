"use client";

import { useState, useTransition } from "react";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { setWhatsappOptInAction } from "@/actions/auth";

/**
 * "Updates on WhatsApp" — the account-level switch.
 *
 * The same answer the customer gives beside the phone field at checkout, but
 * changeable afterwards: somebody who ticked it once and now wants only
 * email should not have to place another order to say so. Off here wins
 * over on at checkout, for orders already placed too — see the notifier.
 *
 * Optimistic: the switch moves at once and comes back only if the save
 * fails, because a setting that lags behind the finger reads as broken.
 */
export function WhatsappToggle({ initial, phone }: { initial: boolean; phone: string | null }) {
  const [enabled, setEnabled] = useState(initial);
  const [isPending, startTransition] = useTransition();

  function change(next: boolean) {
    const previous = enabled;
    setEnabled(next);
    startTransition(async () => {
      const result = await setWhatsappOptInAction(next);
      if (!result.success) {
        setEnabled(previous);
        toast.error(result.error ?? "השמירה נכשלה");
        return;
      }
      toast.success(next ? "עדכונים בוואטסאפ הופעלו" : "עדכונים בוואטסאפ בוטלו — נעדכן במייל בלבד");
    });
  }

  return (
    <div className="border-border flex items-center gap-3 rounded-xl border p-4">
      <span className="bg-success/15 text-success flex size-10 shrink-0 items-center justify-center rounded-full">
        <MessageCircle className="size-5" aria-hidden />
      </span>
      <label htmlFor="whatsapp-updates" className="min-w-0 flex-1 cursor-pointer">
        <span className="block text-sm font-semibold">עדכונים על הזמנות בוואטסאפ</span>
        <span className="text-muted-foreground block text-xs leading-snug">
          {enabled
            ? `אישור הזמנה, יציאה למשלוח ומסירה${phone ? ` למספר ${phone}` : ""}. במייל תמיד.`
            : "כבוי — העדכונים על ההזמנות מגיעים במייל בלבד."}
        </span>
      </label>
      <Switch
        id="whatsapp-updates"
        checked={enabled}
        onCheckedChange={change}
        disabled={isPending}
        aria-label="עדכונים על הזמנות בוואטסאפ"
      />
    </div>
  );
}
