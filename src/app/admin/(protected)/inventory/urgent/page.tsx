import Link from "next/link";
import { AlertTriangle, Package, ExternalLink } from "lucide-react";
import { getAttentionProducts } from "@/lib/queries/admin-inventory";
import { InventoryTabs } from "@/components/admin/inventory-tabs";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "טיפול | A&I Electronics Admin" };

// Three sources feed this list, and the difference between them is what
// the admin needs to see first:
//  - URGENT_MISSING_MEDIA — no photo and no spec; also unpublished
//  - MISSING_IMAGE — no photo, has a spec; still published, but off the
//    site all the same since PUBLIC_PRODUCT_WHERE requires an image
//  - NEW_FROM_SOURCE — the sheet just created it; nothing but stock is known
//  - MANUAL_ATTENTION — flagged by hand, a plain to-do marker
// Neither of the first two is on the site: a photo is what brings either
// back. The split says how much is missing, not whether it is visible.
const ROW_KIND = {
  NEW_FROM_SOURCE: { label: "מוצר חדש מהגיליון", tone: "bg-brand/10 text-brand" },
  URGENT_MISSING_MEDIA: { label: "אין תמונה ואין מפרט", tone: "bg-destructive/10 text-destructive" },
  MISSING_IMAGE: { label: "חסרה תמונה", tone: "bg-warning/15 text-warning-foreground" },
  MANUAL_ATTENTION: { label: "סומן ידנית", tone: "bg-muted text-muted-foreground" },
} as const;

export default async function AttentionInventoryPage() {
  const items = await getAttentionProducts();
  const hidden = items.filter((i) => i.type === "URGENT_MISSING_MEDIA").length;
  const photoless = items.filter((i) => i.type === "MISSING_IMAGE").length;
  const manual = items.filter((i) => i.type === "MANUAL_ATTENTION").length;
  const arrivals = items.filter((i) => i.type === "NEW_FROM_SOURCE").length;

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">מרכז בקרת מלאי</h1>
      <InventoryTabs />

      <div className="mb-4 flex items-center gap-2">
        <AlertTriangle className="text-warning-foreground size-5" />
        <h2 className="text-lg font-bold">טיפול</h2>
        <span className="text-muted-foreground text-sm">({items.length.toLocaleString("he-IL")})</span>
      </div>
      <p className="text-muted-foreground mb-3 text-sm">
        כל מוצר שנמצא במלאי וחסרה לו תמונה, בתוספת מוצרים שסומנו ידנית לטיפול מדף המוצר. מוצר בלי תמונה לא מוצג
        באתר — לא ברשימות, לא בחיפוש ולא בדף המוצר — ויחזור לתצוגה מיד כשתוסיפו לו תמונה. מוצר שסומן ידנית יורד
        מהרשימה רק כשתסירו את הסימון מדף המוצר.
      </p>
      <div className="mb-5 flex flex-wrap gap-2 text-xs">
        <span className="bg-brand/10 text-brand rounded-full px-3 py-1 font-medium">
          חדשים מהגיליון: {arrivals.toLocaleString("he-IL")}
        </span>
        <span className="bg-destructive/10 text-destructive rounded-full px-3 py-1 font-medium">
          לא באתר — אין תמונה ואין מפרט: {hidden.toLocaleString("he-IL")}
        </span>
        <span className="bg-warning/15 text-warning-foreground rounded-full px-3 py-1 font-medium">
          לא באתר — חסרה תמונה בלבד: {photoless.toLocaleString("he-IL")}
        </span>
        <span className="bg-muted text-muted-foreground rounded-full px-3 py-1 font-medium">
          סומנו ידנית: {manual.toLocaleString("he-IL")}
        </span>
      </div>

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
                <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                  <span
                    className={`rounded-full px-2 py-0.5 font-medium ${
                      ROW_KIND[item.type as keyof typeof ROW_KIND]?.tone ?? "bg-muted text-muted-foreground"
                    }`}
                  >
                    {ROW_KIND[item.type as keyof typeof ROW_KIND]?.label ?? item.type}
                  </span>
                  {formatDateTime(item.createdAt)}
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
