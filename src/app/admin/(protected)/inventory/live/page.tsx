import { requireCatalogPage } from "@/lib/auth";
import { InventoryTabs } from "@/components/admin/inventory-tabs";
import { InventoryListTable } from "@/components/admin/inventory-list-table";
import { ExportLiveProductsButton } from "@/components/admin/export-live-products-button";
import { getLiveProducts } from "@/lib/queries/inventory-control";

export const metadata = { title: "מוצרים באתר | Buy Today Admin" };

/**
 * What the shop is actually selling, as a list and as a file.
 *
 * Every other tab here answers "what is wrong". This one answers "what is
 * right", and it did not exist: the summary bar says 1,624 products have
 * stock, the site serves 1,225, and the only way to see the second set was
 * to ask for it to be measured. A number nobody can open is a number nobody
 * can check.
 *
 * The export carries the sale price and the supplier's cost side by side,
 * which is the pair that makes the file worth having and also the reason it
 * never leaves the back office — requireCatalogPage gates the page and the
 * action re-checks on its own, because a server action is an endpoint and
 * the page deciding what to render is not the same as deciding what may
 * happen.
 */
export default async function LiveProductsPage() {
  await requireCatalogPage();
  const rows = await getLiveProducts();
  const retail = rows.reduce((sum, p) => sum + p.price * p.stockQty, 0);
  const cost = rows.reduce((sum, p) => sum + (p.supplierCost ?? 0) * p.stockQty, 0);
  const withCost = rows.filter((p) => p.supplierCost !== null && p.supplierCost > 0).length;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">מוצרים באתר</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            כל מה שלקוח יכול לקנות עכשיו — מפורסם, במלאי, עם תמונה, עם מחיר, ועדיין במחירון. אותו תנאי בדיוק שהחנות,
            החיפוש והפיד של גוגל קוראים, ולא העתק שלו.
          </p>
        </div>
        <ExportLiveProductsButton count={rows.length} />
      </div>

      <InventoryTabs />

      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="text-foreground font-semibold">{rows.length.toLocaleString("he-IL")} מוצרים</span>
        <span className="text-muted-foreground">
          שווי מלאי במחירי מכירה {retail.toLocaleString("he-IL")} ₪
        </span>
        {cost > 0 && (
          <span className="text-muted-foreground">
            בעלות {cost.toLocaleString("he-IL")} ₪
          </span>
        )}
        {withCost < rows.length && (
          /* Said out loud rather than folded into the total: a margin
             computed over products whose cost we do not have is a margin
             that reads better than it is. */
          <span className="text-muted-foreground">
            ({(rows.length - withCost).toLocaleString("he-IL")} בלי עלות ידועה)
          </span>
        )}
      </div>

      <InventoryListTable rows={rows} empty="אין כרגע מוצרים באתר." />
    </div>
  );
}
