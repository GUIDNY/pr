import { Check, Clock, Eye, PackageX, AlertTriangle } from "lucide-react";
import { STOCK_STATUS_LABELS, type StockStatus } from "@/lib/enums";
import { cn } from "@/lib/utils";

const STYLES: Record<StockStatus, string> = {
  IN_STOCK: "text-success",
  LOW_STOCK: "text-warning-foreground",
  OUT_OF_STOCK: "text-muted-foreground",
  SPECIAL_ORDER: "text-accent-foreground",
  DISCONTINUED: "text-muted-foreground",
  SUPPLIER_STOCK: "text-accent-foreground",
  DISPLAY_ONLY: "text-muted-foreground",
  NEEDS_REVIEW: "text-destructive",
};

const ICONS: Record<StockStatus, typeof Check> = {
  IN_STOCK: Check,
  LOW_STOCK: Clock,
  OUT_OF_STOCK: PackageX,
  SPECIAL_ORDER: Clock,
  DISCONTINUED: PackageX,
  SUPPLIER_STOCK: Clock,
  DISPLAY_ONLY: Eye,
  NEEDS_REVIEW: AlertTriangle,
};

/**
 * NEEDS_REVIEW is a back-office state and a customer must never be shown it.
 *
 * It rendered as "דורש בדיקה" in red with a warning triangle, on 202
 * published product pages. The listings never showed those products —
 * PUBLIC_PRODUCT_WHERE excludes the status — but a product page answers 200
 * on its own URL, so anybody arriving from Google or a shared link read an
 * internal data-quality flag about our own catalogue.
 *
 * Shown as out of stock instead, which is the honest customer-facing
 * meaning: the status says we cannot vouch for this product's availability,
 * and "out of stock" is the version of that which does not promise
 * anything. Never as available.
 */
function customerFacing(status: StockStatus): StockStatus {
  return status === "NEEDS_REVIEW" ? "OUT_OF_STOCK" : status;
}

export function StockBadge({ status, className }: { status: StockStatus; className?: string }) {
  const shown = customerFacing(status);
  const Icon = ICONS[shown];
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", STYLES[shown], className)}>
      <Icon className="size-3.5" />
      {STOCK_STATUS_LABELS[shown]}
    </span>
  );
}
