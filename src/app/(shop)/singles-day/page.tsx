import type { Metadata } from "next";
import Link from "next/link";
import { Eye, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductCard, type ProductCardData } from "@/components/product/product-card";
import { getSession } from "@/lib/auth";
import { getCardsBySkuForPreview, getPublicSaleCardsByBrand } from "@/lib/queries/products";
import { FREE_DELIVERY_THRESHOLD } from "@/lib/delivery";
import { SINGLES_DAY_ITEMS, canSeeSinglesDay, type SinglesDayItem } from "@/lib/campaigns/singles-day-2026";
import { singlesDayPhase } from "@/lib/campaigns/singles-day-window";
import {
  SinglesDayHero,
  SinglesDaySectionHeading,
  SinglesDayStickyNav,
  SinglesDayTicker,
  type Spotlight,
} from "@/components/campaign/singles-day-poster";

export const metadata: Metadata = {
  title: "יום הרווקים הסיני 11.11",
  description: "יום הרווקים הסיני ב-Buy Today: 20 מוצרים למטבח ולבית, עד 20% הנחה, ליום אחד בלבד.",
  alternates: { canonical: "/singles-day" },
};
/* The phase is read per request: the same address is a clock until 00:00,
   the deals until 24:00, and a goodbye after. */
export const dynamic = "force-dynamic";

async function requestTime(): Promise<number> {
  return Date.now();
}

const MAX_DISCOUNT = Math.max(...SINGLES_DAY_ITEMS.map((i) => i.discountPct));

/**
 * Singles' Day, 11.11.2026 — one address, three states.
 *
 *  before 00:00  customers get the clock and a sealed envelope, and nothing
 *                else: no product, no price, no photo leaves the server, so
 *                the deals cannot be read early off the page source.
 *                Managers get the whole page as a preview, with the planned
 *                prices drawn on the cards and the cart button swapped for a
 *                label, because until 00:00 the cart charges the real price.
 *  00:00–24:00   everyone gets the deals, at the prices the database holds.
 *                The sale prices are written there at 00:00 by pg_cron
 *                (campaign.singles_day_2026_start) and taken off at 24:00, so
 *                the cards, the cart and the checkout all read one number and
 *                cannot disagree. If a price was not switched — a product
 *                already on another sale, or one whose sale price would sit
 *                at or below cost — its card simply shows its real price.
 *  after 24:00   a short goodbye and the way to the regular deals.
 *
 * The clock on the page reloads it at 00:00 and at 24:00, so a visitor
 * waiting on the countdown sees the deals open without pressing anything.
 * No cost or margin is ever on this page — that is /admin/singles-day.
 */
export default async function SinglesDayPage() {
  const now = await requestTime();
  const phase = singlesDayPhase(now);
  const session = await getSession();
  /* "Manager" here is whoever sees the campaign before customers do: the
     catalog roles and, since 5 November, every seller, so the sales team
     sees the live page the admin sees. */
  const isManager = !!session && canSeeSinglesDay(session.role);

  if (phase === "before" && !isManager) {
    return (
      <div className="pb-16">
        <SinglesDayHero spotlight={null} count={SINGLES_DAY_ITEMS.length} maxDiscount={MAX_DISCOUNT} groups={[]} initialNow={now} teaser />
        <SinglesDayTicker lines={tickerLines()} />
      </div>
    );
  }

  if (phase === "over" && !isManager) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-20 text-center">
        <div className="text-5xl font-black text-[#e3001b]">11.11</div>
        <h1 className="text-2xl font-black">יום הרווקים הסיני הסתיים</h1>
        <p className="text-muted-foreground">תודה לכל מי שהגיע. יש עדיין מבצעים באתר — מתעדכנים כל הזמן.</p>
        <Button variant="brand" asChild>
          <Link href="/deals">למבצעים באתר</Link>
        </Button>
      </div>
    );
  }

  const preview = phase === "before"; // a manager, before the opening
  const [cards, ninja] = await Promise.all([
    getCardsBySkuForPreview(
      SINGLES_DAY_ITEMS.map((i) => i.sku),
      { publicOnly: !isManager }
    ),
    /* Ninja's standing sales, added at the owner's word ("what do we care").
       Their prices are not touched: each is already on a sale of its own,
       which is exactly why the 00:00 job would skip one — and read live, so
       whatever Ninja is on sale on the day is what shows. */
    getPublicSaleCardsByBrand("Ninja"),
  ]);
  const deals = SINGLES_DAY_ITEMS.flatMap((item, i) => {
    const card = cards[i];
    if (!card) return [];
    const shown: ProductCardData = preview ? { ...card, price: item.salePrice, compareAtPrice: item.plannedPrice } : card;
    return [{ item, card: shown }];
  });
  const missing = SINGLES_DAY_ITEMS.length - deals.length;

  /* The tag goes on the deal that takes the most shekels off, among those
     with a photograph — the one a passer-by would stop for. Read off the
     card, so on the day it is the real discount and not the planned one. */
  const saving = (c: ProductCardData) => (c.compareAtPrice ?? c.price) - c.price;
  const top = deals.filter((d) => d.card.imageUrl && saving(d.card) > 0).sort((a, b) => saving(b.card) - saving(a.card))[0];
  const spotlight: Spotlight | null = top
    ? {
        slug: top.card.slug,
        brand: top.card.brandName,
        name: spotlightName(top.item),
        imageUrl: top.card.imageUrl ?? null,
        was: top.card.compareAtPrice ?? top.card.price,
        now: top.card.price,
        pct: Math.round((saving(top.card) / (top.card.compareAtPrice ?? top.card.price)) * 100),
      }
    : null;

  const groups: { id: string; label: string; deals: { key: string; card: ProductCardData }[] }[] = [
    ...GROUPS.map((g) => ({
      id: g.id as string,
      label: g.label as string,
      deals: deals.filter((d) => groupOf(d.item.label) === g.id).map((d) => ({ key: d.item.sku, card: d.card })),
    })),
    { id: "ninja", label: "Ninja במבצע", deals: ninja.map((card) => ({ key: card.sku, card })) },
  ].filter((g) => g.deals.length > 0);
  const totalDeals = groups.reduce((t, g) => t + g.deals.length, 0);
  const groupLinks = groups.map((g) => ({ id: g.id, label: g.label, count: g.deals.length }));

  return (
    <div className="pb-16">
      {isManager && phase !== "live" && (
        <div className="bg-[#ffd25a] text-[#7d000c]">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs font-medium sm:text-sm">
            <span className="flex items-center gap-1.5">
              <Eye className="size-4" />
              {phase === "before" ? (
                <>
                  <span className="sm:hidden">תצוגה למנהלים · לקוחות רואים רק שעון</span>
                  <span className="hidden sm:inline">
                    תצוגה מקדימה למנהלים — לקוחות רואים כרגע רק את השעון. המחירים מתחלפים אוטומטית ב-11.11 בחצות
                  </span>
                </>
              ) : (
                "המבצע הסתיים — לקוחות רואים הודעת סיום"
              )}
              {missing > 0 && ` · ${missing} מוצרים מהרשימה לא נמצאו בקטלוג`}
            </span>
            <Link href="/admin/singles-day" className="flex items-center gap-1 font-bold underline underline-offset-4">
              <Settings2 className="size-4" />
              מספרים ורווחיות
            </Link>
          </div>
        </div>
      )}

      <SinglesDayHero spotlight={spotlight} count={totalDeals} maxDiscount={MAX_DISCOUNT} groups={groupLinks} initialNow={now} />

      <SinglesDayTicker lines={tickerLines(totalDeals)} />

      <SinglesDayStickyNav groups={groupLinks} />

      <div id="deals" className="mx-auto max-w-7xl space-y-10 px-4 pt-8 sm:space-y-14 sm:pt-12">
        {groups.map((g, i) => (
          <section key={g.id}>
            <SinglesDaySectionHeading index={i + 1} id={g.id} label={g.label} count={g.deals.length} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-5">
              {g.deals.map(({ key, card }) => (
                <ProductCard key={key} product={card} previewLabel={preview ? "במבצע ב-11.11" : undefined} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/* Without a count before the opening: what is inside stays inside. */
function tickerLines(count?: number) {
  return [
    "יום הרווקים הסיני · 11.11",
    `עד ${MAX_DISCOUNT}% הנחה`,
    `משלוח חינם מעל ${FREE_DELIVERY_THRESHOLD.toLocaleString("he-IL")} ₪`,
    "עד גמר המלאי",
    ...(count ? [`${count} מוצרים נבחרים`] : []),
    "יום אחד בלבד",
  ];
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
