import { requireCatalogPage } from "@/lib/auth";
import Link from "next/link";
import { getSyncRunChanges } from "@/lib/queries/admin-inventory";
import { InventoryTabs } from "@/components/admin/inventory-tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { INVENTORY_CHANGE_TYPE_LABELS, INVENTORY_ALERT_TYPE_LABELS, type InventoryChangeType, type InventoryAlertType } from "@/lib/enums";
import { cn } from "@/lib/utils";

export const metadata = { title: "מה השתנה בסנכרון | Buy Today Admin" };

const ils = (n: number) => `${Math.round(n).toLocaleString("he-IL")} ₪`;

/* A change event's value column is a plain number for price and stock and a
   JSON blob for the two that describe a whole product. Render each as what
   it is — "{"sku":"","title":"..."}" in a cell is how the existing שינויים
   page reads today. */
function money(v: string | null) {
  const n = Number(v);
  return v !== null && Number.isFinite(n) ? ils(n) : "—";
}
function count(v: string | null) {
  const n = Number(v);
  return v !== null && Number.isFinite(n) ? n.toLocaleString("he-IL") : "—";
}

/* The title out of a NEW_PRODUCT / PRODUCT_MISSING_FROM_SOURCE blob, for
   rows whose product record is gone. Wrapped because this is a server
   component rendering a stored string: one malformed value — a truncated
   write, a change in what the sync stores — would throw during render and
   take the whole page down, and the page's whole job is to be the thing you
   open when something has gone wrong. */
function titleFromBlob(v: string | null): string {
  if (!v) return "—";
  try {
    const parsed: unknown = JSON.parse(v);
    if (parsed && typeof parsed === "object" && "title" in parsed) {
      const t = (parsed as { title?: unknown }).title;
      if (typeof t === "string" && t.trim()) return t;
    }
  } catch {
    /* Not JSON. Fall through to the raw string, which is still more use
       than an empty cell. */
  }
  return v.slice(0, 80);
}

/* Price first, then what came and went, then stock. The order is the order
   these get dealt with, which is the same argument the tab strip itself
   was built on. */
const GROUPS: { types: InventoryChangeType[]; title: string; note?: string }[] = [
  { types: ["PRICE_CHANGED"], title: "מחירים שהשתנו", note: "המחיר באתר אומץ מהמחירון החדש" },
  { types: ["NEW_PRODUCT"], title: "מוצרים חדשים מהמחירון" },
  { types: ["PRODUCT_MISSING_FROM_SOURCE"], title: "מוצרים שנעלמו מהמחירון", note: "השורה שלהם לא נמצאה בגיליון הפעם" },
  { types: ["BECAME_OUT_OF_STOCK", "BACK_IN_STOCK"], title: "נכנסו ויצאו מהמלאי" },
  { types: ["STOCK_INCREASED", "STOCK_DECREASED"], title: "שינויי כמות" },
  { types: ["SUPPLIER_STOCK_CHANGED", "SHOWROOM_STOCK_CHANGED", "SOURCE_CONFLICT"], title: "מלאי ספק, תצוגה והתנגשויות" },
];

export default async function SyncChangesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireCatalogPage();
  const sp = await searchParams;
  const { runs, run, real, realTotal, reportedCount, alerts, alertTotal, money: m } = await getSyncRunChanges(sp.run);

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">מרכז בקרת מלאי</h1>
      <InventoryTabs />

      {/* Which run. A select would need a client component for one link per
          option; twenty links do the same job and survive JavaScript being
          slow to arrive. */}
      <div className="mb-5 flex flex-wrap gap-1.5">
        {runs.map((r) => {
          const active = run?.id === r.id;
          return (
            <Link
              key={r.id}
              href={`/admin/inventory/sync-changes?run=${r.id}`}
              className={cn(
                "rounded-lg border px-2.5 py-1 text-xs transition-colors",
                active
                  ? "border-brand bg-brand/10 text-brand font-semibold"
                  : "border-border text-muted-foreground hover:text-foreground",
                r._count.changeEvents === 0 && !active && "opacity-50"
              )}
            >
              {formatDateTime(r.startedAt)}
              {r._count.changeEvents === 0 && " · ללא שינויים"}
            </Link>
          );
        })}
      </div>

      {!run ? (
        <div className="border-border bg-card text-muted-foreground rounded-xl border p-8 text-center text-sm">
          עדיין לא בוצע סנכרון
        </div>
      ) : (
        <>
          <div className="border-border bg-card mb-5 rounded-xl border p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-lg font-semibold">{formatDateTime(run.startedAt)}</span>
              <span className="text-muted-foreground text-xs">
                {run.trigger === "MANUAL" ? "ידני" : "מתוזמן"}
                {run.triggeredBy ? ` • ${run.triggeredBy.name}` : ""}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <div className="text-muted-foreground text-xs">שינויים אמיתיים</div>
                <div className="text-xl font-bold tabular-nums">{realTotal.toLocaleString("he-IL")}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">שינויי מחיר</div>
                <div className="text-xl font-bold tabular-nums">{run.priceChanges.toLocaleString("he-IL")}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">תזוזת מחיר ליחידה</div>
                <div className={cn("text-xl font-bold tabular-nums", m.perUnit < 0 ? "text-destructive" : m.perUnit > 0 ? "text-success" : "")}>
                  {m.perUnit === 0 ? "—" : `${m.perUnit > 0 ? "+" : ""}${ils(m.perUnit)}`}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">על כל המלאי שמאחור</div>
                <div className={cn("text-xl font-bold tabular-nums", m.listed < 0 ? "text-destructive" : m.listed > 0 ? "text-success" : "")}>
                  {m.listed === 0 ? "—" : `${m.listed > 0 ? "+" : ""}${ils(m.listed)}`}
                </div>
              </div>
            </div>

            {/* The honest line about the noise. Without it the page looks
                like it is hiding 1,114 rows; with it, the number is the
                useful form of them. */}
            {reportedCount > 0 && (
              <p className="text-muted-foreground mt-3 border-t pt-3 text-xs">
                בנוסף, ב-{reportedCount.toLocaleString("he-IL")} מוצרים הגיליון כותב תיאור או דגם שונה ממה ששמור אצלנו —
                <strong className="font-medium"> הסנכרון לא שינה אותם</strong>. זה המצב הקבוע של כל מוצר מועשר, לא שינוי.
              </p>
            )}
          </div>

          {realTotal > real.length && (
            <p className="text-muted-foreground mb-3 text-xs">
              מוצגים {real.length.toLocaleString("he-IL")} מתוך {realTotal.toLocaleString("he-IL")} השינויים של הריצה הזאת.
            </p>
          )}

          {real.length === 0 ? (
            <div className="border-border bg-card text-muted-foreground rounded-xl border p-8 text-center text-sm">
              הסנכרון הזה לא שינה מחיר, מלאי או מוצר
            </div>
          ) : (
            GROUPS.map((g) => {
              const rows = real.filter((e) => g.types.includes(e.changeType as InventoryChangeType));
              if (rows.length === 0) return null;
              const isPrice = g.types[0] === "PRICE_CHANGED";
              return (
                <section key={g.title} className="mb-6">
                  <div className="mb-2 flex items-baseline gap-2">
                    <h2 className="font-semibold">{g.title}</h2>
                    <span className="text-muted-foreground text-xs">{rows.length.toLocaleString("he-IL")}</span>
                    {g.note && <span className="text-muted-foreground text-xs">· {g.note}</span>}
                  </div>
                  <div className="border-border bg-card overflow-x-auto rounded-xl border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>מק״ט</TableHead>
                          <TableHead>מוצר</TableHead>
                          <TableHead>לשונית</TableHead>
                          <TableHead>{isPrice ? "היה" : "לפני"}</TableHead>
                          <TableHead>{isPrice ? "עכשיו" : "אחרי"}</TableHead>
                          <TableHead>{isPrice ? "פער" : "סוג"}</TableHead>
                          {isPrice && <TableHead>מלאי</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((e) => {
                          const before = Number(e.previousValue);
                          const after = Number(e.newValue);
                          const delta = Number.isFinite(before) && Number.isFinite(after) ? after - before : null;
                          return (
                            <TableRow key={e.id} className="hover:bg-muted/50">
                              <TableCell className="text-muted-foreground text-xs tabular-nums">
                                {e.product?.sku ?? e.sourceSku ?? "—"}
                              </TableCell>
                              <TableCell className="max-w-[320px]">
                                {e.product ? (
                                  <Link href={`/admin/inventory/${e.product.id}`} className="text-brand line-clamp-1 font-medium hover:underline">
                                    {e.product.title}
                                  </Link>
                                ) : (
                                  <span className="text-muted-foreground line-clamp-1 text-sm">
                                    {/* A NEW_PRODUCT event whose product was since deleted, or a
                                        row that never became one. The sheet's own text is all
                                        there is to show. */}
                                    {titleFromBlob(e.newValue ?? e.previousValue)}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-muted-foreground max-w-[150px] truncate text-xs">
                                {e.sourceSheet ?? "—"}
                              </TableCell>
                              <TableCell className="text-muted-foreground text-sm tabular-nums">
                                {isPrice ? money(e.previousValue) : count(e.previousValue)}
                              </TableCell>
                              <TableCell className="text-sm font-medium tabular-nums">
                                {isPrice ? money(e.newValue) : count(e.newValue)}
                              </TableCell>
                              <TableCell className="text-sm tabular-nums">
                                {isPrice ? (
                                  delta === null ? (
                                    "—"
                                  ) : (
                                    <span className={cn("font-medium", delta < 0 ? "text-destructive" : "text-success")}>
                                      {delta > 0 ? "+" : ""}
                                      {ils(delta)}
                                    </span>
                                  )
                                ) : (
                                  <span className="bg-accent text-accent-foreground rounded-full px-2 py-0.5 text-xs font-medium">
                                    {INVENTORY_CHANGE_TYPE_LABELS[e.changeType as InventoryChangeType] ?? e.changeType}
                                  </span>
                                )}
                              </TableCell>
                              {isPrice && (
                                <TableCell className="text-muted-foreground text-sm tabular-nums">
                                  {e.product?.stockQty ?? "—"}
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </section>
              );
            })
          )}

          {/* Why, where the run had a reason. These are the messages that say
              a candidate was under cost and which column was used instead,
              or that a row started naming another model — the answer to
              "why did this price move" lives here and nowhere else. */}
          {alerts.length > 0 && (
            <section className="mb-6">
              <div className="mb-2 flex items-baseline gap-2">
                <h2 className="font-semibold">מה הסנכרון סימן, ולמה</h2>
                <span className="text-muted-foreground text-xs">
                  {alertTotal > alerts.length
                    ? `${alerts.length.toLocaleString("he-IL")} מתוך ${alertTotal.toLocaleString("he-IL")}`
                    : alertTotal.toLocaleString("he-IL")}
                </span>
              </div>
              <div className="border-border bg-card divide-border divide-y rounded-xl border">
                {alerts.map((a) => (
                  <div key={a.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 p-3 text-sm">
                    <span className="bg-accent text-accent-foreground shrink-0 rounded-full px-2 py-0.5 text-xs font-medium">
                      {INVENTORY_ALERT_TYPE_LABELS[a.type as InventoryAlertType] ?? a.type}
                    </span>
                    {a.product && (
                      <Link href={`/admin/inventory/${a.product.id}`} className="text-brand shrink-0 text-xs tabular-nums hover:underline">
                        {a.product.sku}
                      </Link>
                    )}
                    {a.isResolved && <span className="text-success shrink-0 text-xs">טופל</span>}
                    <span className="text-muted-foreground">{a.message}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
