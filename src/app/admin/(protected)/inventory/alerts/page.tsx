import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { getInventoryAlerts } from "@/lib/queries/admin-inventory";
import { InventoryTabs } from "@/components/admin/inventory-tabs";
import { ResolveAlertButton } from "@/components/admin/resolve-alert-button";
import { formatDateTime } from "@/lib/format";
import { INVENTORY_ALERT_TYPE_LABELS, type InventoryAlertType, type InventoryAlertSeverity } from "@/lib/enums";
import { cn } from "@/lib/utils";

export const metadata = { title: "התראות מלאי | PREC Admin" };

const SEVERITY_STYLES: Record<InventoryAlertSeverity, string> = {
  INFO: "bg-accent text-accent-foreground",
  WARNING: "bg-warning/15 text-warning-foreground",
  CRITICAL: "bg-destructive/15 text-destructive",
};

export default async function InventoryAlertsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const resolved = sp.resolved === "true";
  const { alerts, total } = await getInventoryAlerts({ resolved });

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">מרכז בקרת מלאי</h1>
      <InventoryTabs />

      <div className="mb-4 flex items-center gap-2">
        <Link
          href="/admin/inventory/alerts"
          className={cn(
            "rounded-full px-3 py-1.5 text-sm font-medium",
            !resolved ? "bg-brand text-brand-foreground" : "bg-secondary text-secondary-foreground"
          )}
        >
          פתוחות
        </Link>
        <Link
          href="/admin/inventory/alerts?resolved=true"
          className={cn(
            "rounded-full px-3 py-1.5 text-sm font-medium",
            resolved ? "bg-brand text-brand-foreground" : "bg-secondary text-secondary-foreground"
          )}
        >
          טופלו
        </Link>
        <span className="text-muted-foreground text-sm">{total.toLocaleString("he-IL")} התראות</span>
      </div>

      {alerts.length === 0 ? (
        <div className="border-border bg-card text-muted-foreground flex flex-col items-center gap-2 rounded-xl border p-10 text-center text-sm">
          <CheckCircle2 className="text-success size-8" />
          {resolved ? "אין התראות שטופלו" : "אין התראות פתוחות — הכל תקין"}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {alerts.map((alert) => (
            <div key={alert.id} className="border-border bg-card flex items-start justify-between gap-3 rounded-xl border p-4">
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium",
                      SEVERITY_STYLES[alert.severity as InventoryAlertSeverity]
                    )}
                  >
                    {INVENTORY_ALERT_TYPE_LABELS[alert.type as InventoryAlertType] ?? alert.type}
                  </span>
                  <span className="text-muted-foreground text-xs">{formatDateTime(alert.createdAt)}</span>
                  {alert.source && <span className="text-muted-foreground text-xs">{alert.source.filename}</span>}
                </div>
                <p className="text-sm">{alert.message}</p>
                {alert.product && (
                  <Link href={`/admin/inventory/${alert.product.id}`} className="text-brand text-xs hover:underline">
                    {alert.product.title}
                  </Link>
                )}
              </div>
              {!resolved && <ResolveAlertButton id={alert.id} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
