import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, MapPin, ShieldCheck, Sparkles, Tag } from "lucide-react";
import { SearchBar } from "@/components/layout/search-bar";
import { Button } from "@/components/ui/button";
import { DepartmentMenu } from "@/components/home/department-menu";
import { CategoryCircles } from "@/components/home/category-circles";
import { discountPercent } from "@/lib/format";
import { BUSINESS_MAP_URL } from "@/lib/business";
import type { DepartmentCount, CategoryTile } from "@/lib/queries/categories";
import type { ProductCardData } from "@/components/product/product-card";

/**
 * The first screen: a department menu down one side, a banner beside it,
 * two promo tiles under the banner. The layout of a shop, not of a
 * landing page — the shape the big Israeli electronics retailers open
 * on, which is exactly the recognition a visitor who has never heard of
 * this one needs in the first second.
 *
 * The banner's facts are the shop's own: importer warranty, the live
 * catalogue size, the street in Hadera. Its picture is a real product
 * from the catalogue on a white card, since the shop has no marketing
 * photography and a borrowed lifestyle photo would be the first lie on
 * the page. Alfred keeps the search bar, credited under it.
 */
export function HeroBand({
  title,
  subtitle,
  ctaLabel,
  ctaHref,
  departments,
  categoryTiles,
  featureImage,
  featureLabel,
  deals,
  productCount,
  brandCount,
}: {
  title: string;
  subtitle: string;
  ctaLabel?: string;
  ctaHref?: string;
  departments: DepartmentCount[];
  // The phone's category row under the search: round photo tiles.
  categoryTiles: CategoryTile[];
  // A product photograph that stands for the shop — the four-door fridge
  // tile's, when there is one.
  featureImage: string | null;
  featureLabel: string | null;
  deals: ProductCardData[];
  productCount: number;
  brandCount: number;
}) {
  const roundedCount = Math.floor(productCount / 100) * 100;
  const bestDiscount = deals
    .map((p) => discountPercent(p.price, p.compareAtPrice ?? undefined))
    .filter((n): n is number => typeof n === "number")
    .reduce((max, n) => Math.max(max, n), 0);

  return (
    <section className="bg-secondary border-b">
      <div className="mx-auto max-w-7xl px-4 pt-3 pb-6 lg:py-6">
        <div className="mb-3 lg:hidden">
          <CategoryCircles tiles={categoryTiles} />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[250px_1fr] lg:items-stretch">
          <DepartmentMenu departments={departments} />

          <div className="flex min-w-0 flex-col gap-3 sm:gap-4">
            {/* The banner. Navy — the logo's own — with the copy at the
                start and the product card at the end. */}
            <div className="bg-primary text-primary-foreground relative overflow-hidden rounded-2xl">
              <div
                aria-hidden
                className="absolute inset-0"
                style={{
                  background:
                    "radial-gradient(ellipse 60% 90% at 0% 50%, oklch(0.42 0.12 264 / 0.9), transparent), radial-gradient(ellipse 40% 60% at 100% 0%, oklch(0.658 0.209 39.1 / 0.25), transparent)",
                }}
              />
              <div className="relative grid grid-cols-1 gap-6 p-4 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center lg:gap-10">
                <div className="flex flex-col gap-3 sm:gap-4">
                  {/* One row of small chips on a phone; they used to stack three high. */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold sm:gap-2 sm:text-xs">
                    <span className="bg-primary-foreground/10 ring-primary-foreground/15 inline-flex items-center gap-1 rounded-full px-2.5 py-1 ring-1 sm:gap-1.5 sm:px-3">
                      <ShieldCheck className="text-brand size-3.5" />
                      יבואן רשמי
                    </span>
                    {roundedCount >= 100 && (
                      <span className="bg-primary-foreground/10 ring-primary-foreground/15 inline-flex items-center gap-1 rounded-full px-2.5 py-1 ring-1 tabular-nums sm:gap-1.5 sm:px-3">
                        {roundedCount.toLocaleString("he-IL")}+ מוצרים במלאי
                        {brandCount > 0 && (
                          <span className="text-primary-foreground/70 hidden font-normal sm:inline">מ־{brandCount} מותגים</span>
                        )}
                      </span>
                    )}
                    <a
                      href={BUSINESS_MAP_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-primary-foreground/10 ring-primary-foreground/15 hover:bg-primary-foreground/20 inline-flex items-center gap-1 rounded-full px-2.5 py-1 ring-1 transition-colors sm:gap-1.5 sm:px-3"
                    >
                      <MapPin className="text-brand size-3.5" />
                      חנות בחדרה
                    </a>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <h1 className="max-w-xl text-[1.6rem] leading-tight font-black text-balance sm:text-3xl lg:text-4xl">{title}</h1>
                      <p className="text-primary-foreground/75 mt-2 max-w-xl text-sm sm:text-base">{subtitle}</p>
                    </div>
                    {/* The same real product the desktop shows on its card,
                        small, beside the headline — a banner with only words
                        on a phone read as an advert; a fridge on it reads as
                        a shop. */}
                    {featureImage && (
                      <span className="relative block w-[88px] shrink-0 overflow-hidden rounded-xl bg-white p-1.5 shadow-lg lg:hidden">
                        <span className="relative block aspect-[4/5]">
                          <Image src={featureImage} alt="" fill sizes="88px" className="object-contain" referrerPolicy="no-referrer" priority />
                        </span>
                      </span>
                    )}
                  </div>

                  <div className="w-full max-w-xl">
                    <SearchBar size="hero" showIntro={false} className="mx-0" />
                    <p className="text-primary-foreground/70 mt-2 hidden items-center gap-2 text-xs sm:flex sm:text-sm">
                      <Image
                        src="/mascot/alfred.png"
                        alt=""
                        width={22}
                        height={22}
                        className="size-5.5 shrink-0 rounded-full object-cover object-top"
                      />
                      <span>
                        אפשר לכתוב ל<span className="text-primary-foreground font-semibold">אלפרד</span>, העוזר החכם
                        שלנו, בשפה חופשית: &quot;מקרר גדול ושקט עד 5,000 ₪&quot;
                      </span>
                    </p>
                  </div>

                  {/* Side by side on a phone too — stacked, the pair cost
                      130px and read as one button with an afterthought. */}
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
                    {ctaLabel && ctaHref && (
                      <Button variant="brand" size="lg" asChild className="h-11 px-4 text-sm sm:px-6 sm:text-base">
                        <Link href={ctaHref}>
                          {ctaLabel}
                          <ArrowLeft className="size-4" />
                        </Link>
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="lg"
                      asChild
                      className="border-primary-foreground/25 text-primary-foreground hover:bg-primary-foreground/10 h-11 bg-transparent px-4 text-sm sm:px-6 sm:text-base"
                    >
                      <Link href="/finder">עזרו לי לבחור</Link>
                    </Button>
                  </div>
                </div>

                {featureImage && (
                  <div className="hidden lg:block">
                    <div className="relative w-64 overflow-hidden rounded-2xl bg-white p-4 shadow-xl xl:w-72">
                      <div className="relative aspect-[4/5]">
                        <Image
                          src={featureImage}
                          alt={featureLabel ?? ""}
                          fill
                          sizes="288px"
                          className="object-contain"
                          referrerPolicy="no-referrer"
                          priority
                        />
                      </div>
                      {featureLabel && (
                        <p className="text-foreground mt-2 text-center text-xs font-semibold">{featureLabel}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Two promo tiles: today's deals, and the finder — Alfred's
                convenience, in a tile rather than a headline. */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
              <Link
                href="/deals"
                className="group bg-brand text-brand-foreground relative flex items-center gap-3 overflow-hidden rounded-2xl p-4 transition-shadow hover:shadow-lg sm:gap-4 sm:p-5"
              >
                <div
                  aria-hidden
                  className="absolute inset-0"
                  style={{ background: "radial-gradient(ellipse 50% 100% at 100% 100%, oklch(1 0 0 / 0.18), transparent)" }}
                />
                <span className="bg-brand-foreground/15 relative flex size-12 shrink-0 items-center justify-center rounded-full">
                  <Tag className="size-6" />
                </span>
                <div className="relative min-w-0 flex-1">
                  <p className="text-base font-black sm:text-lg">מבצעים חמים</p>
                  <p className="text-brand-foreground/85 text-sm">
                    {bestDiscount > 0 ? `עד ${bestDiscount}% הנחה על מוצרים במלאי` : "הנחות לזמן מוגבל על מוצרים במלאי"}
                  </p>
                </div>
                {deals.length > 0 && (
                  <div className="relative hidden shrink-0 -space-x-3 space-x-reverse sm:flex">
                    {deals.slice(0, 3).map(
                      (p) =>
                        p.imageUrl && (
                          <span
                            key={p.id}
                            className="relative size-12 overflow-hidden rounded-full border-2 border-white bg-white"
                          >
                            <Image src={p.imageUrl} alt="" fill sizes="48px" className="object-contain p-1" referrerPolicy="no-referrer" />
                          </span>
                        ),
                    )}
                  </div>
                )}
                <ArrowLeft className="relative size-5 shrink-0 transition-transform group-hover:-translate-x-1" />
              </Link>

              <Link
                href="/finder"
                className="group border-border bg-card hover:border-brand/40 relative flex items-center gap-3 rounded-2xl border p-4 transition-all hover:shadow-md sm:gap-4 sm:p-5"
              >
                <Image
                  src="/mascot/alfred.png"
                  alt=""
                  width={64}
                  height={64}
                  className="size-14 shrink-0 rounded-full object-cover object-top"
                />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-base font-black sm:text-lg">
                    לא בטוחים מה לבחור?
                    <Sparkles className="text-brand size-4" />
                  </p>
                  <p className="text-muted-foreground text-sm">כמה שאלות קצרות, ואלפרד ימליץ על המוצר המתאים</p>
                </div>
                <ArrowLeft className="text-brand size-5 shrink-0 transition-transform group-hover:-translate-x-1" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
