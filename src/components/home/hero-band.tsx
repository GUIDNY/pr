import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Check, ShieldCheck, Sparkles, Tag } from "lucide-react";
import { SearchBar } from "@/components/layout/search-bar";
import { Button } from "@/components/ui/button";
import { DepartmentMenu } from "@/components/home/department-menu";
import { CategoryCircles } from "@/components/home/category-circles";
import { PromoCarousel, type PromoSlide } from "@/components/home/promo-carousel";
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
const PROMOS: PromoSlide[] = [
  { kind: "promo", title: "20% קאשבק", body: "לפרטים", href: "/deals", tone: "brand" },
  { kind: "promo", title: "1+1", body: "על מוצרים נבחרים", href: "/deals", tone: "light" },
];

/**
 * The first screen.
 *
 * On a phone: six round category tiles and "everything", the shop's own
 * banner (importer chip, headline, three reasons to buy here, one CTA),
 * then one short slot whose promotion slides rotate with real product
 * photographs on them. The deals grid follows straight after on the
 * page, because a shop shows a product and a price early.
 *
 * On a desktop: the department menu down one side with a live count per
 * line, the navy banner beside it carrying the importer chip, the
 * headline, Alfred's search bar and the CTAs, with the rotating
 * promotions in a card at the banner's end, and the two action tiles
 * under it.
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
  categoryTiles: CategoryTile[];
  deals: ProductCardData[];
}) {
  // The promotions with real product photographs from today's deals on
  // them (see PromoCarousel) — the pictures are the catalogue's own.
  const dealImages = deals.map((p) => p.imageUrl).filter((u): u is string => !!u);
  const promos: PromoSlide[] = PROMOS.map((p, i) =>
    p.kind === "promo" ? { ...p, images: i === 0 ? dealImages.slice(0, 3) : dealImages.slice(3, 6).length ? dealImages.slice(3, 6) : dealImages.slice(0, 3).reverse() } : p,
  );

  const bestDiscount = deals
    .map((p) => discountPercent(p.price, p.compareAtPrice ?? undefined))
    .filter((n): n is number => typeof n === "number")
    .reduce((max, n) => Math.max(max, n), 0);


  return (
    <section className="bg-secondary border-b">
      <div className="mx-auto max-w-7xl px-4 pt-3 pb-5 lg:py-6">
        {/* ---------------- phone ---------------- */}
        <div className="lg:hidden">
          <CategoryCircles tiles={categoryTiles} className="mb-3" />

          {/* The shop's own line stays put; only the promotions rotate
              under it. The line under the headline is the reason to buy
              here, in three facts, not a slogan. */}
          <div className="bg-primary text-primary-foreground relative overflow-hidden rounded-2xl p-5">
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse 60% 90% at 0% 50%, oklch(0.42 0.12 264 / 0.9), transparent), radial-gradient(ellipse 45% 70% at 100% 0%, oklch(0.658 0.209 39.1 / 0.3), transparent)",
              }}
            />
            <div className="relative flex flex-col items-start gap-3">
              <span className="bg-primary-foreground/10 ring-primary-foreground/15 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1">
                <ShieldCheck className="text-brand size-3.5" />
                יבואן רשמי
              </span>
              <p className="max-w-md text-[1.6rem] leading-tight font-black text-balance">{title}</p>
              <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium">
                {["מחירי אונליין", "אחריות יבואן", "משלוח מהיר עד הבית"].map((f) => (
                  <li key={f} className="flex items-center gap-1">
                    <Check className="text-brand size-4" strokeWidth={2.5} />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={ctaHref ?? "/deals"}
                className="bg-brand text-brand-foreground hover:bg-brand-hover mt-1 inline-flex h-10 items-center gap-1.5 rounded-lg px-5 text-sm font-bold shadow-sm transition-colors"
              >
                לכל המבצעים
                <ArrowLeft className="size-4" />
              </Link>
            </div>
          </div>

          <PromoCarousel slides={promos} compact className="mt-3" />
        </div>

        {/* ---------------- desktop ---------------- */}
        <div className="hidden grid-cols-[250px_1fr] items-stretch gap-4 lg:grid">
          <DepartmentMenu departments={departments} />

          <div className="flex min-w-0 flex-col gap-4">
            <div className="bg-primary text-primary-foreground relative overflow-hidden rounded-2xl">
              <div
                aria-hidden
                className="absolute inset-0"
                style={{
                  background:
                    "radial-gradient(ellipse 60% 90% at 0% 50%, oklch(0.42 0.12 264 / 0.9), transparent), radial-gradient(ellipse 40% 60% at 100% 0%, oklch(0.658 0.209 39.1 / 0.25), transparent)",
                }}
              />
              <div className="relative grid grid-cols-[1fr_18rem] items-center gap-10 p-8">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                    <span className="bg-primary-foreground/10 ring-primary-foreground/15 inline-flex items-center gap-1.5 rounded-full px-3 py-1 ring-1">
                      <ShieldCheck className="text-brand size-3.5" />
                      יבואן רשמי
                    </span>
                  </div>

                  <h1 className="max-w-xl text-4xl leading-tight font-black text-balance">{title}</h1>
                  <p className="text-primary-foreground/75 max-w-xl text-base">{subtitle}</p>

                  <div className="w-full max-w-xl">
                    <SearchBar size="hero" showIntro={false} className="mx-0" />
                    <p className="text-primary-foreground/70 mt-2 flex items-center gap-2 text-sm">
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

                  <div className="flex flex-wrap items-center gap-3">
                    {ctaLabel && ctaHref && (
                      <Button variant="brand" size="lg" asChild className="h-11 px-6 text-base">
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
                      className="border-primary-foreground/25 text-primary-foreground hover:bg-primary-foreground/10 h-11 bg-transparent px-6 text-base"
                    >
                      <Link href="/finder">עזרו לי לבחור</Link>
                    </Button>
                  </div>
                </div>

                {/* The promotions, rotating, in the banner's end column. */}
                <PromoCarousel slides={promos} className="self-stretch shadow-xl [&>div:first-child]:h-full" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Link
                href="/deals"
                className="group bg-brand text-brand-foreground relative flex items-center gap-4 overflow-hidden rounded-2xl p-5 transition-shadow hover:shadow-lg"
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
                  <p className="text-lg font-black">מבצעים חמים</p>
                  <p className="text-brand-foreground/85 text-sm">
                    {bestDiscount > 0 ? `עד ${bestDiscount}% הנחה על מוצרים במלאי` : "הנחות לזמן מוגבל על מוצרים במלאי"}
                  </p>
                </div>
                {deals.length > 0 && (
                  <div className="relative flex shrink-0 -space-x-3 space-x-reverse">
                    {deals.slice(0, 3).map(
                      (p) =>
                        p.imageUrl && (
                          <span key={p.id} className="relative size-12 overflow-hidden rounded-full border-2 border-white bg-white">
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
                className="group border-border bg-card hover:border-brand/40 relative flex items-center gap-4 rounded-2xl border p-5 transition-all hover:shadow-md"
              >
                <Image
                  src="/mascot/alfred.png"
                  alt=""
                  width={64}
                  height={64}
                  className="size-14 shrink-0 rounded-full object-cover object-top"
                />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-lg font-black">
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
