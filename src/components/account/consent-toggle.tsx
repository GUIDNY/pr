"use client";

import { useState, useTransition } from "react";
import { Megaphone, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { setMarketingOptInAction, setWhatsappOptInAction } from "@/actions/auth";

/**
 * One account-level yes/no, changeable after the fact.
 *
 * Two of these sit on the personal area: order updates on WhatsApp, and
 * consent to advertising. The first is a convenience (email goes anyway);
 * the second is the consent section 30א of the Communications Law asks for,
 * and this switch is the free, immediate way out it also asks for.
 *
 * Optimistic: the switch moves at once and comes back only if the save
 * fails, because a setting that lags behind the finger reads as broken.
 */
const KINDS = {
  whatsapp: {
    icon: MessageCircle,
    tone: "bg-success/15 text-success",
    title: "עדכונים על הזמנות בוואטסאפ",
    on: (phone: string | null) => `אישור הזמנה, יציאה למשלוח ומסירה${phone ? ` למספר ${phone}` : ""}. במייל תמיד.`,
    off: () => "כבוי — העדכונים על ההזמנות מגיעים במייל בלבד.",
    savedOn: "עדכונים בוואטסאפ הופעלו",
    savedOff: "עדכונים בוואטסאפ בוטלו — נעדכן במייל בלבד",
    action: setWhatsappOptInAction,
  },
  marketing: {
    icon: Megaphone,
    tone: "bg-brand/15 text-brand",
    title: "מבצעים ועדכונים שיווקיים",
    on: () => "במייל, ב‑SMS ובוואטסאפ. אפשר לכבות כאן בכל רגע.",
    off: () => "כבוי — לא נשלח דיוור שיווקי. עדכונים על הזמנות ממשיכים כרגיל.",
    savedOn: "תודה! נעדכן אותך על מבצעים",
    savedOff: "הדיוור השיווקי בוטל",
    action: setMarketingOptInAction,
  },
} as const;

export function ConsentToggle({
  kind,
  initial,
  phone = null,
}: {
  kind: keyof typeof KINDS;
  initial: boolean;
  phone?: string | null;
}) {
  const spec = KINDS[kind];
  const Icon = spec.icon;
  const [enabled, setEnabled] = useState(initial);
  const [isPending, startTransition] = useTransition();
  const id = `consent-${kind}`;

  function change(next: boolean) {
    const previous = enabled;
    setEnabled(next);
    startTransition(async () => {
      const result = await spec.action(next);
      if (!result.success) {
        setEnabled(previous);
        toast.error(result.error ?? "השמירה נכשלה");
        return;
      }
      toast.success(next ? spec.savedOn : spec.savedOff);
    });
  }

  return (
    <div className="border-border flex items-center gap-3 rounded-xl border p-4">
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${spec.tone}`}>
        <Icon className="size-5" aria-hidden />
      </span>
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
        <span className="block text-sm font-semibold">{spec.title}</span>
        <span className="text-muted-foreground block text-xs leading-snug">
          {enabled ? spec.on(phone) : spec.off()}
        </span>
      </label>
      <Switch id={id} checked={enabled} onCheckedChange={change} disabled={isPending} aria-label={spec.title} />
    </div>
  );
}
