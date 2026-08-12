import { formatPrice } from "@/lib/format";
import { AddToCartButton } from "@/components/product/add-to-cart-button";
import type { StockStatus } from "@/lib/enums";

export function MobileBuyBar({
  productId,
  price,
  stockStatus,
}: {
  productId: string;
  price: number;
  stockStatus: StockStatus;
}) {
  return (
    <div className="bg-background/95 fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t px-4 py-3 backdrop-blur lg:hidden">
      <span className="text-lg font-bold tabular-nums">{formatPrice(price)}</span>
      <AddToCartButton
        productId={productId}
        disabled={stockStatus === "OUT_OF_STOCK"}
        size="lg"
        className="h-11 flex-1"
        label={stockStatus === "OUT_OF_STOCK" ? "אזל מהמלאי" : "הוספה לעגלה"}
      />
    </div>
  );
}
