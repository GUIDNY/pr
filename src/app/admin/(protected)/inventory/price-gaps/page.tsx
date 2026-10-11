import Link from "next/link";
import { requireCatalogPage } from "@/lib/auth";
import { InventoryTabs } from "@/components/admin/inventory-tabs";
import { getPriceGaps } from "@/lib/queries/inventory-control";
import { formatPrice } from "@/lib/format";
import { AlertTriangle, ExternalLink, CheckCircle2 } from "lucide-react";

export const metadata = { title: "בעיית מחיר | Buy Today Admin" };

/**
 * Where the price on the site and the price in the price list disagree.
 *
 * Read-only, and that is the whole design. The sync is not allowed to write
 * a price to a product that already exists — the rule that stopped a
 * morning's corrections being gone by the next morning — so it had been
 * reporting "289 price changes" a day for a fortnight while applying none
 * of them, and nothing anywhere showed a person the list. These are the
 * differences it spotted and left alone. The owner settles them: "that is
 * something I decide, not an automatic action."
 *
 * The sheet's figure is the second-lowest of its price columns, which is
 * the shop's selling price by the owner's own description — the lowest is
 * the cost, the one above it is what we sell at.
 *
 * And the first column of flags is not decoration. Of 146 live differences
 * measured on 11 October, 60 were products bound to another product's row:
 * a ₪590 gas cooktop was reading the row of a ₪3,100 induction cooktop.
 * Taking the sheet's price on one of those would put a different product's
 * price on a live page, so they are called out and sorted to the top.
 */
export default async function PriceGapsPage() {
  await requireCatalogPage();
  const gaps = await getPriceGaps(300);
  const contradicted = gaps.filter((g) => g.rowContradictsProduct).length;
  /* "Waiting for you" is anything the sync will not settle: a price a person
     chose, and a price the sheet offers below its own cost. Counting only the
     first would promise that 27 rows close by themselves when they cannot. */
  const manual = gaps.filter((g) => g.priceIsManual).length;
  const sheetBelowCost = gaps.filter((g) => !g.priceIsManual && g.sheetPriceBelowCost).length;
  const waiting = manual + sheetBelowCost;

  return (
    <div>
      <h1 className="text-2xl font-bold">מוצרים עם בעיית מחיר</h1>
      <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
        המחירון אומר מחיר אחד והאתר מציג אחר.{" "}
        <strong className="text-foreground">מוצר שאף אדם לא תמחר — המחירון מנהל אותו</strong>, והפער הזה ייסגר לבד
        בסנכרון הבא. מוצר שתמחרת ידנית הוא שלך: הסינק לא יגע בו, והמספר מהמחירון הוא הצעה בלבד. שינוי נעשה במסך
        המחירים, עם אישור כפול.
      </p>

      <InventoryTabs />

      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted-foreground">{gaps.length.toLocaleString("he-IL")} פערים</span>
        <span className="text-muted-foreground">
          {(gaps.length - waiting).toLocaleString("he-IL")} ייסגרו לבד בסנכרון הבא
        </span>
        {waiting > 0 && (
          <span className="text-foreground font-semibold">{waiting} מחכים להחלטה שלך</span>
        )}
        {sheetBelowCost > 0 && (
          <span className="text-destructive font-semibold">
            {sheetBelowCost} מהם המחירון עצמו מתחת לעלות
          </span>
        )}
        {contradicted > 0 && (
          <span className="text-destructive font-semibold">
            {contradicted} מהם שורה של מוצר אחר — לא לאמץ את המחיר
          </span>
        )}
        <Link href="/admin/prices" className="text-brand ms-auto text-sm font-bold hover:underline">
          מסך המחירים ←
        </Link>
      </div>

      {gaps.length === 0 ? (
        <p className="text-muted-foreground border-border flex items-center gap-2 rounded-xl border px-4 py-8 text-sm">
          <CheckCircle2 className="text-success size-4 shrink-0" />
          המחיר באתר תואם למחירון בכל המוצרים.
        </p>
      ) : (
        <div className="border-border overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-muted-foreground">
              <tr>
                <th className="p-3 text-start font-semibold">מוצר</th>
                <th className="p-3 text-start font-semibold whitespace-nowrap">באתר</th>
                <th className="p-3 text-start font-semibold whitespace-nowrap">במחירון</th>
                <th className="p-3 text-start font-semibold whitespace-nowrap">הפרש</th>
                <th className="p-3 text-start font-semibold whitespace-nowrap">עלות</th>
                <th className="p-3 text-start font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {gaps.map((g) => {
                const diff = g.sheetPrice - g.product.price;
                return (
                  <tr
                    key={g.product.id}
                    className={`border-border border-t ${g.rowContradictsProduct ? "bg-destructive/5" : ""}`}
                  >
                    <td className="p-3">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0">
                          <p className="line-clamp-2 font-medium">{g.product.title}</p>
                          <p className="text-muted-foreground mt-0.5 text-xs">
                            {g.product.category && (
                              <span className="text-foreground/70 font-medium">{g.product.category} · </span>
                            )}
                            מק״ט {g.product.sku}
                            {g.product.sheet && <span> · {g.product.sheet.trim()}</span>}
                          </p>
                        </div>
                        <Link
                          href={`/admin/products/${g.product.id}`}
                          className="text-muted-foreground hover:text-foreground ms-auto mt-0.5 shrink-0"
                          aria-label="פתח את כרטיס המוצר"
                        >
                          <ExternalLink className="size-3.5" />
                        </Link>
                      </div>
                    </td>
                    <td className="p-3 font-semibold whitespace-nowrap">{formatPrice(g.product.price)}</td>
                    <td className="p-3 whitespace-nowrap">{formatPrice(g.sheetPrice)}</td>
                    <td className="p-3 whitespace-nowrap">
                      <span className={diff > 0 ? "text-success-foreground" : "text-destructive"}>
                        {diff > 0 ? "+" : ""}
                        {formatPrice(diff)}
                      </span>
                    </td>
                    <td className="text-muted-foreground p-3 whitespace-nowrap">
                      {g.product.supplierCost === null ? "—" : formatPrice(g.product.supplierCost)}
                    </td>
                    <td className="p-3 text-xs">
                      {g.priceIsManual && !g.rowContradictsProduct && (
                        <span className="text-foreground block font-semibold">
                          תמחור ידני — הסינק לא יגע בו
                        </span>
                      )}
                      {g.rowContradictsProduct ? (
                        <span className="text-destructive flex items-start gap-1.5 font-bold">
                          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                          השורה במחירון היא של מוצר אחר — צריך לתקן את ההצמדה, לא את המחיר
                        </span>
                      ) : g.sheetPriceBelowCost ? (
                        <span className="text-destructive font-semibold">
                          המחיר במחירון נמוך מהעלות שבאותה שורה — הסינק לא יאמץ אותו
                        </span>
                      ) : g.belowCost ? (
                        <span className="text-destructive font-semibold">נמכר מתחת לעלות</span>
                      ) : (
                        ""
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
