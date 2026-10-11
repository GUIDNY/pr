import { requireCatalogPage } from "@/lib/auth";
import { InventoryTabs } from "@/components/admin/inventory-tabs";
import { InventoryListTable } from "@/components/admin/inventory-list-table";
import { getProblemProducts, PROBLEM_REASON_LABELS } from "@/lib/queries/inventory-control";
import { inspectNonPriceListProducts } from "@/actions/inventory-purge";
import { PurgeNonPriceListPanel } from "@/components/admin/purge-non-price-list-panel";

export const metadata = { title: "מוצרים בעייתיים | Buy Today Admin" };

/**
 * Everything else that is wrong, one row per product.
 *
 * One list and not six, because a product is usually several of these at
 * once — a subtotal line the parser read as a product has no model, no
 * price and a quantity in the dozens all at the same time — and six lists
 * of the same forty products is how a back office stops being read.
 *
 * Deliberately not here: "needs a photograph" and "just arrived from the
 * sheet". Both have their own tab, and a product that is only missing
 * content is not a problem, it is work.
 */
export default async function ProblemProductsPage() {
  await requireCatalogPage();
  const [rows, leftovers] = await Promise.all([
    getProblemProducts(300),
    /* Products with no price list behind them at all. Not in the list below
       — they are not a product with a problem, they are a product with no
       source — so they get the panel above it instead. */
    inspectNonPriceListProducts(),
  ]);

  const counts = new Map<string, number>();
  for (const p of rows) for (const r of p.reasons) counts.set(r, (counts.get(r) ?? 0) + 1);

  return (
    <div>
      <h1 className="text-2xl font-bold">מוצרים בעייתיים</h1>
      <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
        מוצרים עם מלאי שמשהו בהם לא תקין — יצאו מהמחירון, נתוני המלאי שלהם סותרים את עצמם, אין להם מחיר, או שהם בכלל
        לא מוצר אלא שורת סיכום שנקלטה מהגיליון. מוצר יכול להופיע מכמה סיבות יחד.
      </p>

      <InventoryTabs />

      <PurgeNonPriceListPanel initial={leftovers} />

      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="text-muted-foreground">{rows.length.toLocaleString("he-IL")} מוצרים</span>
        {[...counts.entries()].map(([reason, n]) => (
          <span key={reason} className="text-muted-foreground">
            <strong className="text-foreground">{n}</strong>{" "}
            {PROBLEM_REASON_LABELS[reason as keyof typeof PROBLEM_REASON_LABELS] ?? reason}
          </span>
        ))}
      </div>

      <InventoryListTable
        rows={rows}
        empty="אין מוצרים בעייתיים. כל מה שבמלאי תקין."
        columnLabel="הבעיה"
        column={(p) => {
          const row = rows.find((r) => r.id === p.id);
          if (!row) return null;
          return (
            <span className="flex flex-wrap gap-1">
              {row.reasons.map((r) => (
                <span
                  key={r}
                  className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                    r === "BELOW_COST" || r === "NOT_IN_PRICE_LIST" || r === "SUMMARY_ROW"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {PROBLEM_REASON_LABELS[r]}
                </span>
              ))}
            </span>
          );
        }}
      />
    </div>
  );
}
