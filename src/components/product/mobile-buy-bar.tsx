"use client";

import { formatPrice } from "@/lib/format";
import { computeDeliveryFee } from "@/lib/delivery";
import { AddToCartButton } from "@/components/product/add-to-cart-button";
import { useProductQtyStore } from "@/stores/product-qty-store";
import type { StockStatus } from "@/lib/enums";

// Deliberately one clean action here, not two — a small outline icon square
// squeezed between the price and the solid add-to-cart pill (tried in an
// earlier pass) read as a busy, mismatched row rather than a second useful
// action. Quick-buy stays reachable in PurchasePanel above; a shopper
// already committed enough to want it can scroll the short distance back.
export function MobileBuyBar({
  productId,
  slug,
  price,
  stockStatus,
}: {
  productId: string;
  slug: string;
  price: number;
  stockStatus: StockStatus;
}) {
  // Shares PurchasePanel's quantity so this bar's price and add-to-cart
  // action actually match what the shopper selected up there — it used to
  // always show the single-unit price regardless of the stepper.
  const qty = useProductQtyStore((s) => s.qty);
  /* What this will cost at the door, said under the price and before the
     basket says it. This bar is all a phone shows of the purchase panel
     once the page is scrolled, and it showed the price alone: the first
     place a shopper met the delivery charge was the cart drawer, as a
     total. Three visits that came from a Google ad between 9 and 14
     November added a product and left at exactly that total — 80 that had
     become 120, 250 that had become 290, 340 that had become 380.
     computeDeliveryFee is the cart's own function, on this product's own
     subtotal, so the bar cannot quote a number the basket contradicts; like
     the delivery line in the panel above it is for this product on its own,
     and a basket that already holds something may ship free sooner. */
  const total = price * qty;
  const deliveryFee = computeDeliveryFee(total);
  return (
    <div className="floating-launcher bg-background/95 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 rounded-t-2xl border-t px-4 py-3 backdrop-blur md:hidden">
      <span className="flex shrink-0 flex-col leading-tight">
        <span className="text-lg font-bold tabular-nums">{formatPrice(total)}</span>
        {deliveryFee === 0 ? (
          <span className="text-success text-[11px] font-medium whitespace-nowrap">משלוח חינם</span>
        ) : (
          <span className="text-muted-foreground text-[11px] whitespace-nowrap tabular-nums">
            + {formatPrice(deliveryFee)} משלוח
          </span>
        )}
      </span>
      <AddToCartButton
        productId={productId}
        slug={slug}
        price={price}
        qty={qty}
        disabled={stockStatus === "OUT_OF_STOCK" || stockStatus === "DISPLAY_ONLY"}
        size="lg"
        className="h-11 flex-1"
        label={
          stockStatus === "OUT_OF_STOCK"
            ? "אזל מהמלאי"
            : stockStatus === "DISPLAY_ONLY"
              ? "תצוגה בלבד"
              : "הוספה לעגלה"
        }
      />
    </div>
  );
}
