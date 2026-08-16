import { getSyncHistory } from "@/lib/queries/admin-inventory";
import { InventoryTabs } from "@/components/admin/inventory-tabs";
import { InventorySyncButton } from "@/components/admin/inventory-sync-button";
import { formatDateTime } from "@/lib/format";
import { SYNC_RUN_STATUS_LABELS, type SyncRunStatus } from "@/lib/enums";
import { cn } from "@/lib/utils";

export const metadata = { title: "היסטוריית סנכרון | PREC Admin" };

const STATUS_STYLES: Record<SyncRunStatus, string> = {
  RUNNING: "bg-accent text-accent-foreground",
  SUCCESS: "bg-success/15 text-success",
  FAILED: "bg-destructive/15 text-destructive",
  NO_CHANGES: "bg-muted text-muted-foreground",
};

export default async function InventoryHistoryPage() {
  const { runs } = await getSyncHistory();

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">מרכז בקרת מלאי</h1>
        <InventorySyncButton />
      </div>
      <InventoryTabs />

      <div className="flex flex-col gap-3">
        {runs.length === 0 ? (
          <div className="border-border bg-card text-muted-foreground rounded-xl border p-8 text-center text-sm">
            עדיין לא בוצע סנכרון
          </div>
        ) : (
          runs.map((run) => (
            <div key={run.id} className="border-border bg-card rounded-xl border p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{formatDateTime(run.startedAt)}</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium",
                      STATUS_STYLES[run.status as SyncRunStatus]
                    )}
                  >
                    {SYNC_RUN_STATUS_LABELS[run.status as SyncRunStatus] ?? run.status}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {run.trigger === "MANUAL" ? "ידני" : "מתוזמן"}
                    {run.triggeredBy ? ` • ${run.triggeredBy.name}` : ""}
                  </span>
                </div>
              </div>

              {run.status === "SUCCESS" && (
                <div className="text-muted-foreground flex flex-wrap gap-x-5 gap-y-1 text-sm">
                  <span>{run.rowsScanned.toLocaleString("he-IL")} שורות נסרקו</span>
                  <span>{run.productsUpdated.toLocaleString("he-IL")} מוצרים עודכנו</span>
                  <span>{run.productsAdded.toLocaleString("he-IL")} מוצרים נוספו</span>
                  {run.productsMissing > 0 && <span>{run.productsMissing} נעלמו מהמקור</span>}
                  <span>{run.stockChanges.toLocaleString("he-IL")} שינויי מלאי</span>
                  <span>{run.priceChanges.toLocaleString("he-IL")} שינויי מחיר</span>
                  <span className={run.errorCount > 0 ? "text-destructive font-medium" : ""}>
                    {run.errorCount} שגיאות
                  </span>
                </div>
              )}
              {run.status === "NO_CHANGES" && (
                <p className="text-muted-foreground text-sm">לא נמצאו שינויים במקורות הפעילים</p>
              )}
              {run.status === "FAILED" && (
                <p className="text-destructive text-sm">{run.errorMessage ?? "הסנכרון נכשל"}</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
