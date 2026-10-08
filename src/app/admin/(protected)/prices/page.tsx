import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canSeePriceList } from "@/lib/price-list-access";
import {
  getPriceList,
  getBelowCostCount,
  getPriceListCategories,
  type PriceListFilter,
} from "@/lib/queries/price-list";
import { PriceListTable } from "@/components/admin/price-list-table";
import { backOfficeHome } from "@/lib/permissions";

export const metadata = { title: "מחירים ועלויות | Buy Today Admin" };

const FILTERS: { value: PriceListFilter; label: string }[] = [
  { value: "ALL", label: "הכל" },
  { value: "PUBLISHED", label: "מפורסמים" },
  { value: "NO_PRICE", label: "בלי מחיר מכירה" },
  { value: "NO_COST", label: "בלי מחיר עלות" },
  { value: "BELOW_COST", label: "מתחת לעלות" },
];

type SP = { q?: string; cat?: string; filter?: string; page?: string };

export default async function PricesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const session = await getSession();
  if (!session) redirect("/admin/login");
  const user = await db.user.findUnique({ where: { id: session.sub }, select: { email: true, role: true } });
  /* Checked here as well as in the action. A page that renders what a
     viewer may not see is the leak; an action that writes what they may
     not change is the other one, and they are two different doors. */
  if (!canSeePriceList(user?.email, user?.role)) redirect(backOfficeHome(session.role));

  const sp = await searchParams;
  const filter = (FILTERS.find((f) => f.value === sp.filter)?.value ?? "ALL") as PriceListFilter;
  const page = Number(sp.page ?? "1") || 1;
  const search = sp.q?.trim() ?? "";
  const categorySlug = sp.cat?.trim() ?? "";

  const [{ rows, total, pageSize }, belowCost, categories] = await Promise.all([
    getPriceList({ search, categorySlug: categorySlug || undefined, filter, page }),
    getBelowCostCount(),
    getPriceListCategories(),
  ]);
  const categoryName = categories.find((c) => c.slug === categorySlug)?.name ?? "";
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (next: Partial<SP>) => {
    const params = new URLSearchParams();
    const q = next.q ?? search;
    const c = next.cat ?? categorySlug;
    const f = next.filter ?? filter;
    const p = next.page ?? "1";
    if (q) params.set("q", q);
    if (c) params.set("cat", c);
    if (f !== "ALL") params.set("filter", f);
    if (p !== "1") params.set("page", p);
    const qs = params.toString();
    return `/admin/prices${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">מחירים ועלויות</h1>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
          מחיר העלות לצד מחיר המכירה, לפי קטגוריה. מחיר העלות הוא לקריאה בלבד — הוא מה שהספק גבה, ולכן אינו ניתן
          לעריכה כאן. שינוי מחיר מכירה דורש שני אישורים ומתעדכן באתר מיד.
        </p>
      </div>

      {belowCost > 0 && (
        <Link
          href={href({ filter: "BELOW_COST", cat: "", page: "1" })}
          className="border-destructive/30 bg-destructive/5 text-destructive rounded-xl border px-4 py-2.5 text-sm font-semibold"
        >
          {belowCost} מוצרים מתומחרים מתחת למחיר העלות ←
        </Link>
      )}

      {/* Category first, because that is how somebody looks for a product
          they are about to reprice — they know the shelf, not the SKU. */}
      <form className="flex flex-wrap items-center gap-2" action="/admin/prices">
        <select
          name="cat"
          defaultValue={categorySlug}
          className="border-border min-w-48 rounded-lg border bg-transparent px-3 py-2 text-sm"
        >
          <option value="">כל הקטגוריות</option>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name} ({c.count})
            </option>
          ))}
        </select>
        <input
          name="q"
          defaultValue={search}
          placeholder="חיפוש לפי שם, מק״ט או דגם"
          className="border-border min-w-56 flex-1 rounded-lg border px-3 py-2 text-sm"
        />
        {filter !== "ALL" && <input type="hidden" name="filter" value={filter} />}
        <button type="submit" className="bg-brand text-brand-foreground rounded-lg px-4 py-2 text-sm font-bold">
          הצג
        </button>
        {(categorySlug || search || filter !== "ALL") && (
          <Link href="/admin/prices" className="text-muted-foreground hover:text-foreground text-sm font-semibold">
            נקה
          </Link>
        )}
      </form>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={href({ filter: f.value })}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
              f.value === filter ? "bg-brand text-brand-foreground" : "border-border hover:bg-muted border"
            }`}
          >
            {f.label}
          </Link>
        ))}
        <span className="text-muted-foreground ms-auto self-center text-sm">
          {categoryName && <strong className="text-foreground">{categoryName} · </strong>}
          {total.toLocaleString("he-IL")} מוצרים
        </span>
      </div>

      <PriceListTable rows={rows} />

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          {page > 1 && (
            <Link href={href({ page: String(page - 1) })} className="border-border rounded-lg border px-3 py-1.5">
              הקודם
            </Link>
          )}
          <span className="text-muted-foreground">
            עמוד {page} מתוך {pages}
          </span>
          {page < pages && (
            <Link href={href({ page: String(page + 1) })} className="border-border rounded-lg border px-3 py-1.5">
              הבא
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
