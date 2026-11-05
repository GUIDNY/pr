import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Eye, Settings2 } from "lucide-react";
import { ProductCard, type ProductCardData } from "@/components/product/product-card";
import { getSession } from "@/lib/auth";
import { canManageCatalog } from "@/lib/permissions";
import { getCardsBySkuForPreview } from "@/lib/queries/products";
import { FREE_DELIVERY_THRESHOLD } from "@/lib/delivery";
import { SINGLES_DAY_ITEMS, type SinglesDayItem } from "@/lib/campaigns/singles-day-2026";
import {
  SinglesDayHero,
  SinglesDaySectionHeading,
  SinglesDayStickyNav,
  SinglesDayTicker,
  type Spotlight,
} from "@/components/campaign/singles-day-poster";

/* Never indexed, and the title says nothing until a manager is looking: a
   static title rides along in the 404's payload, so a visitor could read
   the campaign's name off a page that is supposed to not exist. */
export async function generateMetadata(): Promise<Metadata> {
  const session = await getSession();
  const isManager = !!session && canManageCatalog(session.role);
  return {
    ...(isManager ? { title: "יום הרווקים הסיני 11.11" } : {}),
    robots: { index: false, follow: false, nocache: true },
  };
}
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

  /* The tag goes on the deal that takes the most shekels off, among those
     with a photograph — the one a passer-by would stop for. */
  const top = [...deals]
    .filter((d) => d.card.imageUrl)
    .sort((a, b) => b.item.plannedPrice - b.item.salePrice - (a.item.plannedPrice - a.item.salePrice))[0];
  const spotlight: Spotlight | null = top
    ? {
        slug: top.card.slug,
        brand: top.card.brandName,
        name: spotlightName(top.item),
        imageUrl: top.card.imageUrl ?? null,
        was: top.item.plannedPrice,
        now: top.item.salePrice,
        pct: top.item.discountPct,
      }
    : null;

  const groups = GROUPS.map((g) => ({ ...g, deals: deals.filter((d) => groupOf(d.item.label) === g.id) })).filter(
    (g) => g.deals.length > 0
  );

  return (
    <div className="pb-16">
      {/* ── manager strip ─────────────────────────────────────────── */}
      <div className="bg-[#ffd25a] text-[#7d000c]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs font-medium sm:text-sm">
          <span className="flex items-center gap-1.5">
            <Eye className="size-4" />
            <span className="sm:hidden">תצוגה למנהלים · לא גלוי ללקוחות</span>
            <span className="hidden sm:inline">תצוגה מקדימה למנהלים — לקוחות לא רואים את הדף, והמחירים באתר לא שונו</span>
            {missing > 0 && ` · ${missing} מוצרים מהרשימה לא נמצאו בקטלוג`}
          </span>
          <Link href="/admin/singles-day" className="flex items-center gap-1 font-bold underline underline-offset-4">
            <Settings2 className="size-4" />
            מספרים ורווחיות
          </Link>
        </div>
      </div>

      <SinglesDayHero
        spotlight={spotlight}
        count={deals.length}
        maxDiscount={maxDiscount}
        groups={groups.map((g) => ({ id: g.id, label: g.label, count: g.deals.length }))}
        initialNow={await requestTime()}
      />

      <SinglesDayTicker
        lines={[
          "יום הרווקים הסיני · 11.11",
          `עד ${maxDiscount}% הנחה`,
          `משלוח חינם מעל ${FREE_DELIVERY_THRESHOLD.toLocaleString("he-IL")} ₪`,
          "עד גמר המלאי",
          `${deals.length} מוצרים נבחרים`,
          "יום אחד בלבד",
        ]}
      />

      <SinglesDayStickyNav groups={groups.map((g) => ({ id: g.id, label: g.label, count: g.deals.length }))} />

      <div id="deals" className="mx-auto max-w-7xl space-y-10 px-4 pt-8 sm:space-y-14 sm:pt-12">
        {groups.map((g, i) => (
          <section key={g.id}>
            <SinglesDaySectionHeading index={i + 1} id={g.id} label={g.label} count={g.deals.length} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-5">
              {g.deals.map(({ item, card }) => (
                <ProductCard key={item.sku} product={card} previewLabel="במבצע ב-11.11" />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/* Grouped by what the thing is, read off the owner's own label — the list
   is twenty lines he wrote, not a category tree, and these four words are
   the whole vocabulary it uses. */
const GROUPS = [
  { id: "fridges", label: "מקררים" },
  { id: "cooktops", label: "כיריים" },
  { id: "dishwashers", label: "מדיחים" },
  { id: "more", label: "עוד למטבח" },
] as const;

function groupOf(label: string): (typeof GROUPS)[number]["id"] {
  if (label.includes("מקרר")) return "fridges";
  if (label.includes("כיריים")) return "cooktops";
  if (label.includes("מדיח")) return "dishwashers";
  return "more";
}

/* "כיריים גז Bertazzoni PM365SOX" → "כיריים גז PM365SOX": the brand is
   printed on the tag's first line already. */
function spotlightName(item: SinglesDayItem) {
  return item.label.replace(/\s+[A-Z][A-Za-z']+(?=\s+[A-Z0-9])/, "").trim();
}
