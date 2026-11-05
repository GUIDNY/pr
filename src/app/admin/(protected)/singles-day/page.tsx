import Image from "next/image";
import Link from "next/link";
import { ExternalLink, Gift, OctagonX, PackageCheck, PartyPopper, Timer, TrendingUp, TriangleAlert } from "lucide-react";
import { requireCatalogPage } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  SINGLES_DAY_ITEMS,
  checkDeal,
  daysUntilSinglesDay,
  liveProfit,
  type LiveProduct,
} from "@/lib/campaigns/singles-day-2026";

export const metadata = { title: "יום הרווקים 11.11 | Buy Today Admin" };
/* Stock moves twice a day and the point of this page is to say so. */
export const dynamic = "force-dynamic";

/* The clock, read once per request outside render. Async so the page's
   render stays pure; force-dynamic above means it is a new value per load. */
async function requestTime(): Promise<number> {
  return Date.now();
}

const ils = (n: number) => `${n.toLocaleString("he-IL")} ₪`;

/**
 * Singles' Day — the owner's list, for the back office to look at and to show.
 *
 * Read-only on purpose. It changes no price: the plan lives in
 * lib/campaigns/singles-day-2026.ts, and each card reads the live product
 * beside it, so the page is also the check that the plan still holds — a
 * price the discount was worked out from that has since moved, stock that
 * has run down, a sale price that would now sit at or below cost.
 *
 * Cost and margin are on it, so it is catalog roles only, the same gate as
 * the rest of the shop-running pages; the nav entry hiding it from a seller
 * is presentation, this check is the lock.
 */
export default async function SinglesDayPage() {
  await requireCatalogPage();

  const products = await db.product.findMany({
    where: { sku: { in: SINGLES_DAY_ITEMS.map((i) => i.sku) } },
    select: {
      sku: true,
      slug: true,
      title: true,
      price: true,
      supplierCost: true,
      stockQty: true,
      isPublished: true,
      missingFromSourceSince: true,
      importChannel: true,
      brand: { select: { name: true } },
      images: { select: { url: true }, take: 1, orderBy: { sortOrder: "asc" } },
    },
  });
  const bySku = new Map(products.map((p) => [p.sku, p]));

  const rows = SINGLES_DAY_ITEMS.map((item, index) => {
    const p = bySku.get(item.sku) ?? null;
    const live: LiveProduct | null = p
      ? {
          price: p.price,
          supplierCost: p.supplierCost,
          stockQty: p.stockQty,
          isPublished: p.isPublished,
          missingFromSourceSince: p.missingFromSourceSince,
          hasImage: p.images.length > 0,
        }
      : null;
    return {
      rank: index + 1,
      item,
      product: p,
      checks: checkDeal(item, live),
      profit: liveProfit(item, live),
      stock: p?.stockQty ?? 0,
      saving: item.plannedPrice - item.salePrice,
    };
  });

  const stops = rows.filter((r) => r.checks.some((c) => c.level === "stop")).length;
  const warns = rows.filter((r) => r.checks.length > 0 && !r.checks.some((c) => c.level === "stop")).length;
  const units = rows.reduce((t, r) => t + r.stock, 0);
  const potentialProfit = rows.reduce((t, r) => t + (r.profit ?? 0) * r.stock, 0);
  const avgDiscount = Math.round(rows.reduce((t, r) => t + r.item.discountPct, 0) / rows.length);
  const maxDiscount = Math.max(...rows.map((r) => r.item.discountPct));

  const daysLeft = daysUntilSinglesDay(await requestTime());

  return (
    <div className="space-y-6">
      {/* ── hero ───────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-l from-rose-600 via-red-600 to-brand p-6 text-white shadow-lg sm:p-8">
        <div className="pointer-events-none absolute -left-6 -top-10 select-none text-[9rem] font-black leading-none opacity-15 sm:text-[12rem]">
          11.11
        </div>
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur">
              <PartyPopper className="size-3.5" />
              תצוגה פנימית · המחירים באתר לא שונו
            </div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">יום הרווקים 11.11</h1>
            <p className="mt-1 text-sm text-white/85 sm:text-base">
              {rows.length} מבצעים נבחרים · עד {maxDiscount}% הנחה · משלוח עד הבית
            </p>
          </div>
          <div className="flex items-center gap-3 self-start rounded-2xl bg-white/15 px-4 py-3 backdrop-blur sm:self-auto">
            <Timer className="size-6" />
            <div className="leading-tight">
              <div className="text-2xl font-black">{daysLeft > 0 ? daysLeft : daysLeft === 0 ? "היום!" : "הסתיים"}</div>
              <div className="text-xs text-white/80">{daysLeft > 0 ? "ימים ל-11.11" : ""}</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── numbers ────────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<Gift className="size-5" />} label="מוצרים במבצע" value={String(rows.length)} />
        <Stat icon={<PackageCheck className="size-5" />} label="יחידות במלאי עכשיו" value={units.toLocaleString("he-IL")} />
        <Stat icon={<TrendingUp className="size-5" />} label="רווח אם הכל נמכר" value={ils(potentialProfit)} />
        <Stat icon={<PartyPopper className="size-5" />} label="הנחה ממוצעת" value={`${avgDiscount}%`} />
      </section>

      {/* ── what moved since the list was written ──────────────────── */}
      {stops + warns > 0 ? (
        <section
          className={`flex items-start gap-3 rounded-2xl border p-4 text-sm ${
            stops > 0 ? "border-destructive/40 bg-destructive/10" : "border-warning/40 bg-warning/10"
          }`}
        >
          {stops > 0 ? <OctagonX className="mt-0.5 size-5 shrink-0 text-destructive" /> : <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warning-foreground" />}
          <div>
            <div className="font-bold">
              {stops > 0 ? `${stops} מבצעים לא יכולים לצאת כמו שתוכננו` : "המצב השתנה מאז שהרשימה נכתבה"}
              {stops > 0 && warns > 0 ? ` · ${warns} דורשים בדיקה` : ""}
            </div>
            <div className="text-muted-foreground">הפרטים מסומנים על כל כרטיס. הנתונים נקראים מהקטלוג החי בכל טעינה.</div>
          </div>
        </section>
      ) : (
        <section className="flex items-center gap-3 rounded-2xl border border-success/40 bg-success/10 p-4 text-sm">
          <PackageCheck className="size-5 shrink-0 text-success" />
          <span className="font-semibold">כל 20 המבצעים תקינים מול הקטלוג החי: מחיר, מלאי, עלות ותמונה.</span>
        </section>
      )}

      {/* ── the deals ──────────────────────────────────────────────── */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {rows.map((r) => {
          const stop = r.checks.some((c) => c.level === "stop");
          return (
            <article
              key={r.item.sku}
              className={`group flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition hover:shadow-md ${
                stop ? "border-destructive/50" : "border-border"
              }`}
            >
              <div className="relative aspect-[4/3] bg-white">
                {r.product?.images[0] ? (
                  <Image
                    src={r.product.images[0].url}
                    alt={r.product.title}
                    fill
                    sizes="(min-width: 1536px) 25vw, (min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
                    className="object-contain p-4 transition group-hover:scale-[1.03]"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">אין תמונה</div>
                )}
                <span className="absolute right-3 top-3 rounded-full bg-gradient-to-l from-rose-600 to-red-600 px-3 py-1 text-sm font-black text-white shadow">
                  {r.item.discountPct}%-
                </span>
                <span className="absolute left-3 top-3 flex size-7 items-center justify-center rounded-full bg-black/70 text-xs font-bold text-white">
                  {r.rank}
                </span>
                {r.product?.importChannel === "PARALLEL" && (
                  <span className="absolute bottom-3 right-3 rounded-full bg-amber-500/90 px-2 py-0.5 text-[11px] font-semibold text-white">
                    יבואן מקביל
                  </span>
                )}
              </div>

              <div className="flex flex-1 flex-col gap-3 p-4">
                <div>
                  {r.product?.brand?.name && (
                    <div className="text-xs font-semibold text-muted-foreground">{r.product.brand.name}</div>
                  )}
                  <h2 className="line-clamp-2 font-bold leading-snug">{r.product?.title ?? r.item.label}</h2>
                  <div className="mt-0.5 text-xs text-muted-foreground">מק&quot;ט {r.item.sku}</div>
                </div>

                <div className="flex items-end justify-between gap-2">
                  <div>
                    <div className="text-sm text-muted-foreground line-through">{ils(r.item.plannedPrice)}</div>
                    <div className="text-2xl font-black text-red-600 dark:text-rose-400">{ils(r.item.salePrice)}</div>
                  </div>
                  <span className="rounded-lg bg-success/15 px-2 py-1 text-xs font-bold text-success">
                    חוסכים {ils(r.saving)}
                  </span>
                </div>

                <dl className="grid grid-cols-2 gap-2 rounded-xl bg-muted/60 p-2.5 text-center text-xs">
                  <div>
                    <dt className="text-muted-foreground">רווח ליחידה</dt>
                    <dd className={`text-sm font-bold ${r.profit !== null && r.profit <= 0 ? "text-destructive" : ""}`}>
                      {r.profit !== null ? ils(r.profit) : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">במלאי</dt>
                    <dd className={`text-sm font-bold ${r.stock <= 0 ? "text-destructive" : ""}`}>{r.stock}</dd>
                  </div>
                </dl>

                {r.checks.length > 0 && (
                  <ul className="space-y-1 text-xs">
                    {r.checks.map((c) => (
                      <li
                        key={c.text}
                        className={`flex items-start gap-1.5 rounded-lg px-2 py-1 ${
                          c.level === "stop" ? "bg-destructive/10 text-destructive" : "bg-warning/15 text-warning-foreground"
                        }`}
                      >
                        {c.level === "stop" ? <OctagonX className="mt-px size-3.5 shrink-0" /> : <TriangleAlert className="mt-px size-3.5 shrink-0" />}
                        {c.text}
                      </li>
                    ))}
                  </ul>
                )}

                {r.product && (
                  <Link
                    href={`/product/${r.product.slug}`}
                    target="_blank"
                    className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold transition hover:bg-muted"
                  >
                    לעמוד המוצר באתר
                    <ExternalLink className="size-3.5" />
                  </Link>
                )}
              </div>
            </article>
          );
        })}
      </section>

      {/* ── the same list as a table, to copy or print ─────────────── */}
      <section className="overflow-hidden rounded-2xl border bg-card">
        <h2 className="border-b px-4 py-3 font-bold">הרשימה המלאה</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr>
                {["#", "מק\"ט", "מוצר", "מחיר היום", "הנחה", "מחיר מבצע", "רווח ליחידה", "מלאי"].map((h) => (
                  <th key={h} className="px-3 py-2 text-right font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.item.sku} className="border-t">
                  <td className="px-3 py-2 text-muted-foreground">{r.rank}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.item.sku}</td>
                  <td className="px-3 py-2">{r.item.label}</td>
                  <td className="px-3 py-2">{ils(r.product?.price ?? r.item.plannedPrice)}</td>
                  <td className="px-3 py-2 font-semibold text-red-600 dark:text-rose-400">{r.item.discountPct}%</td>
                  <td className="px-3 py-2 font-bold">{ils(r.item.salePrice)}</td>
                  <td className="px-3 py-2">{r.profit !== null ? ils(r.profit) : "—"}</td>
                  <td className="px-3 py-2">{r.stock}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t bg-muted/40 font-bold">
              <tr>
                <td className="px-3 py-2" colSpan={6}>סה&quot;כ אם כל המלאי נמכר</td>
                <td className="px-3 py-2">{ils(potentialProfit)}</td>
                <td className="px-3 py-2">{units}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="flex size-8 items-center justify-center rounded-lg bg-red-600/10 text-red-600 dark:text-rose-400">{icon}</span>
        <span className="text-xs font-semibold">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-black">{value}</div>
    </div>
  );
}
