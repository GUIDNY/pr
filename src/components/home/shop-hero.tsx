import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, CreditCard, MapPin, ShieldCheck, Store, Truck } from "lucide-react";
import { SearchBar } from "@/components/layout/search-bar";
import { Button } from "@/components/ui/button";
import { formatPrice, discountPercent } from "@/lib/format";
import { BUSINESS_ADDRESS, BUSINESS_MAP_URL } from "@/lib/business";
import type { ProductCardData } from "@/components/product/product-card";
import { cn } from "@/lib/utils";

/**
 * The first screen, built to answer one question in about a second: is
 * this a real shop I can buy a fridge from?
 *
 * Everything on it is something that can be checked rather than a claim
 * about software. The importer warranty, the delivery, the street address
 * in Hadera and the size of the live catalogue lead; three real products
 * with real prices sit beside them, so "good prices" is shown rather than
 * asserted. Alfred is here too — the search bar is his, and the line under
 * it says so — but as a convenience the shop offers, not as the headline.
 * The light ground is deliberate: the old navy block read as a landing
 * page for an app, and a catalogue shop wants to look like its products.
 */
export function ShopHero({
  title,
  subtitle,
  ctaLabel,
  ctaHref,
  showcase,
  productCount,
  brandCount,
}: {
  title: string;
  subtitle: string;
  ctaLabel?: string;
  ctaHref?: string;
  // Real, in-stock deals, up to three. The card's data type so the hero
  // can never show a product a listing would not.
  showcase: ProductCardData[];
  productCount: number;
  brandCount: number;
}) {
  const products = showcase.slice(0, 3);
  // Rounded down to the hundred so the number is true on every visit
  // between two syncs: "1,300+" stays right while the count drifts
  // between 1,300 and 1,399.
  const roundedCount = Math.floor(productCount / 100) * 100;
  const facts = [
    { icon: ShieldCheck, title: "אחריות יבואן רשמי", body: "על כל מוצר באתר" },
    { icon: Truck, title: "משלוח עד הבית", body: "לכל הארץ, כולל התקנה" },
    { icon: CreditCard, title: "תשלום מאובטח", body: "גם בפריסה לתשלומים" },
    { icon: Store, title: "חנות פיזית בחדרה", body: BUSINESS_ADDRESS, href: BUSINESS_MAP_URL },
  ];

  return (
    <section className="bg-secondary relative overflow-hidden border-b">
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 45% 60% at 92% 0%, oklch(0.658 0.209 39.1 / 0.12), transparent), radial-gradient(ellipse 40% 55% at 4% 100%, oklch(0.32 0.1 264 / 0.09), transparent)",
        }}
      />
      <div
        className={cn(
          "relative mx-auto grid max-w-7xl grid-cols-1 gap-8 px-4 py-8 sm:py-12 lg:items-center lg:gap-12 lg:py-16",
          products.length > 0 && "lg:grid-cols-[1.15fr_1fr]"
        )}
      >
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="bg-background border-border text-foreground inline-flex items-center gap-1.5 rounded-full border px-3 py-1 shadow-sm">
              <ShieldCheck className="text-brand size-3.5" />
              יבואן רשמי
            </span>
            {roundedCount >= 100 && (
              <span className="bg-background border-border text-foreground inline-flex items-center gap-1.5 rounded-full border px-3 py-1 shadow-sm tabular-nums">
                {roundedCount.toLocaleString("he-IL")}+ מוצרים במלאי
                {brandCount > 0 && <span className="text-muted-foreground font-normal">מ־{brandCount} מותגים</span>}
              </span>
            )}
            <a
              href={BUSINESS_MAP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-background border-border text-foreground hover:border-brand/40 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 shadow-sm transition-colors"
            >
              <MapPin className="text-brand size-3.5" />
              חנות בחדרה
            </a>
          </div>

          <h1 className="max-w-2xl text-3xl leading-[1.15] font-black text-balance sm:text-4xl lg:text-5xl">{title}</h1>
          <p className="text-muted-foreground max-w-xl text-base sm:text-lg">{subtitle}</p>

          <div className="w-full max-w-2xl">
            <SearchBar size="hero" showIntro={false} className="mx-0" />
            <p className="text-muted-foreground mt-2.5 flex items-center gap-2 text-sm">
              <Image
                src="/mascot/alfred.png"
                alt=""
                width={24}
                height={24}
                className="size-6 shrink-0 rounded-full object-cover object-top"
              />
              <span>
                אפשר גם לכתוב ל<span className="text-foreground font-semibold">אלפרד</span>, העוזר החכם שלנו, בשפה חופשית:
                &quot;מקרר גדול ושקט עד 5,000 ₪&quot;
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
            <Button variant="outline" size="lg" asChild className="bg-background h-11 px-6 text-base">
              <Link href="/finder">עזרו לי לבחור</Link>
            </Button>
          </div>

          <dl className="mt-1 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            {facts.map(({ icon: Icon, title: t, body, href }) => {
              const inner = (
                <>
                  <span className="bg-brand/10 text-brand flex size-9 shrink-0 items-center justify-center rounded-full">
                    <Icon className="size-4.5" strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0">
                    <dt className="text-sm font-semibold">{t}</dt>
                    <dd className="text-muted-foreground text-xs leading-snug">{body}</dd>
                  </span>
                </>
              );
              return href ? (
                <a
                  key={t}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-brand flex items-start gap-2.5 transition-colors"
                >
                  {inner}
                </a>
              ) : (
                <div key={t} className="flex items-start gap-2.5">
                  {inner}
                </div>
              );
            })}
          </dl>
        </div>

        {products.length > 0 && <Showcase products={products} />}
      </div>
    </section>
  );
}

/* Three real deals: one large, two small. The point is not the layout but
   what it puts on the first screen — photographs of things that are in
   stock, with the price and what it was, which is the shortest possible
   proof that this is a shop and not a brochure. */
function Showcase({ products }: { products: ProductCardData[] }) {
  const [lead, ...rest] = products;
  return (
    <div className="grid grid-cols-3 gap-3 sm:gap-4 lg:grid-cols-2 lg:grid-rows-2">
      <ShowcaseCard product={lead} lead className="col-span-3 sm:col-span-1 lg:col-span-1 lg:row-span-2" />
      {rest.map((p) => (
        <ShowcaseCard key={p.id} product={p} className="col-span-3 sm:col-span-1" />
      ))}
    </div>
  );
}

function ShowcaseCard({
  product,
  lead = false,
  className,
}: {
  product: ProductCardData;
  lead?: boolean;
  className?: string;
}) {
  const pct = discountPercent(product.price, product.compareAtPrice ?? undefined);
  return (
    <Link
      href={`/product/${product.slug}`}
      className={cn(
        "group border-border/80 bg-card hover:border-brand/40 flex gap-3 overflow-hidden rounded-2xl border p-3 shadow-sm transition-all hover:shadow-md",
        lead ? "flex-col" : "flex-row items-center sm:flex-col sm:items-stretch",
        className
      )}
    >
      <div
        className={cn(
          "relative shrink-0 overflow-hidden rounded-xl bg-white",
          lead ? "aspect-[4/3] w-full" : "size-24 sm:aspect-square sm:size-auto sm:w-full"
        )}
      >
        {product.imageUrl && (
          <Image
            src={product.imageUrl}
            alt={product.title}
            fill
            sizes={lead ? "(min-width: 1024px) 30vw, 90vw" : "(min-width: 1024px) 15vw, 40vw"}
            className="object-contain p-2 transition-transform duration-300 group-hover:scale-105"
            referrerPolicy="no-referrer"
            priority={lead}
          />
        )}
        {pct && (
          <span className="bg-brand text-brand-foreground absolute top-2 start-2 rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums">
            {pct}%-
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-muted-foreground text-xs font-semibold">{product.brandName}</span>
        <span className={cn("line-clamp-2 font-medium", lead ? "text-base" : "text-sm")}>{product.title}</span>
        <span className="mt-1 flex flex-wrap items-baseline gap-x-2">
          <span className={cn("font-bold tabular-nums", lead ? "text-2xl" : "text-lg")}>{formatPrice(product.price)}</span>
          {product.compareAtPrice && product.compareAtPrice > product.price && (
            <span className="text-muted-foreground text-xs tabular-nums line-through">
              {formatPrice(product.compareAtPrice)}
            </span>
          )}
        </span>
      </div>
    </Link>
  );
}
