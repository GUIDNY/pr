"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { updateCartFollowUpAction } from "@/actions/admin-abandoned-carts";
import type { CartFollowUpStatus } from "@/lib/enums";

export function AbandonedCartActions({
  cartId,
  status,
}: {
  cartId: string;
  status: CartFollowUpStatus;
}) {
  const [isPending, startTransition] = useTransition();
  const [current, setCurrent] = useState(status);

  function set(next: CartFollowUpStatus) {
    startTransition(async () => {
      const result = await updateCartFollowUpAction(cartId, next);
      if (result.success) {
        setCurrent(next);
        toast.success(next === "NEW" ? "הוחזר לרשימת החדשים" : "עודכן");
      } else {
        toast.error(result.error ?? "שגיאה בעדכון");
      }
    });
  }

  if (current !== "NEW") {
    return (
      <Button variant="ghost" size="sm" disabled={isPending} onClick={() => set("NEW")} className="gap-1">
        <RotateCcw className="size-3.5" />
        החזרה לחדשים
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="sm" disabled={isPending} onClick={() => set("HANDLED")} className="gap-1">
        <Check className="size-3.5" />
        טופל
      </Button>
      <Button variant="ghost" size="sm" disabled={isPending} onClick={() => set("NOT_RELEVANT")} className="gap-1">
        <X className="size-3.5" />
        לא רלוונטי
      </Button>
    </div>
  );
}
