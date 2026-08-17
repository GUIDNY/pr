import Link from "next/link";
import { Boxes, AlertTriangle, ShieldAlert, ArrowUpRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Kpi = {
  label: string;
  value: number;
  icon: LucideIcon;
  href: string;
  tone: "neutral" | "warning" | "critical" | "info";
  active: boolean;
};

const TONE_STYLES: Record<Kpi["tone"], string> = {
  neutral: "text-foreground",
  warning: "text-warning-foreground",
  critical: "text-destructive",
  info: "text-accent-foreground",
};

const TONE_ICON_BG: Record<Kpi["tone"], string> = {
  neutral: "bg-muted text-muted-foreground",
  warning: "bg-warning/15 text-warning-foreground",
  critical: "bg-destructive/10 text-destructive",
  info: "bg-accent text-accent-foreground",
};

export function InventoryKpiCards({
  totalProducts,
  lowStock,
  needsAttention,
  changedToday,
  activeView,
}: {
  totalProducts: number;
  lowStock: number;
  needsAttention: number;
  changedToday: number;
  activeView?: string;
}) {
  const kpis: Kpi[] = [
    {
      label: 'סה"כ מוצרים',
      value: totalProducts,
      icon: Boxes,
      href: "/admin/inventory",
      tone: "neutral",
      active: !activeView || activeView === "ALL",
    },
    {
      label: "מלאי נמוך",
      value: lowStock,
      icon: AlertTriangle,
      href: "/admin/inventory?view=LOW_STOCK",
      tone: "warning",
      active: activeView === "LOW_STOCK",
    },
    {
      label: "דורשים טיפול",
      value: needsAttention,
      icon: ShieldAlert,
      href: "/admin/inventory?view=NEEDS_ATTENTION",
      tone: "critical",
      active: activeView === "NEEDS_ATTENTION",
    },
    {
      label: "שינויים היום",
      value: changedToday,
      icon: ArrowUpRight,
      href: "/admin/inventory/changes",
      tone: "info",
      active: false,
    },
  ];

  return (
    <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {kpis.map((k) => (
        <Link
          key={k.label}
          href={k.href}
          className={cn(
            "bg-card rounded-xl border p-4 transition-all hover:shadow-sm",
            k.active ? "border-brand/40 ring-brand/10 ring-1" : "border-border"
          )}
        >
          <div className="flex items-center justify-between">
            <span className={cn("flex size-8 items-center justify-center rounded-lg", TONE_ICON_BG[k.tone])}>
              <k.icon className="size-4" />
            </span>
          </div>
          <p className={cn("mt-3 text-2xl font-bold tabular-nums", TONE_STYLES[k.tone])}>
            {k.value.toLocaleString("he-IL")}
          </p>
          <p className="text-muted-foreground mt-0.5 text-xs">{k.label}</p>
        </Link>
      ))}
    </div>
  );
}
