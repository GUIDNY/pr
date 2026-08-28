"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Phone, Mail, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitSupportRequestAction } from "@/actions/support";

export default function ContactPage() {
  const [form, setForm] = useState({ name: "", phone: "", email: "", message: "" });
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await submitSupportRequestAction({
        name: form.name,
        phone: form.phone,
        channel: "FORM",
        message: form.message,
      });
      if (result.success) {
        setSent(true);
        toast.success("הפנייה נשלחה, ניצור קשר בהקדם");
      } else {
        toast.error(result.error ?? "שגיאה בשליחה");
      }
    });
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="mb-8 text-3xl font-bold">צור קשר</h1>

      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <span className="bg-brand/10 text-brand flex size-10 items-center justify-center rounded-full">
              <Phone className="size-4" />
            </span>
            <div>
              <p className="font-medium">טלפון</p>
              <a href="tel:04-6639510" className="text-muted-foreground text-sm hover:underline">04-6639510</a>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="bg-brand/10 text-brand flex size-10 items-center justify-center rounded-full">
              <Mail className="size-4" />
            </span>
            <div>
              <p className="font-medium">אימייל</p>
              <p className="text-muted-foreground text-sm">service@prec.co.il</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="bg-brand/10 text-brand flex size-10 items-center justify-center rounded-full">
              <MapPin className="size-4" />
            </span>
            <div>
              <p className="font-medium">סניפים</p>
              <p className="text-muted-foreground text-sm">לרשימת הסניפים המלאה בעמוד הסניפים</p>
            </div>
          </div>
        </div>

        {sent ? (
          <div className="border-success/30 bg-success/5 rounded-xl border p-6 text-center">
            <p className="text-success font-semibold">תודה על פנייתכם!</p>
            <p className="text-muted-foreground mt-1 text-sm">ניצור איתכם קשר בהקדם האפשרי.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <div>
              <Label className="mb-1.5">שם מלא</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
            </div>
            <div>
              <Label className="mb-1.5">טלפון</Label>
              <Input type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} required />
            </div>
            <div>
              <Label className="mb-1.5">אימייל</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <Label className="mb-1.5">הודעה</Label>
              <Textarea rows={4} value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} />
            </div>
            <Button type="submit" variant="brand" disabled={isPending}>
              {isPending ? "שולח..." : "שליחת פנייה"}
            </Button>
            <p className="text-muted-foreground text-xs leading-relaxed">
              הפרטים שתמסרו ישמשו למענה על פנייתכם בלבד. מסירתם אינה חובה חוקית והיא נעשית מרצונכם, בהתאם ל
              <Link href="/privacy" className="hover:text-foreground underline">
                מדיניות הפרטיות
              </Link>
              .
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
