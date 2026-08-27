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

export function StockBadge({ status, className }: { status: StockStatus; className?: string }) {
  const Icon = ICONS[status];
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", STYLES[status], className)}>
      <Icon className="size-3.5" />
      {STOCK_STATUS_LABELS[status]}
    </span>
  );
}

// The supplier price sheets report single-digit quantities for almost
// everything they carry — 1,160 of the 1,504 in-stock products land under
// the low-stock threshold, so "מלאי אחרון" was showing on roughly three
// quarters of the catalog. A scarcity notice that true of nearly every
// product on the site is not information; a customer who sees it everywhere
// correctly concludes it means nothing, and it costs the store the trust it
// was reaching for. Those numbers are also a supplier's stock line, not a
// count of units on our own shelf, so the urgency was never ours to claim
// in the first place.
//
// LOW_STOCK stays exactly as it is internally — it drives the admin restock
// views and the attention queue, which is the job it is actually good at.
// This is the storefront's reading of the same field: purchasable or not.
const PUBLIC_STATUS: Partial<Record<StockStatus, StockStatus>> = {
  LOW_STOCK: "IN_STOCK",
};

export function PublicStockBadge({ status, className }: { status: StockStatus; className?: string }) {
  return <StockBadge status={PUBLIC_STATUS[status] ?? status} className={className} />;
}
