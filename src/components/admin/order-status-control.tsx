"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { updateOrderStatusAction } from "@/actions/admin-orders";
import { ORDER_STATUSES, ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/enums";

export function OrderStatusControl({ orderId, currentStatus }: { orderId: string; currentStatus: OrderStatus }) {
  const [status, setStatus] = useState<OrderStatus>(currentStatus);
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const dirty = status !== currentStatus;

  function apply() {
    startTransition(async () => {
      const result = await updateOrderStatusAction(orderId, status, note || undefined);
      if (!result.success) {
        toast.error(result.error ?? "שגיאה בעדכון סטטוס");
        return;
      }
      toast.success("הסטטוס עודכן");
      setNote("");
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Select value={status} onValueChange={(v) => setStatus(v as OrderStatus)}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ORDER_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {ORDER_STATUS_LABELS[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {dirty && (
        <>
          <Textarea
            placeholder="הערה לשינוי הסטטוס (אופציונלי)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="text-sm"
          />
          <Button variant="brand" size="sm" onClick={apply} disabled={isPending}>
            {isPending ? "מעדכן..." : `עדכן ל${ORDER_STATUS_LABELS[status]}`}
          </Button>
        </>
      )}
    </div>
  );
}
