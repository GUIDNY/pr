"use client";

import { Scale } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCompareStore, MAX_COMPARE } from "@/stores/compare-store";
import { cn } from "@/lib/utils";

export function CompareButton({ productId, className }: { productId: string; className?: string }) {
  const productIds = useCompareStore((s) => s.productIds);
  const toggle = useCompareStore((s) => s.toggle);
  const isSelected = productIds.includes(productId);

  return (
    <Button
      type="button"
      variant={isSelected ? "brand-outline" : "outline"}
      size="sm"
      className={cn("gap-1.5", className)}
      onClick={() => {
        if (!isSelected && productIds.length >= MAX_COMPARE) {
          toast.error(`ניתן להשוות עד ${MAX_COMPARE} מוצרים בו-זמנית`);
          return;
        }
        toggle(productId);
      }}
    >
      <Scale className="size-4" />
      {isSelected ? "הוסר מהשוואה" : "השוואה"}
    </Button>
  );
}
