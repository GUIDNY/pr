import { requireCatalogPage } from "@/lib/auth";
import { InventoryTabs } from "@/components/admin/inventory-tabs";
import { InventoryListTable } from "@/components/admin/inventory-list-table";
import { getNewInPriceList } from "@/lib/queries/inventory-control";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "מוצרים חדשים מהסנכרון | Buy Today Admin" };

/**
 * What the price list has just produced, and which cannot be sold yet.
 *
 * The list is "still flagged NEW_FROM_SOURCE", not "created in the last
 * day". 33 products arrived in a single run on 11 October because four tabs
 * had not been read for 35 days, and a 24-hour window would have shown them
 * once and then hidden a backlog nobody had worked through. The flag closes
 * when somebody deals with the product, which is the right clock.
 *
 * And it is now "still flagged AND still not on the site". The flag is
 * cleared by reconcileNewFromSource, which runs inside a sync, and a sync is
 * pressed by hand — so every other way a product goes live left its entry
 * standing. 59 of the 180 this page was counting as waiting were already
 * being sold. That is how it came to read 180 beside the off-site page's
 * 160 while sharing only 108 products with it: two numbers that could not
 * both be true, and the owner read them side by side and said so.
 * getNewInPriceList asks PUBLIC_PRODUCT_WHERE directly now, so the count
 * cannot outlive the work again.
 *
 * And it has stock, which closed the last gap. 20 of these had none — a
 * Bosch oven out of stock since 5 October among them — and they were the
 * entire difference between this tab and "למה לא באתר". The owner's rule,
 * said three times: no stock means the product does not exist, so it is
 * not work. Their queue entry stays open, so one whose stock comes back
 * reappears here on its own. The two tabs now count the same population.
 */
export default async function NewFromSyncPage() {
  await requireCatalogPage();
  const { rows, fromLastSync, total } = await getNewInPriceList(300);

  return (
    <div>
      <h1 className="text-2xl font-bold">מוצרים חדשים מהסנכרון</h1>
      <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
        הגיעו מהמחירון, יש להם מלאי, ועוד לא מוכנים למכירה: השם הוא הטקסט הגולמי מהגיליון, ואין תמונה, תיאור או
        מפרט. השורה יוצאת מהרשימה ברגע שהמוצר באתר — נבדק מול האתר עצמו ולא מול סימון, כדי שהמספר לא יישאר תקוע
        אחרי שהעבודה נעשתה. כולם נמצאים גם ב״למה לא באתר״, ושני המספרים זהים.
      </p>
      <InventoryTabs />
      <p className="text-muted-foreground mb-3 text-sm">
        {/* total, not rows.length. The take is 300, so a backlog of 350 read
            as exactly "300 waiting" — a number that happens to equal the
            limit is a number that is telling you about the limit. */}
        {total.toLocaleString("he-IL")} מוצרים ממתינים
        {total > rows.length && (
          <> · מוצגים {rows.length.toLocaleString("he-IL")} הראשונים</>
        )}
        {fromLastSync > 0 && (
          <>
            {" · "}
            <strong className="text-foreground">{fromLastSync}</strong> מהסנכרון האחרון
          </>
        )}
      </p>
      <InventoryListTable
        rows={rows}
        empty="אין מוצרים חדשים שמחכים. כל מה שהמחירון הביא טופל."
        columnLabel="נוצר"
        column={(p) => {
          const row = rows.find((r) => r.id === p.id);
          return (
            <span className="flex flex-wrap items-center gap-2">
              {row?.fromLastSync && (
                <span className="bg-brand/10 text-brand rounded px-1.5 py-0.5 text-xs font-bold">
                  הסנכרון האחרון
                </span>
              )}
              <span className="text-muted-foreground">{formatDateTime(p.createdAt)}</span>
            </span>
          );
        }}
      />
    </div>
  );
}
