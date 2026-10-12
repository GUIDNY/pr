import { requireCatalogPage } from "@/lib/auth";
import { InventoryTabs } from "@/components/admin/inventory-tabs";
import { InventoryListTable } from "@/components/admin/inventory-list-table";
import {
  getMissingImage,
  IMAGE_BLOCKER_LABELS,
  IMAGE_BLOCKER_HINTS,
  type ImageBlocker,
} from "@/lib/queries/inventory-control";

export const metadata = { title: "מוצרים ללא תמונה | Buy Today Admin" };

const ORDER: ImageBlocker[] = [
  "PHOTO",
  "PHOTO_AND_REVIEW",
  "PHOTO_AND_CONTENT",
  "PHOTO_AND_PUBLISH",
  "PHOTO_AND_CONFLICT",
];

/**
 * Products the shop believes it is selling and no customer can see.
 *
 * PUBLIC_PRODUCT_WHERE requires an image — store policy, because the card
 * and the gallery both used to fall back to a coloured square with a
 * category icon standing in for the thing somebody was being asked to buy.
 * So every row here is in stock, in the price list, and off the site.
 *
 * The right-hand column says what is missing *besides* the photograph,
 * because it is not the same job on every row and saying "photo +
 * publish" on all 139 unpublished ones was wrong: 91 have never been
 * enriched, and pressing publish on those would put a page carrying the
 * sheet's raw "{brand} {model}" in front of a customer the moment a photo
 * landed. The summary below is ordered by how close each group is to the
 * site.
 */
export default async function NoImagePage() {
  await requireCatalogPage();
  const rows = await getMissingImage(300);
  const value = rows.reduce((sum, p) => sum + p.price * p.stockQty, 0);

  const groups = ORDER.map((blocker) => {
    const mine = rows.filter((r) => r.blocker === blocker);
    return {
      blocker,
      count: mine.length,
      value: mine.reduce((s, r) => s + r.price * r.stockQty, 0),
    };
  }).filter((g) => g.count > 0);

  return (
    <div>
      <h1 className="text-2xl font-bold">מוצרים ללא תמונה</h1>
      <p className="text-muted-foreground mt-1 max-w-3xl text-sm">
        לכולם יש מלאי והם במחירון, ולאף אחד מהם אין תמונה של עצמו — ולכן אף אחד מהם לא מופיע באתר. הסכום הוא מחיר כפול
        כמות: מלאי שיושב במחסן ואף לקוח לא יכול לקנות. העמודה בצד אומרת מה חסר <em>חוץ מהתמונה</em>, וזה לא אותו דבר
        בכל שורה.
      </p>

      <InventoryTabs />

      <section className="border-border mb-5 overflow-hidden rounded-xl border">
        <header className="bg-muted/50 border-border border-b px-4 py-3 text-sm">
          <strong>{rows.length.toLocaleString("he-IL")} מוצרים</strong> ·{" "}
          {value.toLocaleString("he-IL")} ₪ מלאי שלא ניתן למכור
        </header>
        <table className="w-full text-sm">
          <tbody>
            {groups.map((g) => (
              <tr key={g.blocker} className="border-border border-t first:border-t-0">
                <td className="p-3 font-semibold whitespace-nowrap">{g.count.toLocaleString("he-IL")}</td>
                <td className="p-3 font-medium whitespace-nowrap">{IMAGE_BLOCKER_LABELS[g.blocker]}</td>
                <td className="text-muted-foreground p-3 text-xs">{IMAGE_BLOCKER_HINTS[g.blocker]}</td>
                <td className="text-muted-foreground p-3 text-xs whitespace-nowrap">
                  {g.value.toLocaleString("he-IL")} ₪
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <InventoryListTable
        rows={rows}
        empty="לכל המוצרים במלאי יש תמונה."
        columnLabel="מה חסר"
        column={(p) => {
          const row = rows.find((r) => r.id === p.id);
          if (!row) return null;
          return (
            <span
              className={`rounded px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap ${
                row.blocker === "PHOTO"
                  ? "text-muted-foreground"
                  : row.blocker === "PHOTO_AND_CONFLICT"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {IMAGE_BLOCKER_LABELS[row.blocker]}
            </span>
          );
        }}
      />
    </div>
  );
}
