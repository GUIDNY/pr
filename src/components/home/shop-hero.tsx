import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, CreditCard, MapPin, ShieldCheck, Store, Truck } from "lucide-react";
import { SearchBar } from "@/components/layout/search-bar";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/format";
import { BUSINESS_ADDRESS, BUSINESS_MAP_URL } from "@/lib/business";
import type { DepartmentShowcase } from "@/lib/queries/products";
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
  departments,
  productCount,
  brandCount,
}: {
  title: string;
  subtitle: string;
  ctaLabel?: string;
  ctaHref?: string;
  // The biggest departments, each with a real product photo and the price
  // its range starts at. Four make a grid; fewer and the hero goes single
  // column rather than showing a lopsided one.
  departments: DepartmentShowcase[];
  productCount: number;
  brandCount: number;
}) {
  const tiles = departments
    .map((d) => ({ ...d, imageUrl: d.products.find((p) => p.imageUrl)?.imageUrl ?? null }))
    .filter((d) => d.imageUrl)
    .slice(0, 4);
  const showTiles = tiles.length === 4;
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
    // A flat, warm off-white. The orange glow that used to sit in the
    // corner read as a smudge next to the product photographs; the
    // colour on this screen should be the products' own.
    <section className="bg-secondary border-b">
      <div
        className={cn(
          "mx-auto grid max-w-7xl grid-cols-1 gap-8 px-4 py-8 sm:py-12 lg:items-center lg:gap-12 lg:py-14",
          showTiles && "lg:grid-cols-[1.1fr_1fr]"
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

        {showTiles && <DepartmentTiles tiles={tiles} />}
      </div>
    </section>
  );
}

/* Four equal tiles, one per major department: a photograph of a real
   product from it, the department's name, and the price its range starts
   at. Equal on purpose — three deal cards of different heights, with a
   kettle adrift in the tallest, looked like a collage nobody finished.
   Four squares that each say "we sell fridges, from ₪2,300" say what the
   shop is and where to start, and every one of them is a door. */
function DepartmentTiles({
  tiles,
}: {
  tiles: (DepartmentShowcase & { imageUrl: string | null })[];
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4">
      {tiles.map((d) => (
        <Link
          key={d.slug}
          href={`/category/${d.slug}`}
          className="group border-border/80 bg-card hover:border-brand/50 flex flex-col overflow-hidden rounded-2xl border p-3 shadow-sm transition-all hover:shadow-md sm:p-4"
        >
          <div className="relative aspect-[5/4] w-full overflow-hidden rounded-xl bg-white">
            {d.imageUrl && (
              <Image
                src={d.imageUrl}
                alt=""
                fill
                sizes="(min-width: 1024px) 22vw, 45vw"
                className="object-contain p-3 transition-transform duration-300 group-hover:scale-105"
                referrerPolicy="no-referrer"
                priority
              />
            )}
          </div>
          <div className="mt-3 flex items-end justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold sm:text-base">{d.name}</p>
              {d.minPrice !== null && (
                <p className="text-muted-foreground text-xs tabular-nums">החל מ־{formatPrice(d.minPrice)}</p>
              )}
            </div>
            <span className="bg-brand/10 text-brand group-hover:bg-brand group-hover:text-brand-foreground flex size-8 shrink-0 items-center justify-center rounded-full transition-colors">
              <ArrowLeft className="size-4" />
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
