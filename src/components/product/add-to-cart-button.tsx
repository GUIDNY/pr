"use client";

import { useTransition } from "react";
import { ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { addToCartReported } from "@/lib/cart-client";
import { useCartStore } from "@/stores/cart-store";
import { reportAddedToMall } from "@/lib/mall";
import { cn } from "@/lib/utils";

export function AddToCartButton({
  productId,
  qty = 1,
  disabled,
  size = "default",
  className,
  label = "הוספה לעגלה",
  openDrawerOnAdd = true,
}: {
  productId: string;
  qty?: number;
  disabled?: boolean;
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  label?: string;
  openDrawerOnAdd?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const setCart = useCartStore((s) => s.setCart);
  const openDrawer = useCartStore((s) => s.openDrawer);

  return (
    <Button
      type="button"
      variant="brand"
      size={size}
      disabled={disabled || isPending}
      className={cn("gap-1.5", className)}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        startTransition(async () => {
          try {
            const summary = await addToCartReported(productId, qty);
            setCart(summary);
            // Only inside the 3D mall's frame — see lib/mall.ts.
            reportAddedToMall(summary, productId);
            if (openDrawerOnAdd) openDrawer();
            else toast.success("נוסף לעגלה");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "שגיאה בהוספה לעגלה");
          }
        });
      }}
    >
      <ShoppingCart className="size-4" />
      {size !== "icon" && label}
    </Button>
  );
}
