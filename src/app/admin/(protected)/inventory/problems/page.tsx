import Link from "next/link";
import { requireCatalogPage } from "@/lib/auth";
import { InventoryTabs } from "@/components/admin/inventory-tabs";
import { InventoryListTable } from "@/components/admin/inventory-list-table";
import {
  getOffSiteProducts,
  getDuplicatePairs,
  getRowCollisions,
  OFF_SITE_LABELS,
  OFF_SITE_ACTIONS,
} from "@/lib/queries/inventory-control";
import { inspectNonPriceListProducts } from "@/actions/inventory-purge";
import { PurgeNonPriceListPanel } from "@/components/admin/purge-non-price-list-panel";
import { OffSiteRowActions } from "@/components/admin/off-site-row-actions";
import { cn } from "@/lib/utils";

export const metadata = { title: "למה לא באתר | Buy Today Admin" };

/**
 * Every product with stock that is not on the site, and why.
 *
 * This replaced a page called "problem products", which listed the two
 * faults somebody had decided were faults — no price, untrustworthy stock
 * — and said nothing about the other 198 products in stock that no
 * customer could see. The owner's question was not "what is broken", it
 * was "1,494 in stock, 1,271 on the site, where are the rest" — and six
 * overlapping tabs could not answer it. A product can be in the photo
 * queue and the new-arrivals queue at once, so adding the tabs up came out
 * higher than the total while 132 products sat on no tab at all.
 *
 * So: one reason per product, the first that applies, and the numbers
 * close. ON_SITE is tested with PUBLIC_PRODUCT_WHERE itself, which is what
 * makes the arithmetic in the header true rather than approximately true.
 */
export default async function OffSitePage() {
  await requireCatalogPage();
  const [{ rows, inStock, onSite, byReason, twins }, leftovers, duplicates, subtotals] = await Promise.all([
    getOffSiteProducts(),
    /* Products with no price list behind them at all. Not in the list below
       — they are not a product that is off the site, they are a product
       with no source — so they get the panel above it instead. */
    inspectNonPriceListProducts("NO_PRICE_LIST"),
    /* The same product in two records, because the supplier renumbered its
       row. Its own section rather than a flag on a row, because the thing a
       person needs to see is the pair: which half holds the images and the
       public URL, and which one the price list now points at. */
    getDuplicatePairs(60),
    /* And the records that are not products at all. A separate panel from
       the one above: different evidence, different reason, and two
       irreversible deletions behind one press is how the wrong one
       happens. */
    inspectNonPriceListProducts("SUBTOTAL_ROW"),
  ]);
  /* Every row of the price list that two records point at, judged by the
     row and not by the models — see getRowCollisions. Below the list
     rather than above it: most are ordinary supplier turnover and cost
     nothing, and the few that are real duplicates are at the top of their
     own section by what they have stranded. */
  const collisions = await getRowCollisions(200);
  /* Of 69 row collisions on 14 October, one is the same product on both
     sides. The other 68 are the supplier putting a different product on a
     row it had finished with, and the old record still pointing at it is
     bookkeeping nobody cleared — findExistingProduct drops a claimant that
     has left the price list, so the sync does not look at them either.
     Shown as a count rather than a table: the owner opened this page, read
     68 rows of working-as-intended ranked by a number that cannot be money,
     and asked what the hell it was. He was right. */
  const sameProduct = collisions.filter((c) => c.sameProduct);
  const turnover = collisions.length - sameProduct.length;

  const newInQueue = rows.filter((r) => r.isNew).length;

  return (
    <div>
      <h1 className="text-2xl font-bold">למה לא באתר</h1>
      <p className="text-muted-foreground mt-1 max-w-3xl text-sm">
        כל מוצר שאפשר למכור — יש לו מלאי או שהוא במחירון ולא אזל — ואי אפשר לקנות אותו באתר, עם הסיבה האחת שעוצרת אותו. סיבה אחת לכל מוצר — זו
        שצריך לטפל בה ראשונה — ולכן המספרים כאן מתחברים בדיוק לכל מה שניתן למכירה, בלי כפל ובלי מוצר שנופל בין הדפים.{" "}
        <strong className="text-foreground">״למה?״</strong> פותח את הנימוק המלא, ו-
        <strong className="text-foreground">״אשר ופרסם״</strong> מבטל את הסימון ומעלה את המוצר לאתר — רק במקרים שבהם
        הסימון הוא הדבר האחרון שחסר.
      </p>

      <InventoryTabs />

      {/* The arithmetic, stated. This is the whole point of the page: the
          headline number on the dashboard minus what is live equals this
          list, and every line below is part of the difference. */}
      <section className="border-border mb-5 overflow-hidden rounded-xl border">
        <div className="divide-border flex flex-wrap divide-x divide-x-reverse">
          <div className="min-w-36 flex-1 p-4">
            <p className="text-muted-foreground text-xs">ניתן למכירה</p>
            <p className="mt-0.5 text-2xl font-bold">{inStock.toLocaleString("he-IL")}</p>
          </div>
          <div className="min-w-36 flex-1 p-4">
            <p className="text-muted-foreground text-xs">מתוכם באתר</p>
            <p className="text-success-foreground mt-0.5 text-2xl font-bold">
              {onSite.toLocaleString("he-IL")}
            </p>
          </div>
          <div className="min-w-36 flex-1 p-4">
            <p className="text-muted-foreground text-xs">לא באתר — הרשימה הזו</p>
            <p className="text-destructive mt-0.5 text-2xl font-bold">
              {rows.length.toLocaleString("he-IL")}
            </p>
          </div>
        </div>
        <table className="border-border w-full border-t text-sm">
          <tbody>
            {byReason.map((g) => (
              <tr key={g.reason} className="border-border border-t first:border-t-0">
                <td className="p-3 font-semibold whitespace-nowrap">{g.count.toLocaleString("he-IL")}</td>
                <td className="p-3 font-medium whitespace-nowrap">{OFF_SITE_LABELS[g.reason]}</td>
                <td className="text-muted-foreground p-3 text-xs">{OFF_SITE_ACTIONS[g.reason]}</td>
                <td className="text-muted-foreground p-3 text-xs whitespace-nowrap">
                  {g.value.toLocaleString("he-IL")} ₪
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-muted-foreground bg-muted/40 border-border border-t px-4 py-3 text-xs">
          {newInQueue.toLocaleString("he-IL")} מהם מופיעים גם בלשונית{" "}
          <Link href="/admin/inventory/new" className="underline">
            מוצרים חדשים מהסנכרון
          </Link>{" "}
          — זו לא סיבה נוספת אלא תג על אותם מוצרים, ולכן אסור לחבר את שתי הלשוניות.
        </p>
      </section>

      <PurgeNonPriceListPanel initial={leftovers} target="NO_PRICE_LIST" />

      <PurgeNonPriceListPanel initial={subtotals} target="SUBTOTAL_ROW" />

      {duplicates.length > 0 && (
        <section className="border-border mb-5 overflow-hidden rounded-xl border">
          <header className="bg-muted/50 border-border border-b px-4 py-3">
            <h2 className="text-base font-bold">
              כפילויות שדורשות הכרעה{" "}
              <span className="bg-background border-border rounded-full border px-2 py-0.5 text-xs font-semibold">
                {duplicates.length}
              </span>
            </h2>
            <p className="text-muted-foreground mt-1 max-w-3xl text-sm">
              כפילות רגילה כבר לא מגיעה לכאן — הסנכרון משאיר את הרשומה שמחזיקה את השורה ומוריד את השנייה, לבד. מה
              שנשאר כאן הוא המקרה היחיד שהוא מסרב להכריע בו:{" "}
              <strong className="text-foreground">יותר מרשומה אחת פעילה מתאימה לאותו דגם</strong>, ואז בחירה היא
              הגרלה. בדרך כלל אלה גוונים אמיתיים — אותו תנור מילה באפור, בשחור ובנירוסטה — ומיזוג שלהם הוא מחיקה של
              מוצר שאתם מוכרים. צריך עין אנושית.
            </p>
          </header>
          <table className="w-full text-sm">
            <thead className="text-muted-foreground">
              <tr className="border-border border-b">
                <th className="p-3 text-start font-semibold">דגם</th>
                <th className="p-3 text-start font-semibold">הרשומה שהתייתמה</th>
                <th className="p-3 text-start font-semibold">הרשומה שמחזיקה את השורה</th>
                <th className="p-3 text-start font-semibold whitespace-nowrap">מלאי כפול</th>
              </tr>
            </thead>
            <tbody>
              {duplicates.map((d) => (
                <tr key={d.orphan.id} className="border-border border-t">
                  <td className="p-3 font-mono text-xs whitespace-nowrap">{d.model}</td>
                  <td className="p-3">
                    <Link href={`/admin/products/${d.orphan.id}`} className="font-medium hover:underline">
                      {d.orphan.title.slice(0, 34)}
                    </Link>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      מק״ט {d.orphan.sku} · {d.orphan.stockQty} יח׳
                      {d.orphan.colour && ` · ${d.orphan.colour}`} ·{" "}
                      {d.orphan.images > 0 ? (
                        <span className="text-success-foreground font-semibold">{d.orphan.images} תמונות</span>
                      ) : (
                        "אין תמונה"
                      )}
                      {d.orphan.enriched && " · מועשר"}
                    </p>
                  </td>
                  <td className="p-3">
                    <Link href={`/admin/products/${d.live.id}`} className="font-medium hover:underline">
                      {d.live.title.slice(0, 34)}
                    </Link>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      מק״ט {d.live.sku} · {d.live.stockQty} יח׳
                      {d.live.colour && ` · ${d.live.colour}`} ·{" "}
                      {d.live.images > 0 ? `${d.live.images} תמונות` : "אין תמונה"}
                      {d.live.quarantined && (
                        <span className="text-destructive font-semibold"> · סומן לא לפרסם</span>
                      )}
                    </p>
                  </td>
                  <td className="p-3 whitespace-nowrap">{d.ghostValue.toLocaleString("he-IL")} ₪</td>
                </tr>
              ))}
            </tbody>
          </table>
          {turnover > 0 && (
            <p className="text-muted-foreground border-border border-t px-4 py-3 text-xs">
              בנוסף, {turnover.toLocaleString("he-IL")} רשומות ישנות עדיין מצביעות על שורה שהספק מאז החליף — הן
              יצאו מהמחירון באמת, והסנכרון כבר מתעלם מהן. אין בהן מה לעשות.
            </p>
          )}
        </section>
      )}

      {(twins.length > 0 || sameProduct.length > 0) && (
        <section className="border-border mt-6 mb-5 overflow-hidden rounded-xl border">
          <header className="bg-muted/50 border-border border-b px-4 py-3">
            <h2 className="text-base font-bold">
              אותו מוצר, שתי רשומות — מלאי שאי אפשר למכור{" "}
              <span className="bg-background border-border rounded-full border px-2 py-0.5 text-xs font-semibold">
                {twins.length + sameProduct.length}
              </span>
            </h2>
            <p className="text-muted-foreground mt-1 max-w-3xl text-sm">
              אותו דגם בשתי רשומות: אחת מוכרת באתר, השנייה לא — והמלאי שלה אמיתי, המחירון עדיין מעדכן אותו.
              זה מלאי שיושב בחנות ואף אחד לא יכול לקנות, ולפעמים במחיר אחר לגמרי מהתאום שכן באתר.
              <strong className="text-foreground"> העמודה ׳למה לא באתר׳ אומרת מה חוסם כל אחת.</strong>
            </p>
          </header>
          <table className="w-full text-sm">
            <thead className="text-muted-foreground">
              <tr className="border-border border-b">
                <th className="p-3 text-start font-semibold">לא באתר</th>
                <th className="p-3 text-start font-semibold whitespace-nowrap">למה לא באתר</th>
                <th className="p-3 text-start font-semibold">התאום שכן באתר</th>
                <th className="p-3 text-start font-semibold whitespace-nowrap">תקוע</th>
              </tr>
            </thead>
            <tbody>
              {twins.map((t) => (
                <tr key={t.offSite.id} className={cn("border-border border-t", t.alreadyMerged && "opacity-55")}>
                  <td className="p-3">
                    <Link href={`/admin/products/${t.offSite.id}`} className="font-medium hover:underline">
                      {t.offSite.title.slice(0, 44)}
                    </Link>
                    {t.alreadyMerged && (
                      <span className="bg-success/15 text-success ms-2 rounded-full px-2 py-0.5 text-xs font-medium">
                        כבר מוזג
                      </span>
                    )}
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      מק״ט {t.offSite.sku} · {t.offSite.stockQty} יח׳ ·{" "}
                      {t.offSite.price.toLocaleString("he-IL")} ₪
                    </p>
                  </td>
                  <td className="p-3 align-top">
                    <span className="bg-accent text-accent-foreground rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap">
                      {OFF_SITE_LABELS[t.offSite.reason]}
                    </span>
                    <p className="text-muted-foreground mt-1 max-w-[18rem] text-xs">
                      {OFF_SITE_ACTIONS[t.offSite.reason]}
                    </p>
                  </td>
                  <td className="p-3">
                    <Link href={`/admin/products/${t.live.id}`} className="font-medium hover:underline">
                      {t.live.title.slice(0, 40)}
                    </Link>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      מק״ט {t.live.sku} · {t.live.stockQty} יח׳ ·{" "}
                      <span className={cn(t.live.price !== t.offSite.price && "text-warning-foreground font-semibold")}>
                        {t.live.price.toLocaleString("he-IL")} ₪
                      </span>
                    </p>
                  </td>
                  <td className="p-3 font-semibold whitespace-nowrap tabular-nums">
                    {t.strandedValue.toLocaleString("he-IL")} ₪
                  </td>
                </tr>
              ))}
              {sameProduct.map((c) => (
                <tr key={c.dropped.id} className="border-border border-t">
                  <td className="p-3">
                    <Link href={`/admin/products/${c.dropped.id}`} className="font-medium hover:underline">
                      {c.dropped.title.slice(0, 44)}
                    </Link>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      מק״ט {c.dropped.sku} · {c.dropped.stockQty} יח׳ ·{" "}
                      {c.dropped.price.toLocaleString("he-IL")} ₪
                    </p>
                  </td>
                  <td className="p-3 align-top">
                    <span className="bg-accent text-accent-foreground rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap">
                      יצא מהמחירון
                    </span>
                    <p className="text-muted-foreground mt-1 max-w-[18rem] text-xs">
                      {c.sheetName} · שורה {c.rowRef} — הרשומה השנייה מחזיקה את השורה. ניקוי בלבד.
                    </p>
                  </td>
                  <td className="p-3">
                    <Link href={`/admin/products/${c.holder.id}`} className="font-medium hover:underline">
                      {c.holder.title.slice(0, 40)}
                    </Link>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      מק״ט {c.holder.sku} · {c.holder.stockQty} יח׳ ·{" "}
                      {c.holder.price.toLocaleString("he-IL")} ₪
                    </p>
                  </td>
                  <td className="text-muted-foreground p-3 whitespace-nowrap tabular-nums">
                    {c.lastReportedValue.toLocaleString("he-IL")} ₪
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <InventoryListTable
        rows={rows}
        empty="כל מה שבמלאי מופיע באתר."
        columnLabel="הסיבה"
        column={(p) => {
          const row = rows.find((r) => r.id === p.id);
          if (!row) return null;
          return (
            <div className="flex flex-col gap-1">
              <span className="flex flex-wrap items-center gap-1">
                <span
                  className={`rounded px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap ${
                    row.reason === "NO_PRICE" || row.reason === "DO_NOT_PUBLISH"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {OFF_SITE_LABELS[row.reason]}
                </span>
                {row.isNew && <span className="text-muted-foreground text-xs">חדש מהסנכרון</span>}
              </span>
              {(row.why.length > 0 || row.canPublish) && (
                <OffSiteRowActions productId={row.id} why={row.why} canPublish={row.canPublish} />
              )}
            </div>
          );
        }}
      />
    </div>
  );
}
