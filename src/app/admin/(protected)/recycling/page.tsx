import { notFound } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ExternalLink, Recycle } from "lucide-react";
import { requireBackOffice } from "@/lib/auth";
import { canManageCatalog } from "@/lib/permissions";
import {
  getCategoryRecyclingMapping,
  getProductRemovalOverrides,
  getProductsWithoutRemoval,
  getRecyclingGroups,
  getRemovalCoverage,
} from "@/lib/queries/admin-recycling";
import { RecyclingGroupEditor, type GroupRow } from "@/components/admin/recycling-group-editor";
import {
  CategoryRecyclingSelect,
  ProductRecyclingSelect,
} from "@/components/admin/recycling-assignment-select";
import { REMOVAL_ORDERING_ENABLED, REMOVAL_PAGE_PATH } from "@/lib/recycling";
import { BUSINESS } from "@/lib/business";

/**
 * פינוי מוצר ישן — the settings behind the feature.
 *
 * Its existence is the brief's own requirement: adding a category next month
 * must not mean a code change. So everything a customer reads about a group —
 * the noun, the phrase for the old one, whether the access questions are
 * asked, what an exceptional removal costs — is a row here rather than a
 * constant in the repository.
 *
 * Read the sections in order and they answer the three questions somebody
 * actually arrives with: is this switched on at all, which groups exist, and
 * what is still getting no offer. The last one is the only part that is a
 * backlog rather than a setting, and it is why the uncovered products are on
 * the same screen instead of in a report nobody opens.
 */
export default async function AdminRecyclingPage() {
  const viewer = await requireBackOffice();
  if (!canManageCatalog(viewer.role)) notFound();

  const [groups, categories, uncovered, overrides, coverage] = await Promise.all([
    getRecyclingGroups(),
    getCategoryRecyclingMapping(),
    getProductsWithoutRemoval(),
    getProductRemovalOverrides(),
    getRemovalCoverage(),
  ]);

  const rows: GroupRow[] = groups.map((g) => ({
    id: g.id,
    key: g.key,
    label: g.label,
    oldLabel: g.oldLabel,
    isLargeAppliance: g.isLargeAppliance,
    asksExceptional: g.asksExceptional,
    exceptionalFee: g.exceptionalFee,
    isEnabled: g.isEnabled,
    sortOrder: g.sortOrder,
    categoryCount: g._count.categories,
    productCount: g._count.products,
  }));
  const options = groups.map((g) => ({ id: g.id, label: g.isEnabled ? g.label : `${g.label} (כבויה)` }));

  const pct = coverage.total === 0 ? 0 : Math.round((coverage.covered / coverage.total) * 100);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Recycle className="text-brand size-6" /> פינוי מוצר חשמלי ישן
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          מה הלקוח רשאי למסור בכל קטגוריה, איך זה מנוסח בקופה, ומה עובר למוביל.{" "}
          <Link href={REMOVAL_PAGE_PATH} target="_blank" className="text-brand hover:underline">
            העמוד באתר <ExternalLink className="inline size-3" />
          </Link>
        </p>
      </div>

      {/* The switch, said first and said plainly. Somebody opening this screen
          to work through the backlog has to know whether any of it is
          currently reaching a customer as a checkbox. */}
      {REMOVAL_ORDERING_ENABLED ? (
        <p className="border-success/30 bg-success/5 rounded-xl border p-4 text-sm">
          <span className="font-semibold">הזמנת פינוי פעילה.</span> לקוח יכול לסמן פינוי בקופה, והבקשה נרשמת על
          שורת ההזמנה ומופיעה במסך ההזמנה באדמין.
        </p>
      ) : (
        <div className="border-warning/40 bg-warning/10 rounded-xl border p-4 text-sm leading-relaxed">
          <p className="flex items-start gap-2 font-semibold">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            הזמנת פינוי אינה פעילה ללקוחות
          </p>
          <p className="mt-2">
            דף המוצר, עמוד הפינוי והקופה מסבירים את הזכאות, אבל אין תיבת סימון — במקומה מוצג הטלפון{" "}
            {BUSINESS.phone}. כך לא נרשמת בקשה שאיש עדיין לא התחייב לאסוף.
          </p>
          <p className="mt-2">להפעלה צריך קודם לוודא תפעולית:</p>
          <ul className="mt-1 flex list-disc flex-col gap-0.5 ps-5">
            <li>מי המוביל שאוסף את המוצר הישן בכל סוג משלוח</li>
            <li>שהמוביל מקבל בפועל את נתוני הפינוי לפני האספקה</li>
            <li>מה התהליך במוצר שמסופק ישירות על ידי ספק או יבואן</li>
            <li>מה עושים כשהמוצר החדש נמסר בנקודת איסוף</li>
            <li>שיש הסדר פינוי מול תאגיד מחזור מוכר לפסולת שנאספת</li>
          </ul>
          <p className="mt-2">
            אחרי זה — משנים <code dir="ltr">REMOVAL_ORDERING_ENABLED</code> ל-<code dir="ltr">true</code> בקובץ{" "}
            <code dir="ltr">src/lib/recycling.ts</code> ודוחפים. אין מה ללחוץ ב-Vercel.
          </p>
        </div>
      )}

      <div className="border-border bg-card rounded-xl border p-5">
        <h2 className="mb-1 font-semibold">כיסוי</h2>
        <p className="text-muted-foreground text-sm">
          {coverage.covered} מתוך {coverage.total} המוצרים החיים באתר ({pct}%) מציעים פינוי מוצר ישן. מוצר ללא
          קבוצת פינוי אינו מציע דבר — וזו התשובה הנכונה למתלים, כבלים ואביזרים, אבל לא למכשיר חשמלי.
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">קבוצות פינוי</h2>
        <RecyclingGroupEditor groups={rows} />
      </section>

      {/* The backlog, above the settled mapping: a live electrical appliance
          with no group is a duty the shop is not meeting, and it is invisible
          everywhere else in the back office. */}
      {uncovered.length > 0 && (
        <section>
          <h2 className="mb-1 text-lg font-semibold">מוצרים חיים ללא קבוצת פינוי</h2>
          <p className="text-muted-foreground mb-3 text-sm">
            הקטגוריה שלהם אינה משויכת לאף קבוצה, ולכן לא מוצעת בהם אפשרות פינוי. אם זו קטגוריה שלמה — עדיף לשייך
            אותה למטה במקום לטפל במוצר אחד בכל פעם.
          </p>
          <div className="border-border overflow-x-auto rounded-xl border">
            <table className="w-full text-start text-sm">
              <tbody>
                {uncovered.map((p) => (
                  <tr key={p.id} className="border-border border-t first:border-t-0">
                    <td className="px-3 py-2">
                      <Link href={`/product/${p.slug}`} target="_blank" className="font-medium hover:underline">
                        {p.title}
                      </Link>
                      <span className="text-muted-foreground block text-xs">
                        {p.sku} · {p.category.name}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-end">
                      <ProductRecyclingSelect productId={p.id} current={null} optOut={false} groups={options} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-1 text-lg font-semibold">שיוך קטגוריות</h2>
        <p className="text-muted-foreground mb-3 text-sm">
          קטגוריות ללא שיוך שיש בהן מוצרים מופיעות ראשונות.
        </p>
        <div className="border-border overflow-x-auto rounded-xl border">
          <table className="w-full text-start text-sm">
            <tbody>
              {categories.map((c) => (
                <tr key={c.id} className="border-border border-t first:border-t-0">
                  <td className="px-3 py-2">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-muted-foreground block text-xs">
                      {c.parent ? `${c.parent.name} · ` : ""}
                      {c.slug} · {c._count.products} מוצרים
                    </span>
                  </td>
                  <td className="px-3 py-2 text-end">
                    <CategoryRecyclingSelect
                      categoryId={c.id}
                      current={c.recyclingCategoryId}
                      groups={options}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {overrides.length > 0 && (
        <section>
          <h2 className="mb-1 text-lg font-semibold">החלטות ידניות ברמת מוצר</h2>
          <p className="text-muted-foreground mb-3 text-sm">
            מוצרים שקיבלו תשובה משלהם, שגוברת על הקטגוריה. כאן אפשר גם לבטל אותה.
          </p>
          <div className="border-border overflow-x-auto rounded-xl border">
            <table className="w-full text-start text-sm">
              <tbody>
                {overrides.map((p) => (
                  <tr key={p.id} className="border-border border-t first:border-t-0">
                    <td className="px-3 py-2">
                      <Link href={`/product/${p.slug}`} target="_blank" className="font-medium hover:underline">
                        {p.title}
                      </Link>
                      <span className="text-muted-foreground block text-xs">
                        {p.sku} · {p.category.name} ·{" "}
                        {p.recyclingOptOut ? "ללא פינוי" : (p.recyclingCategory?.label ?? "—")}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-end">
                      <ProductRecyclingSelect
                        productId={p.id}
                        current={p.recyclingCategoryId}
                        optOut={p.recyclingOptOut}
                        groups={options}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
