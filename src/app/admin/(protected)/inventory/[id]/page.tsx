import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Pencil } from "lucide-react";
import { getInventoryProductDetail } from "@/lib/queries/admin-inventory";
import { PublishToggle } from "@/components/admin/publish-toggle";
import { StockBadge } from "@/components/product/stock-badge";
import { Button } from "@/components/ui/button";
import { formatPrice, formatDateTime } from "@/lib/format";
import {
  STOCK_STATUS_LABELS,
  ENRICHMENT_STATUS_LABELS,
  INVENTORY_CHANGE_TYPE_LABELS,
  type StockStatus,
  type EnrichmentStatus,
  type InventoryChangeType,
} from "@/lib/enums";

export const metadata = { title: "פרטי מוצר | A&I Electronics Admin" };

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="text-sm font-medium">{value ?? "—"}</div>
    </div>
  );
}

export default async function InventoryProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await getInventoryProductDetail(id);
  if (!product) notFound();

  let stockBreakdown: Record<string, unknown> = {};
  try {
    stockBreakdown = product.stockBreakdown ? JSON.parse(product.stockBreakdown) : {};
  } catch {
    stockBreakdown = {};
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/inventory" className="text-muted-foreground text-sm hover:underline">
            ← חזרה למרכז בקרת מלאי
          </Link>
          <h1 className="mt-1 text-2xl font-bold">{product.title}</h1>
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <span>
              {product.brand.name} · {product.model ?? "—"} · מק&quot;ט {product.sku}
            </span>
            {product.isTemporarySku && (
              <span className="bg-destructive/15 text-destructive rounded-full px-2 py-0.5 text-xs font-semibold">
                מק&quot;ט זמני
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild className="gap-1.5">
            <Link href={`/product/${product.slug}`} target="_blank">
              <ExternalLink className="size-3.5" /> צפייה באתר
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild className="gap-1.5">
            <Link href={`/admin/products/${product.id}`}>
              <Pencil className="size-3.5" /> עריכת מוצר
            </Link>
          </Button>
        </div>
      </div>

      {product.alerts.length > 0 && (
        <div className="border-destructive/30 bg-destructive/5 rounded-xl border p-4">
          <h2 className="text-destructive mb-2 text-sm font-semibold">התראות פתוחות ({product.alerts.length})</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {product.alerts.map((a) => (
              <li key={a.id}>{a.message}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="border-border bg-card rounded-xl border p-5">
          <h2 className="mb-4 font-semibold">נתונים עסקיים</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label='מק"ט' value={product.sku} />
            <Field label="דגם" value={product.model} />
            <Field label="מותג" value={product.brand.name} />
            <Field label="מחיר באתר" value={formatPrice(product.price)} />
            <Field label="מחיר מינימום (מקור)" value={product.minSalePrice ? formatPrice(product.minSalePrice) : "—"} />
            <Field label="מחיר ספק (פנימי)" value={product.supplierCost ? formatPrice(product.supplierCost) : "—"} />
            <Field label="גיליון מקור" value={product.sourceSheet} />
            <Field label="שורת מקור" value={product.sourceRowRef} />
            <Field label="סונכרן לאחרונה" value={product.lastExcelSyncAt ? formatDateTime(product.lastExcelSyncAt) : "—"} />
          </div>

          <h3 className="text-muted-foreground mt-5 mb-2 text-xs font-semibold">פירוט מלאי</h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {product.inventoryLines.map((line) => (
              <Field key={line.id} label={line.label} value={line.quantity} />
            ))}
            <Field label="סה״כ" value={product.stockQty} />
          </div>

          {Object.keys(stockBreakdown).length > 0 && (
            <details className="mt-4">
              <summary className="text-muted-foreground cursor-pointer text-xs font-medium">
                צפייה בנתוני המקור הגולמיים
              </summary>
              <div className="border-border mt-2 max-h-64 overflow-auto rounded-lg border p-3 text-xs">
                <table className="w-full">
                  <tbody>
                    {Object.entries(stockBreakdown).map(([k, v]) => (
                      <tr key={k} className="border-border border-b last:border-0">
                        <td className="text-muted-foreground py-1 pl-3 font-medium">{k}</td>
                        <td className="py-1">{String(v)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </section>

        <section className="border-border bg-card rounded-xl border p-5">
          <h2 className="mb-4 font-semibold">נתוני אתר</h2>
          <div className="flex flex-col gap-4">
            <Field label="כותרת באתר" value={product.title} />
            <Field label="קטגוריה" value={product.category.name} />
            <Field label="תמונות" value={`${product.images.length} תמונות`} />
            <div>
              <div className="text-muted-foreground mb-1 text-xs">זמינות</div>
              <StockBadge status={product.stockStatus as StockStatus} />
            </div>
            <div>
              <div className="text-muted-foreground mb-1 text-xs">סטטוס פרסום</div>
              <PublishToggle id={product.id} isPublished={product.isPublished} />
            </div>
          </div>
        </section>

        <section className="border-border bg-card rounded-xl border p-5">
          <h2 className="mb-4 font-semibold">העשרת מוצר</h2>
          <div className="flex flex-col gap-4">
            <Field
              label="סטטוס העשרה"
              value={ENRICHMENT_STATUS_LABELS[product.enrichmentStatus as EnrichmentStatus] ?? product.enrichmentStatus}
            />
            <p className="text-muted-foreground text-xs leading-relaxed">
              העשרה אוטומטית (תיאור, מפרט טכני, תמונות) היא פיצ&apos;ר עתידי נפרד — כרגע המוצר מוצג עם הנתונים
              שהגיעו ישירות מקובץ המקור בלבד.
            </p>
          </div>
        </section>
      </div>

      <section className="border-border bg-card rounded-xl border p-5">
        <h2 className="mb-4 font-semibold">היסטוריית מלאי</h2>
        {product.changeEvents.length === 0 ? (
          <p className="text-muted-foreground text-sm">אין עדיין היסטוריית שינויים למוצר זה</p>
        ) : (
          <ul className="divide-border divide-y">
            {product.changeEvents.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="bg-accent text-accent-foreground rounded-full px-2 py-0.5 text-xs font-medium">
                  {INVENTORY_CHANGE_TYPE_LABELS[e.changeType as InventoryChangeType] ?? e.changeType}
                </span>
                <span className="text-muted-foreground text-xs">{formatDateTime(e.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
