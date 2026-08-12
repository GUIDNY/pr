"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, ShoppingCart, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { addToCartAction } from "@/actions/cart";
import { useCartStore } from "@/stores/cart-store";
import type { StockStatus } from "@/lib/enums";

export function PurchasePanel({
  productId,
  stockStatus,
  maxQuantity,
}: {
  productId: string;
  stockStatus: StockStatus;
  maxQuantity: number;
}) {
  const [qty, setQty] = useState(1);
  const [isPending, startTransition] = useTransition();
  const setCart = useCartStore((s) => s.setCart);
  const openDrawer = useCartStore((s) => s.openDrawer);
  const router = useRouter();
  const disabled = stockStatus === "OUT_OF_STOCK";

  function addToCart(then?: "drawer" | "checkout") {
    startTransition(async () => {
      try {
        const summary = await addToCartAction(productId, qty);
        setCart(summary);
        if (then === "checkout") router.push("/checkout");
        else openDrawer();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "שגיאה בהוספה לעגלה");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {!disabled && (
        <div className="border-input flex w-fit items-center rounded-lg border">
          <button
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            className="p-2.5 disabled:opacity-40"
            disabled={qty <= 1}
            aria-label="הפחת כמות"
          >
            <Minus className="size-4" />
          </button>
          <span className="w-10 text-center font-medium tabular-nums">{qty}</span>
          <button
            onClick={() => setQty((q) => Math.min(maxQuantity, q + 1))}
            className="p-2.5 disabled:opacity-40"
            disabled={qty >= maxQuantity}
            aria-label="הוסף כמות"
          >
            <Plus className="size-4" />
          </button>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant="brand"
          size="lg"
          disabled={disabled || isPending}
          onClick={() => addToCart("drawer")}
          className="h-12 flex-1 gap-2 text-base"
        >
          <ShoppingCart className="size-5" />
          {disabled ? "אזל מהמלאי" : "הוספה לעגלה"}
        </Button>
        {!disabled && (
          <Button
            variant="brand-outline"
            size="lg"
            disabled={isPending}
            onClick={() => addToCart("checkout")}
            className="h-12 flex-1 gap-2 text-base"
          >
            <Zap className="size-5" />
            קנייה מהירה
          </Button>
        )}
      </div>
    </div>
  );
}
