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
