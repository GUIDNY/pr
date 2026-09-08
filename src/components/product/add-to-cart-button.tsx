"use client";

import { useTransition } from "react";
import { ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { addToCartAction } from "@/actions/cart";
import { useCartStore } from "@/stores/cart-store";
import { META_CURRENCY, trackMeta } from "@/lib/analytics/meta";
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
            const summary = await addToCartAction(productId, qty);
            setCart(summary);
            reportAddToCart(summary, productId, qty);
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

/**
 * Report the add to Meta, from the cart the server just handed back.
 *
 * The button is given a productId and a quantity and nothing else — it is
 * rendered from a product page, a product card and the compare table, and
 * none of them would agree on how to pass a price. The cart summary that
 * comes back from the action has both the sku and the current price for
 * every line, priced by the server, so the event reports what was actually
 * added rather than what the page happened to be displaying.
 *
 * Value is the price of what was added now, not the cart total: an AddToCart
 * carrying the whole basket makes the numbers in Events Manager grow with
 * every extra item and stop meaning anything.
 */
function reportAddToCart(
  summary: { items: { productId: string; sku: string; price: number }[] },
  productId: string,
  qty: number,
) {
  const line = summary.items.find((i) => i.productId === productId);
  if (!line) return;
  trackMeta("AddToCart", {
    content_ids: [line.sku],
    contents: [{ id: line.sku, quantity: qty }],
    content_type: "product",
    value: line.price * qty,
    currency: META_CURRENCY,
    num_items: qty,
  });
}
