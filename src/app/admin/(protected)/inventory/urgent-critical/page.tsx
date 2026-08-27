import Link from "next/link";
import { AlertTriangle, Package, ExternalLink } from "lucide-react";
import { getUrgentReviewProducts } from "@/lib/queries/admin-inventory";
import { InventoryTabs } from "@/components/admin/inventory-tabs";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "טיפול דחוף | A&I Electronics Admin" };

// Unlike the "טיפול" tab, nothing lands here automatically — only a product
// an admin explicitly sent here via the button on its own product page
// (setProductReviewFlagAction(..., "URGENT")). It stays until the admin
// removes the flag from that same button; the site's publish state isn't
// touched either way.
export default async function UrgentReviewInventoryPage() {
  const items = await getUrgentReviewProducts();

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">מרכז בקרת מלאי</h1>
      <InventoryTabs />

      <div className="mb-4 flex items-center gap-2">
        <AlertTriangle className="text-destructive size-5" />
        <h2 className="text-lg font-bold">טיפול דחוף</h2>
        <span className="text-muted-foreground text-sm">({items.length.toLocaleString("he-IL")})</span>
      </div>
      <p className="text-muted-foreground mb-5 text-sm">
        מוצרים שסומנו ידנית כטיפול דחוף מדף המוצר שלהם. הרשימה הזו לא מתמלאת אוטומטית — רק לחיצה על &quot;שלח לטיפול
        דחוף&quot; שמה מוצר כאן, ורק הסרת הסימון מדף המוצר מוציאה אותו.
      </p>

      {items.length === 0 ? (
        <div className="border-border bg-card text-muted-foreground flex flex-col items-center gap-2 rounded-xl border p-10 text-center text-sm">
          <AlertTriangle className="text-success size-8" />
          אין כרגע מוצרים שסומנו לטיפול דחוף
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <div key={item.id} className="border-destructive/30 bg-card flex items-center gap-3 rounded-xl border p-3">
              <span className="bg-destructive/10 text-destructive flex size-11 shrink-0 items-center justify-center rounded-lg">
                <Package className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.product.title}</p>
                <p className="text-muted-foreground text-xs">
                  {item.product.brand.name} · {item.product.category.name} · מק&quot;ט {item.product.sku} · במלאי{" "}
                  {item.product.stockQty}
                </p>
                <p className="text-muted-foreground mt-0.5 text-xs">סומן {formatDateTime(item.createdAt)}</p>
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
