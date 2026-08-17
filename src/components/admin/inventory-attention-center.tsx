import Link from "next/link";
import { cn } from "@/lib/utils";
import { INVENTORY_ALERT_TYPE_LABELS, type InventoryAlertType } from "@/lib/enums";

type Group = { type: string; count: number };

// Severity → visual weight, not a strict business rule — just enough to
// draw the eye to what's actually critical (bad price data) vs informational
// (a low-stock heads up).
const SEVERITY: Record<string, "critical" | "warning" | "info"> = {
  INVALID_PRICE: "critical",
  NEGATIVE_STOCK: "critical",
  SOURCE_CONFLICT: "critical",
  DUPLICATE_SKU: "warning",
  DUPLICATE_MODEL: "warning",
  MISSING_MODEL: "warning",
  MISSING_FROM_SOURCE: "warning",
  UNMATCHED_ROW: "warning",
  UNKNOWN_COLUMN: "info",
  LOW_STOCK: "info",
  OUT_OF_STOCK: "info",
  MAJOR_STOCK_CHANGE: "info",
};

const DOT: Record<"critical" | "warning" | "info", string> = {
  critical: "bg-destructive",
  warning: "bg-warning",
  info: "bg-accent-foreground",
};

export function InventoryAttentionCenter({ groups }: { groups: Group[] }) {
  const withLabels = groups
    .filter((g) => g.count > 0)
    .map((g) => ({
      ...g,
      label: INVENTORY_ALERT_TYPE_LABELS[g.type as InventoryAlertType] ?? g.type,
      severity: SEVERITY[g.type] ?? "info",
    }));

  if (withLabels.length === 0) return null;

  return (
    <div className="border-border bg-card mb-5 rounded-xl border p-4">
      <h2 className="mb-3 text-sm font-semibold">דורש טיפול</h2>
      <div className="flex flex-wrap gap-2">
        {withLabels.map((g) => (
          <Link
            key={g.type}
            href={`/admin/inventory?alertType=${g.type}`}
            className={cn(
              "border-border bg-background hover:bg-muted/60 flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors"
            )}
          >
            <span className={cn("size-1.5 rounded-full", DOT[g.severity])} />
            <span className="font-semibold tabular-nums">{g.count.toLocaleString("he-IL")}</span>
            <span className="text-muted-foreground">{g.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
