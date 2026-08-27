"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, ShoppingCart, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { addToCartAction } from "@/actions/cart";
import { useCartStore } from "@/stores/cart-store";
import { useProductQtyStore } from "@/stores/product-qty-store";
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
  // Shared with MobileBuyBar (a separate sibling component further down
  // the page) so its total price and add-to-cart action stay in sync with
  // whatever quantity is selected here, instead of always assuming 1.
  const qty = useProductQtyStore((s) => s.qty);
  const setQty = useProductQtyStore((s) => s.setQty);
  useEffect(() => {
    setQty(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);
  const [isPending, startTransition] = useTransition();
  const setCart = useCartStore((s) => s.setCart);
  const openDrawer = useCartStore((s) => s.openDrawer);
  const router = useRouter();
  const disabled = stockStatus === "OUT_OF_STOCK" || stockStatus === "DISPLAY_ONLY";

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
            onClick={() => setQty(Math.max(1, qty - 1))}
            className="p-2.5 disabled:opacity-40"
            disabled={qty <= 1}
            aria-label="הפחת כמות"
          >
            <Minus className="size-4" />
          </button>
          <span className="w-10 text-center font-medium tabular-nums">{qty}</span>
          <button
            onClick={() => setQty(Math.min(maxQuantity, qty + 1))}
            className="p-2.5 disabled:opacity-40"
            disabled={qty >= maxQuantity}
            aria-label="הוסף כמות"
          >
            <Plus className="size-4" />
          </button>
        </div>
      )}

      {/* Always side by side, even on mobile — a stacked full-width pair
          read as one dominant button with a thin afterthought beneath it;
          a true 50/50 row makes both read as equally weighted actions. */}
      <div className="flex flex-row gap-2">
        <Button
          variant="brand"
          size="lg"
          disabled={disabled || isPending}
          onClick={() => addToCart("drawer")}
          className="h-14 flex-1 gap-2 text-base"
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
            // The shared brand-outline variant's border is a faint 30%-
            // opacity tint — fine for a lightweight secondary action
            // elsewhere, but next to the solid red add-to-cart button here
            // it read as thin and smaller even at the identical box size.
            // A full-strength border + a light fill gives it real visual
            // weight without touching the shared variant used elsewhere.
            className="h-14 flex-1 gap-2 border-brand bg-brand/5 text-base font-semibold"
          >
            <Zap className="size-5" />
            קנייה מהירה
          </Button>
        )}
      </div>
    </div>
  );
}
