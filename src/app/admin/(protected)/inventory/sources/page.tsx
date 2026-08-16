import { db } from "@/lib/db";
import { InventoryTabs } from "@/components/admin/inventory-tabs";
import { SourceUploadForm } from "@/components/admin/source-upload-form";
import { SourceActiveToggle } from "@/components/admin/source-active-toggle";
import { INVENTORY_SOURCES } from "@/lib/inventory/sheet-map";
import { formatDateTime, formatDate } from "@/lib/format";
import { isStorageConfigured } from "@/lib/inventory/storage";

export const metadata = { title: "מקורות נתונים | PREC Admin" };

export default async function InventorySourcesPage() {
  const [sources, storageReady] = await Promise.all([
    db.inventorySource.findMany({ orderBy: { filename: "asc" } }),
    Promise.resolve(isStorageConfigured()),
  ]);

  const byKey = new Map(sources.map((s) => [s.key, s]));

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">מרכז בקרת מלאי</h1>
      <InventoryTabs />

      {!storageReady && (
        <div className="border-warning/40 bg-warning/10 text-warning-foreground mb-6 rounded-xl border p-4 text-sm">
          Supabase Storage עדיין לא מחובר (חסרים SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY) — אפשר להעלות קובץ, אבל
          סנכרון אוטומטי/ידני מחדש לא יפעל עד שיוגדרו.
        </div>
      )}

      <div className="flex flex-col gap-4">
        {INVENTORY_SOURCES.map(({ key, filename: defaultFilename }) => {
          const source = byKey.get(key);
          return (
            <div key={key} className="border-border bg-card rounded-xl border p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-semibold">{source?.filename ?? defaultFilename}</h2>
                  <p className="text-muted-foreground text-xs">מקור: {key}</p>
                </div>
                {source && <SourceActiveToggle id={source.id} isActive={source.isActive} />}
              </div>

              {source ? (
                <div className="text-muted-foreground grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
                  <div>
                    <div className="text-foreground font-medium">
                      {source.isActive ? "פעיל" : "לא פעיל"}
                    </div>
                    <div>סטטוס</div>
                  </div>
                  <div>
                    <div className="text-foreground font-medium">{formatDate(source.uploadedAt)}</div>
                    <div>הועלה</div>
                  </div>
                  <div>
                    <div className="text-foreground font-medium">
                      {source.lastSyncedAt ? formatDateTime(source.lastSyncedAt) : "טרם סונכרן"}
                    </div>
                    <div>סנכרון אחרון</div>
                  </div>
                  <div>
                    <div className="text-foreground font-medium">
                      {source.fileSizeBytes ? `${(source.fileSizeBytes / 1024).toFixed(0)} KB` : "—"}
                    </div>
                    <div>גודל קובץ</div>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">עדיין לא הועלה קובץ עבור מקור זה</p>
              )}

              <div className="mt-4">
                <SourceUploadForm sourceKey={key} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
