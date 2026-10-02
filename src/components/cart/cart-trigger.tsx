"use client";

import { ShoppingCart } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCartStore } from "@/stores/cart-store";
import { showsBottomNav } from "@/lib/bottom-nav";

export function CartTrigger({ unlessTabBar = false }: {
  // For the phone header: stay out of the way where the bottom tab bar
  // already carries the cart with its count — two identical cart buttons
  // on one screen crowd the header and say nothing twice. On the pages
  // whose bottom edge is taken (product, checkout) the tab bar is gone,
  // so the header cart is the cart there.
  unlessTabBar?: boolean;
}) {
  const itemCount = useCartStore((s) => s.cart.itemCount);
  const toggleDrawer = useCartStore((s) => s.toggleDrawer);
  const pathname = usePathname();
  if (unlessTabBar && showsBottomNav(pathname)) return null;

  return (
    <button
      type="button"
      onClick={toggleDrawer}
      aria-label="עגלת קניות"
      className="hover:bg-muted relative flex size-11 items-center justify-center rounded-full transition-colors sm:size-10"
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
