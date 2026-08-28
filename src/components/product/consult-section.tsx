"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { MessageCircle, Phone, PhoneCall } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { submitSupportRequestAction } from "@/actions/support";

export function ConsultSection({ productTitle }: { productTitle: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [isPending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);

  return (
    <div className="border-border bg-card rounded-xl border p-5">
      <p className="mb-1 font-semibold">צריכים עזרה בבחירה?</p>
      <p className="text-muted-foreground mb-4 text-sm">צוות המומחים שלנו ישמח לייעץ ללא עלות</p>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" asChild className="gap-1.5">
          <a href="tel:04-6639510">
            <PhoneCall className="size-4" /> 04-6639510
          </a>
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen((v) => !v)}>
          <MessageCircle className="size-4" /> בקשו שיחזרו אליי
        </Button>
      </div>

      {open && !sent && (
        <form
          className="mt-4 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const result = await submitSupportRequestAction({
                name,
                phone,
                channel: "CALLBACK",
                topic: productTitle,
              });
              if (result.success) {
                setSent(true);
                toast.success("קיבלנו! ניצור איתך קשר בקרוב");
              } else {
                toast.error(result.error ?? "שגיאה, נסו שוב");
              }
            });
          }}
        >
          {/* A placeholder is not a label: it disappears the moment the field
              has content and screen readers may never announce it (WCAG 3.3.2).
              The visible design stays as it was; only the accessible name is
              added. */}
          <Input
            placeholder="שם מלא"
            aria-label="שם מלא"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Input
            placeholder="טלפון"
            aria-label="טלפון"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
          <Button type="submit" variant="brand" size="sm" disabled={isPending} className="gap-1.5">
            <Phone className="size-4" />
            {isPending ? "שולח..." : "שלחו לי בקשה לחזרה"}
          </Button>
          <p className="text-muted-foreground text-xs leading-relaxed">
            הפרטים ישמשו ליצירת קשר בנוגע לפנייה זו בלבד. מסירתם אינה חובה חוקית.{" "}
            <Link href="/privacy" className="hover:text-foreground underline">
              מדיניות הפרטיות
            </Link>
          </p>
        </form>
      )}
      {sent && <p className="text-success mt-3 text-sm font-medium">תודה! ניצור קשר בהקדם</p>}
    </div>
  );
}
