"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { updateExpectedDeliveryAction } from "@/actions/admin-orders";

/**
 * The expected delivery date. The field and its action already existed and the
 * customer's own tracking page reads it — but nothing in the back office ever
 * set it, so every customer who asked "when is it coming" was told nothing,
 * and the shop had no record of what it had promised.
 */
export function OrderDeliveryDate({
  orderId,
  currentDate,
}: {
  orderId: string;
  currentDate: string | null;
}) {
  const [date, setDate] = useState(currentDate ?? "");
  const [isPending, startTransition] = useTransition();
  const dirty = date !== (currentDate ?? "");

  function save() {
    if (!date) return;
    startTransition(async () => {
      const result = await updateExpectedDeliveryAction(orderId, date);
      if (!result.success) {
        toast.error(result.error ?? "שגיאה בשמירת התאריך");
        return;
      }
      toast.success("תאריך האספקה נשמר והלקוח יראה אותו במעקב ההזמנה");
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <CalendarDays className="text-muted-foreground size-4 shrink-0" />
        <Input
          type="date"
          aria-label="תאריך אספקה משוער"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-9"
        />
      </div>
      {dirty && (
        <Button variant="brand" size="sm" onClick={save} disabled={isPending || !date}>
          {isPending ? "שומר..." : "שמירת תאריך"}
        </Button>
      )}
      <p className="text-muted-foreground text-xs">
        {currentDate ? "התאריך מוצג ללקוח בעמוד מעקב ההזמנה." : "לא נקבע תאריך — הלקוח לא רואה מועד אספקה."}
      </p>
    </div>
  );
}
