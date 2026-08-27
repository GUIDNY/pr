"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Truck, ShieldCheck, Clock, StickyNote, Users, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateChatbotSettingsAction } from "@/actions/admin-chatbot";

type Settings = {
  shippingInfo: string;
  warrantyInfo: string;
  serviceHours: string | null;
  additionalNotes: string | null;
  updatedAt: Date;
};

export function ChatbotSettingsForm({ initial }: { initial: Settings }) {
  const [form, setForm] = useState({
    shippingInfo: initial.shippingInfo,
    warrantyInfo: initial.warrantyInfo,
    serviceHours: initial.serviceHours ?? "",
    additionalNotes: initial.additionalNotes ?? "",
  });
  const [isPending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await updateChatbotSettingsAction(form);
      if (!result.success) {
        toast.error(result.error ?? "שגיאה בשמירה");
        return;
      }
      toast.success("העדכון נשמר — אלפרד יענה לפי הנתונים החדשים מיד");
    });
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="border-border bg-card flex flex-col gap-5 rounded-2xl border p-5">
        <div className="flex items-start gap-3">
          <span className="bg-brand/10 text-brand flex size-10 shrink-0 items-center justify-center rounded-lg">
            <Truck className="size-5" />
          </span>
          <div className="flex-1">
            <Label htmlFor="shippingInfo">מדיניות משלוח</Label>
            <p className="text-muted-foreground mb-2 text-xs">מה אלפרד יגיד ללקוח כששואלים על זמן/עלות משלוח.</p>
            <Textarea
              id="shippingInfo"
              value={form.shippingInfo}
              onChange={(e) => setForm((f) => ({ ...f, shippingInfo: e.target.value }))}
              rows={2}
            />
          </div>
        </div>

        <div className="flex items-start gap-3">
          <span className="bg-brand/10 text-brand flex size-10 shrink-0 items-center justify-center rounded-lg">
            <ShieldCheck className="size-5" />
          </span>
          <div className="flex-1">
            <Label htmlFor="warrantyInfo">מדיניות אחריות</Label>
            <p className="text-muted-foreground mb-2 text-xs">מה אלפרד יגיד כששואלים על אחריות.</p>
            <Textarea
              id="warrantyInfo"
              value={form.warrantyInfo}
              onChange={(e) => setForm((f) => ({ ...f, warrantyInfo: e.target.value }))}
              rows={2}
            />
          </div>
        </div>

        <div className="flex items-start gap-3">
          <span className="bg-brand/10 text-brand flex size-10 shrink-0 items-center justify-center rounded-lg">
            <Clock className="size-5" />
          </span>
          <div className="flex-1">
            <Label htmlFor="serviceHours">שעות שירות</Label>
            <p className="text-muted-foreground mb-2 text-xs">אופציונלי — אם ריק, אלפרד לא יזכיר שעות ספציפיות.</p>
            <Input
              id="serviceHours"
              value={form.serviceHours}
              onChange={(e) => setForm((f) => ({ ...f, serviceHours: e.target.value }))}
              placeholder="לדוגמה: א׳-ה׳ 9:00-18:00, שישי 9:00-13:00"
              dir="rtl"
            />
          </div>
        </div>

        <div className="flex items-start gap-3">
          <span className="bg-brand/10 text-brand flex size-10 shrink-0 items-center justify-center rounded-lg">
            <StickyNote className="size-5" />
          </span>
          <div className="flex-1">
            <Label htmlFor="additionalNotes">הערות נוספות</Label>
            <p className="text-muted-foreground mb-2 text-xs">
              כל עובדה נוספת שחשוב שאלפרד ידע (מבצע זמני, סניף שנסגר, מדיניות החזרות...) — טקסט חופשי.
            </p>
            <Textarea
              id="additionalNotes"
              value={form.additionalNotes}
              onChange={(e) => setForm((f) => ({ ...f, additionalNotes: e.target.value }))}
              rows={3}
              placeholder="ריק כברירת מחדל"
            />
          </div>
        </div>

        <Button onClick={save} disabled={isPending} className="w-fit gap-1.5 self-end">
          <Save className="size-4" />
          {isPending ? "שומר..." : "שמור שינויים"}
        </Button>
      </div>

      <div className="border-border bg-muted/40 text-muted-foreground flex items-start gap-3 rounded-2xl border border-dashed p-5 text-sm">
        <Users className="mt-0.5 size-5 shrink-0" />
        <div>
          <p className="text-foreground font-semibold">השתלטות אנושית על השיחה — בקרוב</p>
          <p className="mt-1 leading-relaxed">
            כאן יופיע בעתיד ממשק לצפות בשיחות פעילות ולהיכנס לענות ללקוח בעצמכם, במקום אלפרד, כשצריך יד אנושית. עדיין לא
            נבנה.
          </p>
        </div>
      </div>
    </div>
  );
}
