"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { updateOrderStatusAction } from "@/actions/admin-orders";
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  DESTRUCTIVE_ORDER_STATUSES,
  type OrderStatus,
} from "@/lib/enums";
import { cn } from "@/lib/utils";

/**
 * Changing an order's status, in one gesture, from wherever the order is on
 * screen. It used to take three: open the order, pick from a dropdown, then
 * find and press a confirm button that only appeared once the dropdown had
 * changed — and picking without pressing left the dropdown showing a status
 * the order did not have, which reads exactly like a save that worked.
 *
 * Picking is the save now. What that costs is a mis-click, so the two changes
 * you cannot walk back from — cancelling and refunding — ask first, and every
 * change is written to the order's status history with the name of whoever
 * made it.
 */
export function OrderStatusSelect({
  orderId,
  currentStatus,
  note,
  onDone,
  className,
}: {
  orderId: string;
  currentStatus: OrderStatus;
  note?: string;
  onDone?: () => void;
  className?: string;
}) {
  const [status, setStatus] = useState<OrderStatus>(currentStatus);
  const [confirming, setConfirming] = useState<OrderStatus | null>(null);
  const [isPending, startTransition] = useTransition();

  function apply(next: OrderStatus) {
    const previous = status;
    setStatus(next);
    startTransition(async () => {
      const result = await updateOrderStatusAction(orderId, next, note?.trim() || undefined);
      if (!result.success) {
        setStatus(previous);
        toast.error(result.error ?? "שגיאה בעדכון הסטטוס");
        return;
      }
      toast.success(`הסטטוס עודכן ל"${ORDER_STATUS_LABELS[next]}"`);
      onDone?.();
    });
  }

  function pick(next: OrderStatus) {
    if (next === status) return;
    if (DESTRUCTIVE_ORDER_STATUSES.includes(next)) {
      setConfirming(next);
      return;
    }
    apply(next);
  }

  return (
    <>
      <Select value={status} onValueChange={(v) => pick(v as OrderStatus)} disabled={isPending}>
        <SelectTrigger className={cn("w-full", className)} aria-label="סטטוס ההזמנה">
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

      <Dialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirming ? `לשנות ל"${ORDER_STATUS_LABELS[confirming]}"?` : ""}</DialogTitle>
            <DialogDescription>
              הלקוח יראה את השינוי בעמוד מעקב ההזמנה. השינוי נרשם בהיסטוריית ההזמנה וניתן לשנות בחזרה, אך כדאי
              לוודא לפני.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirming(null)}>
              ביטול
            </Button>
            <Button
              variant="brand"
              size="sm"
              onClick={() => {
                const next = confirming;
                setConfirming(null);
                if (next) apply(next);
              }}
            >
              כן, לעדכן
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
