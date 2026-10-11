import { requireCatalogPage } from "@/lib/auth";
import { InventoryTabs } from "@/components/admin/inventory-tabs";
import { InventoryListTable } from "@/components/admin/inventory-list-table";
import { getMissingImage } from "@/lib/queries/inventory-control";

export const metadata = { title: "מוצרים ללא תמונה | Buy Today Admin" };

/**
 * Products the shop believes it is selling and no customer can see.
 *
 * PUBLIC_PRODUCT_WHERE requires an image — store policy, because the card
 * and the gallery both used to fall back to a coloured square with a
 * category icon standing in for the thing somebody was being asked to buy.
 * So every row here is published, in stock, in the price list, and off the
 * site for exactly one missing thing.
 */
export default async function NoImagePage() {
  await requireCatalogPage();
  const rows = await getMissingImage(300);
  const value = rows.reduce((sum, p) => sum + p.price * p.stockQty, 0);

  return (
    <div>
      <h1 className="text-2xl font-bold">מוצרים ללא תמונה</h1>
      <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
        מפורסמים, במלאי, ובמחירון — ולא מופיעים באתר, כי מוצר בלי תמונה של עצמו לא מוצג. תמונה אחת מחזירה כל אחד מהם
        לאתר מיד, בלי סנכרון ובלי פרסום מחדש.
      </p>
      <InventoryTabs />
      <p className="text-muted-foreground mb-3 text-sm">
        {rows.length.toLocaleString("he-IL")} מוצרים · {value.toLocaleString("he-IL")} ₪ מלאי שלא ניתן למכור
      </p>
      <InventoryListTable rows={rows} empty="לכל המוצרים במלאי יש תמונה." />
    </div>
  );
}
