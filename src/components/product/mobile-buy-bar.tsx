"use client";

import { formatPrice } from "@/lib/format";
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
  price,
  stockStatus,
}: {
  productId: string;
  price: number;
  stockStatus: StockStatus;
}) {
  // Shares PurchasePanel's quantity so this bar's price and add-to-cart
  // action actually match what the shopper selected up there — it used to
  // always show the single-unit price regardless of the stepper.
  const qty = useProductQtyStore((s) => s.qty);
  return (
    <div className="bg-background/95 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 rounded-t-2xl border-t px-4 py-3 backdrop-blur lg:hidden">
      <span className="text-lg font-bold tabular-nums">{formatPrice(price * qty)}</span>
      <AddToCartButton
        productId={productId}
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
