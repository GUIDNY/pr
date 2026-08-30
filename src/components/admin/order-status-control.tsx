"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { OrderStatusSelect } from "@/components/admin/order-status-select";
import { updateOrderStatusAction } from "@/actions/admin-orders";
import { NEXT_ORDER_STATUS, ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/enums";

/**
 * The status card on the order page. An order spends almost all of its life
 * moving one step forward along the same path, so that step is a button and
 * needs no dropdown at all; the dropdown stays for the exceptions, and applies
 * the moment you pick.
 *
 * The note is optional and belongs to whichever change follows it — it is
 * written into the status history entry, which is where anyone asking "why is
 * this order sitting here" will look.
 */
export function OrderStatusControl({
  orderId,
  currentStatus,
}: {
  orderId: string;
  currentStatus: OrderStatus;
}) {
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const next = NEXT_ORDER_STATUS[currentStatus];

  function advance() {
    if (!next) return;
    startTransition(async () => {
      const result = await updateOrderStatusAction(orderId, next, note.trim() || undefined);
      if (!result.success) {
        toast.error(result.error ?? "שגיאה בעדכון הסטטוס");
        return;
      }
      toast.success(`הסטטוס עודכן ל"${ORDER_STATUS_LABELS[next]}"`);
      setNote("");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {next && (
        <Button variant="brand" size="lg" onClick={advance} disabled={isPending} className="w-full justify-between">
          <span>{isPending ? "מעדכן..." : `העברה ל${ORDER_STATUS_LABELS[next]}`}</span>
          <ArrowLeft className="size-4" />
        </Button>
      )}

      <div>
        <p className="text-muted-foreground mb-1.5 text-xs">שינוי לסטטוס אחר</p>
        <OrderStatusSelect orderId={orderId} currentStatus={currentStatus} note={note} onDone={() => setNote("")} />
      </div>

      <div>
        <label htmlFor="status-note" className="text-muted-foreground mb-1.5 block text-xs">
          הערה שתירשם עם השינוי (אופציונלי)
        </label>
        <Textarea
          id="status-note"
          placeholder="למשל: הלקוח ביקש לדחות את המשלוח לשבוע הבא"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="text-sm"
        />
      </div>
    </div>
  );
}
