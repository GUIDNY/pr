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
          /* A manual run reads the sheets whatever their hash (see
             readsUnchangedSources in lib/inventory/sync.ts), so NO_CHANGES
             here no longer means "the same file" — it means no source could
             be read at all. Saying "no changes found" for that sent somebody
             looking for a price bug when the sync had not opened a file. */
          toast.warning("לא נקרא אף מחירון — אין מקור פעיל שניתן לפתוח. בדוק את מקורות הנתונים.");
        } else {
          const parts: string[] = [];
          if (result.productsAdded) parts.push(`${result.productsAdded} חדשים`);
          if (result.productsUpdated) parts.push(`${result.productsUpdated} עודכנו`);
          /* Both numbers, because they are different facts: how many prices
             the sheet disagreed with, and how many of those were taken. The
             rest are in the price tab with the reason they were not. */
          if (result.priceChanges) {
            parts.push(
              result.pricesAdopted === result.priceChanges
                ? `${result.priceChanges} מחירים עודכנו`
                : `${result.pricesAdopted} מחירים עודכנו מתוך ${result.priceChanges} פערים`,
            );
          }
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
