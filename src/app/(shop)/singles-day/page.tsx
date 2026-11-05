import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgePercent, Eye, Heart, PackageCheck, Settings2, Truck } from "lucide-react";
import { ProductCard, type ProductCardData } from "@/components/product/product-card";
import { getSession } from "@/lib/auth";
import { canManageCatalog } from "@/lib/permissions";
import { getCardsBySkuForPreview } from "@/lib/queries/products";
import { FREE_DELIVERY_THRESHOLD } from "@/lib/delivery";
import { SINGLES_DAY_ITEMS, daysUntilSinglesDay } from "@/lib/campaigns/singles-day-2026";

/* Never indexed, and the title says nothing until a manager is looking. */
export const metadata: Metadata = {
  title: "יום הרווקים 11.11",
  robots: { index: false, follow: false, nocache: true },
};
export const dynamic = "force-dynamic";

async function requestTime(): Promise<number> {
  return Date.now();
}

/**
 * Singles' Day, as customers will see it — for managers only, until the day.
 *
 * Lives inside the shop so it wears the real header, footer and product
 * cards, which is the point: it is the page the owner shows people. Anyone
 * who is not a catalog manager gets the site's ordinary 404, so the address
 * gives away nothing about a campaign that has not started.
 *
 * Prices on the cards are the planned sale prices, struck through against the
 * price the plan was made from. They are *not* the site's prices: nothing in
 * the catalogue was changed, and the cart button is swapped for a label
 * because the cart would charge the real price. No cost or margin is on this
 * page — that is /admin/singles-day, which this links to.
 */
export default async function SinglesDayPreviewPage() {
  const session = await getSession();
  if (!session || !canManageCatalog(session.role)) notFound();

  const cards = await getCardsBySkuForPreview(SINGLES_DAY_ITEMS.map((i) => i.sku));
  const deals = SINGLES_DAY_ITEMS.flatMap((item, i) => {
    const card = cards[i];
    if (!card) return [];
    const preview: ProductCardData = { ...card, price: item.salePrice, compareAtPrice: item.plannedPrice };
    return [{ item, card: preview }];
  });
  const missing = SINGLES_DAY_ITEMS.length - deals.length;
  const maxDiscount = Math.max(...SINGLES_DAY_ITEMS.map((i) => i.discountPct));
  const daysLeft = daysUntilSinglesDay(await requestTime());

  return (
    <div className="pb-12">
      {/* ── manager strip ─────────────────────────────────────────── */}
      <div className="bg-foreground text-background">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs sm:text-sm">
          <span className="flex items-center gap-1.5">
            <Eye className="size-4" />
            תצוגה מקדימה למנהלים בלבד — לקוחות לא רואים את הדף הזה, והמחירים באתר לא שונו
            {missing > 0 && ` · ${missing} מוצרים מהרשימה לא נמצאו בקטלוג`}
          </span>
          <Link href="/admin/singles-day" className="flex items-center gap-1 font-semibold underline-offset-4 hover:underline">
            <Settings2 className="size-4" />
            מספרים ורווחיות
          </Link>
        </div>
      </div>

      {/* ── hero ──────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 pt-6">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-l from-rose-600 via-red-600 to-brand px-6 py-10 text-white shadow-lg sm:px-10 sm:py-14">
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-10 -left-4 select-none text-[8rem] font-black leading-none tracking-tighter opacity-15 sm:text-[15rem]"
          >
            11.11
          </div>
          <Heart aria-hidden className="pointer-events-none absolute end-8 top-6 size-16 rotate-12 fill-white/15 text-white/0 sm:size-24" />
          <div className="relative grid gap-6 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur">
                <BadgePercent className="size-3.5" />
                יום אחד בלבד · 11 בנובמבר
              </span>
              <h1 className="text-4xl font-black tracking-tight sm:text-6xl">יום הרווקים</h1>
              <p className="mt-3 max-w-xl text-base text-white/90 sm:text-lg">
                {SINGLES_DAY_ITEMS.length} מוצרים נבחרים למטבח ולבית במחירים שלא יחזרו — עד {maxDiscount}% הנחה, במלאי ובמשלוח עד הבית.
              </p>
            </div>
            <div className="flex items-center gap-4 self-start rounded-2xl bg-white/15 px-5 py-4 backdrop-blur sm:self-auto">
              <div className="text-center leading-none">
                <div className="text-4xl font-black tabular-nums">{daysLeft > 0 ? daysLeft : daysLeft === 0 ? "היום" : "—"}</div>
                <div className="mt-1 text-xs text-white/80">{daysLeft > 1 ? "ימים" : daysLeft === 1 ? "יום" : daysLeft === 0 ? "המבצע פעיל" : "המבצע הסתיים"}</div>
              </div>
              {daysLeft > 0 && <div className="text-sm font-semibold text-white/90">עד<br />המבצע</div>}
            </div>
          </div>
        </div>

        {/* ── promises ───────────────────────────────────────────── */}
        <ul className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <li className="bg-card flex items-center gap-3 rounded-2xl p-4 shadow-[0_1px_2px_rgb(0_0_0/0.05),0_0_0_1px_rgb(0_0_0/0.05)]">
            <span className="bg-brand/10 text-brand flex size-10 shrink-0 items-center justify-center rounded-full"><BadgePercent className="size-5" /></span>
            <span><b className="block">עד {maxDiscount}% הנחה</b><span className="text-muted-foreground">על המחיר הרגיל באתר</span></span>
          </li>
          <li className="bg-card flex items-center gap-3 rounded-2xl p-4 shadow-[0_1px_2px_rgb(0_0_0/0.05),0_0_0_1px_rgb(0_0_0/0.05)]">
            <span className="bg-brand/10 text-brand flex size-10 shrink-0 items-center justify-center rounded-full"><Truck className="size-5" /></span>
            <span><b className="block">משלוח חינם</b><span className="text-muted-foreground">בהזמנה מעל {FREE_DELIVERY_THRESHOLD.toLocaleString("he-IL")} ₪</span></span>
          </li>
          <li className="bg-card flex items-center gap-3 rounded-2xl p-4 shadow-[0_1px_2px_rgb(0_0_0/0.05),0_0_0_1px_rgb(0_0_0/0.05)]">
            <span className="bg-brand/10 text-brand flex size-10 shrink-0 items-center justify-center rounded-full"><PackageCheck className="size-5" /></span>
            <span><b className="block">מלאי מוגבל</b><span className="text-muted-foreground">עד גמר המלאי, ביום המבצע בלבד</span></span>
          </li>
        </ul>
      </section>

      {/* ── deals ─────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 pt-8">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-xl font-bold sm:text-2xl">המבצעים</h2>
          <span className="text-muted-foreground text-sm">{deals.length} מוצרים</span>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
          {deals.map(({ item, card }) => (
            <ProductCard key={item.sku} product={card} previewLabel="במבצע ב-11.11" />
          ))}
        </div>
      </section>
    </div>
  );
}
