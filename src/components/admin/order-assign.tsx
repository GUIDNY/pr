"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { assignOrderAction } from "@/actions/admin-orders";

export function OrderAssign({
  orderId,
  currentAssigneeId,
  staff,
}: {
  orderId: string;
  currentAssigneeId: string | null;
  staff: { id: string; name: string }[];
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <Select
      value={currentAssigneeId ?? "NONE"}
      disabled={isPending}
      onValueChange={(v) =>
        startTransition(async () => {
          const result = await assignOrderAction(orderId, v === "NONE" ? null : v);
          if (result.success) toast.success("ההזמנה שויכה");
        })
      }
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder="שיוך לעובד" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="NONE">לא משויך</SelectItem>
        {staff.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
