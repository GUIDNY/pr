"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { waHref } from "@/lib/notify/whatsapp-link";

/**
 * "שלח וואטסאפ": shows the ready-made text in an editable box, and opens
 * wa.me with whatever is in it. The person presses send in their own
 * WhatsApp; the system sends nothing. Opening is recorded through `record`
 * (a note on the order, or the cart marked handled).
 */
export function WhatsappReminder({
  phone,
  initialText,
  optIn,
  record,
}: {
  phone: string;
  initialText: string;
  /** false = the customer did not agree to WhatsApp; null/true = no warning. */
  optIn: boolean | null;
  record: () => Promise<{ success: boolean; error: string | null }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(initialText);
  const [pending, startTransition] = useTransition();
  const href = waHref(phone, text);

  if (!href) return <span className="text-muted-foreground text-xs">מספר טלפון לא תקין לוואטסאפ</span>;

  function openWhatsapp() {
    /* Opened inside the click itself, before anything is awaited, or the
       browser takes it for a popup and blocks it. */
    window.open(href!, "_blank", "noopener,noreferrer");
    startTransition(async () => {
      const result = await record();
      if (!result.success) toast.error(result.error ?? "לא נרשם שההודעה נשלחה");
      else router.refresh();
    });
  }

  if (!open) {
    return (
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="h-12 w-full gap-2 bg-green-600 text-base text-white hover:bg-green-700 sm:w-auto"
      >
        <MessageCircle className="size-5" /> שלח וואטסאפ
      </Button>
    );
  }

  return (
    <div className="border-border flex w-full max-w-xl flex-col gap-2 rounded-xl border p-3">
      {optIn === false && (
        <p className="flex items-start gap-2 rounded-lg bg-yellow-100 px-3 py-2 text-sm text-yellow-900">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          הלקוח לא אישר וואטסאפ, עדיף להתקשר
        </p>
      )}
      <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={9} className="text-base" />
      <Button
        type="button"
        onClick={openWhatsapp}
        disabled={pending || !text.trim()}
        className="h-12 w-full gap-2 bg-green-600 text-base text-white hover:bg-green-700"
      >
        <MessageCircle className="size-5" /> פתח בוואטסאפ
      </Button>
      <button type="button" onClick={() => setOpen(false)} className="text-muted-foreground min-h-10 text-sm">
        סגירה
      </button>
    </div>
  );
}
