import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Check, ShieldCheck, Sparkles, Tag } from "lucide-react";
import { SearchBar } from "@/components/layout/search-bar";
import { Button } from "@/components/ui/button";
import { DepartmentMenu } from "@/components/home/department-menu";
import { CategoryCircles } from "@/components/home/category-circles";
import { PromoCarousel, type PromoSlide } from "@/components/home/promo-carousel";
import { discountPercent, formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FREE_DELIVERY_THRESHOLD } from "@/lib/delivery";
import type { DepartmentCount, CategoryTile } from "@/lib/queries/categories";
import type { ProductCardData } from "@/components/product/product-card";
import { showsOnDesktop, showsOnPhone, type Banner } from "@/lib/banners";

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
  banners,
}: {
  title: string;
  subtitle: string;
  ctaLabel?: string;
  ctaHref?: string;
  departments: DepartmentCount[];
  categoryTiles: CategoryTile[];
  deals: ProductCardData[];
  // The owner's banners from /admin/banners, active ones in order. When
  // there are none, the slides are built from live data instead.
  banners: Banner[];
}) {
  const bestDiscount = deals
    .map((p) => discountPercent(p.price, p.compareAtPrice ?? undefined))
    .filter((n): n is number => typeof n === "number")
    .reduce((max, n) => Math.max(max, n), 0);

  // Without banners from the admin, the slides say only what the data
  // says: today's best real discount with today's real deal photographs,
  // and the delivery rule with the sampler's photographs of what it
  // applies to. Nothing here is a campaign that does not exist — a real
  // one is entered at /admin/banners and takes over the slot.
  const dealImages = deals.map((p) => p.imageUrl).filter((u): u is string => !!u);
  const tileImages = ["fridge-4-door", "tvs", "washing-machines"]
    .map((slug) => categoryTiles.find((t) => t.slug === slug)?.imageUrl)
    .filter((u): u is string => !!u);
  const dataSlides: PromoSlide[] = [
    ...(bestDiscount > 0
      ? [
          {
            kind: "promo" as const,
            title: `עד ${bestDiscount}% הנחה`,
            body: "על המבצעים של היום",
            href: "/deals",
            tone: "brand" as const,
            images: dealImages.slice(0, 3),
          },
        ]
      : []),
    {
      kind: "promo" as const,
      title: "משלוח חינם",
      body: `בהזמנה מעל ${formatPrice(FREE_DELIVERY_THRESHOLD)}`,
      href: "/category/refrigeration",
      tone: "light" as const,
      images: tileImages.length > 0 ? tileImages : dealImages.slice(0, 3),
    },
  ];
  // Each device shows the banners that have a picture for it. A picture
  // is never borrowed from the other device — a wide phone picture in the
  // square desktop card, or a square in the wide phone slot, is a crop of
  // the owner's artwork — so a banner with one picture appears on one
  // device only. Collage banners appear on both.
  const toSlide = (b: Banner, device: "phone" | "desktop"): PromoSlide =>
    b.layout === "image"
      ? { kind: "image", src: device === "phone" ? b.images[0] : b.desktopImage!, alt: b.title || b.body, href: b.href }
      : { kind: "promo", title: b.title, body: b.body, href: b.href, tone: b.tone, images: b.images };
  const phoneBanners = banners.filter(showsOnPhone);
  const desktopBanners = banners.filter(showsOnDesktop);
  const phoneSlides = phoneBanners.length > 0 ? phoneBanners.map((b) => toSlide(b, "phone")) : dataSlides;
  const desktopSlides = desktopBanners.length > 0 ? desktopBanners.map((b) => toSlide(b, "desktop")) : dataSlides;
  // Square pictures get a slightly wider column and a card of their own
  // height, centred beside the headline.
  const desktopPictures = desktopBanners.length > 0 && desktopBanners.every((b) => b.layout === "image");

  return (
    <section className="bg-secondary border-b">
      <div className="mx-auto max-w-7xl px-4 pt-3 pb-5 lg:py-6">
        {/* ---------------- phone ---------------- */}
        <div className="lg:hidden">
          <CategoryCircles tiles={categoryTiles} className="mb-3" />

          {/* One card: the shop's line and the importer chip ride at the
              top of every slide, and only the offer underneath rotates.
              The three reasons to buy here follow as a line of text, not
              a box. */}
          <PromoCarousel slides={phoneSlides} compact slogan={title} />

          <ul className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs font-medium">
            {["מחירי אונליין", "אחריות יבואן", "משלוח מהיר עד הבית"].map((f) => (
              <li key={f} className="flex items-center gap-1">
                <Check className="text-brand size-3.5" strokeWidth={2.5} />
                {f}
              </li>
            ))}
          </ul>
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
              <div className={cn("relative grid items-center gap-10 p-8", desktopPictures ? "grid-cols-[1fr_22rem]" : "grid-cols-[1fr_18rem]")}>
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
                <PromoCarousel
                  slides={desktopSlides}
                  stacked
                  className={desktopPictures ? "self-center shadow-xl" : "self-stretch shadow-xl [&>div:first-child]:h-full"}
                />
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
