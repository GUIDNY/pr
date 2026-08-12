"use client";

import { ShoppingCart } from "lucide-react";
import { useCartStore } from "@/stores/cart-store";

export function CartTrigger() {
  const itemCount = useCartStore((s) => s.cart.itemCount);
  const toggleDrawer = useCartStore((s) => s.toggleDrawer);

  return (
    <button
      type="button"
      onClick={toggleDrawer}
      aria-label="עגלת קניות"
      className="hover:bg-muted relative flex size-10 items-center justify-center rounded-full transition-colors"
    >
      <ShoppingCart className="size-5" />
      {itemCount > 0 && (
        <span className="bg-brand text-brand-foreground absolute -top-0.5 -end-0.5 flex size-4.5 items-center justify-center rounded-full text-[10px] font-bold tabular-nums">
          {itemCount > 9 ? "9+" : itemCount}
        </span>
      )}
    </button>
  );
}
