import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, Sparkles, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { SearchBar } from "@/components/layout/search-bar";
import { Button } from "@/components/ui/button";
import { DepartmentMenu } from "@/components/home/department-menu";
import { CategoryCircles } from "@/components/home/category-circles";
import { discountPercent } from "@/lib/format";
import type { DepartmentCount, CategoryTile } from "@/lib/queries/categories";
import type { ProductCardData } from "@/components/product/product-card";

/**
 * PLACEHOLDER promotions, asked for as stand-ins while the real campaign
 * copy is decided. Nothing here is a live offer: no cashback and no 1+1
 * exists in the shop's promotion rules, so this must not reach main as
 * it stands — replace the two entries with real, configured promotions
 * (or wire them to the Promotion table) before merging.
 */
const PROMOS: Promo[] = [
  { title: "20% קאשבק", body: "לפרטים", href: "/deals", tone: "brand" },
  { title: "1+1", body: "על מוצרים נבחרים", href: "/deals", tone: "light" },
];

type Promo = { title: string; body: string; href: string; tone: "brand" | "light" };

function PromoCard({ promo, compact = false }: { promo: Promo; compact?: boolean }) {
  const brand = promo.tone === "brand";
  return (
    <Link
      href={promo.href}
      className={cn(
        "group relative flex flex-col justify-between overflow-hidden rounded-2xl p-4 transition-shadow hover:shadow-lg",
        brand ? "bg-brand text-brand-foreground" : "bg-white text-foreground",
        compact ? "min-h-24" : "min-h-32"
      )}
    >
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: brand
            ? "radial-gradient(ellipse 60% 90% at 100% 100%, oklch(1 0 0 / 0.22), transparent)"
            : "radial-gradient(ellipse 60% 90% at 0% 0%, oklch(0.658 0.209 39.1 / 0.14), transparent)",
        }}
      />
      <span className={cn("relative font-black leading-none tracking-tight", compact ? "text-2xl" : "text-3xl xl:text-4xl")}>
        {promo.title}
      </span>
      <span className={cn("relative mt-2 flex items-center gap-1 text-xs font-semibold", brand ? "text-brand-foreground/90" : "text-brand")}>
        {promo.body}
        <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
      </span>
    </Link>
  );
}

/**
 * The first screen: a department menu down one side, a banner beside it,
 * two promo tiles under the banner. The layout of a shop, not of a
 * landing page — the shape the big Israeli electronics retailers open
 * on, which is exactly the recognition a visitor who has never heard of
 * this one needs in the first second.
 *
 * The banner carries the importer-warranty chip, the headline, Alfred's
 * search bar and the two CTAs, with the promotions beside it on a
 * desktop and under it on a phone. Alfred keeps the search bar, credited
 * under it on wider screens.
 */
export function HeroBand({
  title,
  subtitle,
  ctaLabel,
  ctaHref,
  departments,
  categoryTiles,
  deals,
}: {
  title: string;
  subtitle: string;
  ctaLabel?: string;
  ctaHref?: string;
  departments: DepartmentCount[];
  // The phone's category row under the search: round photo tiles.
  categoryTiles: CategoryTile[];
  deals: ProductCardData[];
}) {
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
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold sm:gap-2 sm:text-xs">
                    <span className="bg-primary-foreground/10 ring-primary-foreground/15 inline-flex items-center gap-1 rounded-full px-2.5 py-1 ring-1 sm:gap-1.5 sm:px-3">
                      <ShieldCheck className="text-brand size-3.5" />
                      יבואן רשמי
                    </span>
                  </div>

                  <h1 className="max-w-xl text-[1.6rem] leading-tight font-black text-balance sm:text-3xl lg:text-4xl">{title}</h1>
                  <p className="text-primary-foreground/75 max-w-xl text-sm sm:text-base">{subtitle}</p>

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

                  {/* Phone: the promos as a pair under the buttons. */}
                  <div className="grid grid-cols-2 gap-2 lg:hidden">
                    {PROMOS.map((p) => (
                      <PromoCard key={p.title} promo={p} compact />
                    ))}
                  </div>
                </div>

                {/* Desktop: the promos stacked where the product card was. */}
                <div className="hidden w-64 flex-col gap-3 lg:flex xl:w-72">
                  {PROMOS.map((p) => (
                    <PromoCard key={p.title} promo={p} />
                  ))}
                </div>
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
