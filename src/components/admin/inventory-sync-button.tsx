"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { runManualSyncAction } from "@/actions/admin-inventory";

export function InventorySyncButton() {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    startTransition(async () => {
      const result = await runManualSyncAction();
      if (result.success) {
        if (result.status === "NO_CHANGES") {
          toast.info("לא נמצאו שינויים במקורות הפעילים");
        } else {
          const parts: string[] = [];
          if (result.productsAdded) parts.push(`${result.productsAdded} חדשים`);
          if (result.productsUpdated) parts.push(`${result.productsUpdated} עודכנו`);
          if (result.priceChanges) parts.push(`${result.priceChanges} שינויי מחיר`);
          if (result.productsMissing) parts.push(`${result.productsMissing} נעלמו`);
          toast.success(parts.length > 0 ? `הסנכרון הושלם: ${parts.join(", ")}` : "הסנכרון הושלם בהצלחה");
        }
      } else {
        toast.error(result.error ?? "הסנכרון נכשל");
      }
      router.refresh();
    });
  }

  return (
    <Button onClick={handleClick} disabled={isPending} variant="brand" className="gap-2">
      <RefreshCw className={isPending ? "size-4 animate-spin" : "size-4"} />
      {isPending ? "מסנכרן..." : "סנכרון מלאי עכשיו"}
    </Button>
  );
}
