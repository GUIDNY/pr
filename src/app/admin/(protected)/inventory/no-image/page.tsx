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
 * So every row here is in stock, in the price list, and off the site for
 * one missing thing.
 *
 * It used to show only the published ones, which was 52 of 184. The other
 * 132 were on no tab in the whole back office — not new, not a problem,
 * not on the site — and they were exactly the 132 missing from "1,494 in
 * stock" when you added the tabs up. They are here now, marked, because
 * needing a photograph is the same work either way.
 */
export default async function NoImagePage() {
  await requireCatalogPage();
  const rows = await getMissingImage(300);
  const value = rows.reduce((sum, p) => sum + p.price * p.stockQty, 0);
  const unpublished = rows.filter((p) => p.unpublished).length;

  return (
    <div>
      <h1 className="text-2xl font-bold">מוצרים ללא תמונה</h1>
      <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
        לכולם יש מלאי והם במחירון, ולאף אחד מהם אין תמונה של עצמו — ולכן אף אחד מהם לא מופיע באתר. העמודה אומרת מה
        חסר: ברובם <strong className="text-foreground">רק תמונה</strong>, והם עולים לאתר ברגע שהיא נוספת. בשאר חסרה
        גם לחיצה על <strong className="text-foreground">פרסום</strong> בעמוד המוצר.
      </p>
      <InventoryTabs />
      <p className="text-muted-foreground mb-3 text-sm">
        {rows.length.toLocaleString("he-IL")} מוצרים · {value.toLocaleString("he-IL")} ₪ מלאי שלא ניתן למכור ·{" "}
        <strong className="text-foreground">{unpublished.toLocaleString("he-IL")}</strong> מהם צריכים גם פרסום
      </p>
      <InventoryListTable
        rows={rows}
        empty="לכל המוצרים במלאי יש תמונה."
        columnLabel="מה חסר"
        column={(p) => {
          const row = rows.find((r) => r.id === p.id);
          if (!row) return null;
          return row.unpublished ? (
            <span className="bg-destructive/10 text-destructive rounded px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap">
              תמונה + פרסום
            </span>
          ) : (
            <span className="text-muted-foreground text-xs whitespace-nowrap">תמונה בלבד</span>
          );
        }}
      />
    </div>
  );
}
