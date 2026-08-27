import Link from "next/link";
import { AlertTriangle, Package, ExternalLink } from "lucide-react";
import { getAttentionProducts } from "@/lib/queries/admin-inventory";
import { InventoryTabs } from "@/components/admin/inventory-tabs";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "טיפול | A&I Electronics Admin" };

// Two sources feed this list: reconcileUrgentMissingMedia (automatic — a
// product with no photo and no spec, hidden from the site on its own) and
// setProductReviewFlagAction(..., "ATTENTION") (manual — an admin sent it
// here from the product page for any other reason). Only the automatic one
// actually unpublishes the product; a manual flag is just a to-do marker.
export default async function AttentionInventoryPage() {
  const items = await getAttentionProducts();

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">מרכז בקרת מלאי</h1>
      <InventoryTabs />

      <div className="mb-4 flex items-center gap-2">
        <AlertTriangle className="text-warning-foreground size-5" />
        <h2 className="text-lg font-bold">טיפול</h2>
        <span className="text-muted-foreground text-sm">({items.length.toLocaleString("he-IL")})</span>
      </div>
      <p className="text-muted-foreground mb-5 text-sm">
        מוצרים שהוסרו אוטומטית מהתצוגה באתר כי אין להם תמונה וגם אין מפרט טכני, וגם מוצרים שסומנו ידנית לטיפול מדף
        המוצר. מוצר שהוסר אוטומטית יחזור לתצוגה לבד ברגע שתוסיפו תמונה או מפרט; מוצר שסומן ידנית יורד מהרשימה רק
        כשתסירו את הסימון מדף המוצר.
      </p>

      {items.length === 0 ? (
        <div className="border-border bg-card text-muted-foreground flex flex-col items-center gap-2 rounded-xl border p-10 text-center text-sm">
          <AlertTriangle className="text-success size-8" />
          אין כרגע מוצרים שממתינים לטיפול
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <div key={item.id} className="border-border bg-card flex items-center gap-3 rounded-xl border p-3">
              <span className="bg-muted text-muted-foreground flex size-11 shrink-0 items-center justify-center rounded-lg">
                <Package className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.product.title}</p>
                <p className="text-muted-foreground text-xs">
                  {item.product.brand.name} · {item.product.category.name} · מק&quot;ט {item.product.sku} · במלאי{" "}
                  {item.product.stockQty}
                </p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {item.type === "MANUAL_ATTENTION" ? "סומן ידנית" : "הוסר"} {formatDateTime(item.createdAt)}
                </p>
              </div>
              <Link
                href={`/product/${item.product.slug}`}
                target="_blank"
                className="border-border hover:border-brand/40 hover:text-brand flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
              >
                <ExternalLink className="size-3.5" />
                פתח דף מוצר לתיקון
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
