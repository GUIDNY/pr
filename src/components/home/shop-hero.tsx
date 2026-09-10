import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Phone, ShieldCheck, Store, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchBar } from "@/components/layout/search-bar";
import { BUSINESS, BUSINESS_ADDRESS } from "@/lib/business";
import { formatPrice } from "@/lib/format";
import type { ProductCardData } from "@/components/product/product-card";

/**
 * What the shop says about itself, above everything else.
 *
 * This replaces the block that led with Alfred. Alfred is a good tool and he
 * is still on the page, further down and doing a tool's job — but a homepage
 * that opens by introducing its assistant makes its first claim a claim
 * about software, to a visitor who has not been told this is a real shop.
 * Someone about to consider a fridge at ₪14,900 is asking whether the shop
 * exists, whether it has what they need, and what happens when it goes
 * wrong.
 *
 * So the answers are the opening, and each is checkable: the catalogue as a
 * number read live, importer warranty, a street address with a phone on it.
 * No rating, no customer count — this shop has neither, and the one thing
 * that would cost more than saying nothing is inventing them.
 *
 * And a real appliance, priced, rather than a gradient with type on it. The
 * first attempt at this hero had only the words, and words alone ask to be
 * taken on trust; a photographed four-door fridge with ₪14,900 under it
 * makes the same argument and shows its evidence. It is the most expensive
 * live product, chosen by query so it maintains itself.
 */
export function ShopHero({
  productCount,
  departmentCount,
  showcase,
  ctaLabel,
  ctaHref,
}: {
  productCount: number;
  departmentCount: number;
  showcase: ProductCardData | null;
  ctaLabel?: string;
  ctaHref?: string;
}) {
  return (
    <section className="bg-primary text-primary-foreground relative overflow-hidden">
      {/* Warmed at the corner the product sits in, so the photograph has
          something to lift off and the orange below it is not the only warm
          thing on a field of navy. */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-90"
        style={{
          background:
            "radial-gradient(ellipse 65% 85% at 88% 15%, oklch(0.38 0.1 39.1 / 0.5), transparent), radial-gradient(ellipse 55% 70% at 0% 100%, oklch(0.3 0.05 264 / 0.65), transparent)",
        }}
      />

      <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-8 px-4 py-10 sm:py-14 lg:grid-cols-[1.15fr_1fr] lg:gap-14">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <h1 className="max-w-2xl text-3xl leading-[1.1] font-black tracking-tight text-balance sm:text-5xl">
              מוצרי חשמל לבית,
              <br className="hidden sm:block" /> עם אחריות יבואן רשמי
            </h1>
            <p className="text-primary-foreground/75 max-w-xl text-sm leading-relaxed sm:text-base">
              <strong className="text-primary-foreground font-bold tabular-nums">
                {productCount.toLocaleString("he-IL")}
              </strong>{" "}
              מוצרים במלאי ב-{departmentCount} מחלקות, משלוח עד הבית לכל הארץ, וחנות בחדרה שאפשר
              להיכנס אליה ולשאול.
            </p>
          </div>

          {/* For a catalogue this size, typing a model number beats any
              amount of browsing — so the search is in the hero and not only
              in the header. */}
          <div className="max-w-xl">
            <SearchBar size="hero" showIntro={false} />
          </div>

          <div className="flex flex-col items-stretch gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            <Button
              variant="brand"
              size="lg"
              asChild
              className="h-12 w-full justify-center rounded-xl text-base font-bold sm:w-fit sm:px-7"
            >
              <Link href="#departments">
                לכל המחלקות
                <ArrowLeft className="size-4" />
              </Link>
            </Button>
            {ctaLabel && ctaHref && (
              <Button
                variant="outline"
                size="lg"
                asChild
                className="border-primary-foreground/25 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground h-12 w-full justify-center rounded-xl bg-transparent text-base font-semibold sm:w-fit sm:px-6"
              >
                <Link href={ctaHref}>{ctaLabel}</Link>
              </Button>
            )}
            <a
              href={BUSINESS.phoneHref}
              className="text-primary-foreground/85 hover:text-primary-foreground flex items-center justify-center gap-2 py-2 text-base font-bold sm:py-0 sm:ps-2"
            >
              <Phone className="size-4" />
              {BUSINESS.phone}
            </a>
          </div>

          {/* Three facts, not three slogans. Each is a number this page just
              read or a place a customer can walk into. */}
          <ul className="border-primary-foreground/15 grid list-none grid-cols-1 gap-x-8 gap-y-3 border-t pt-6 text-sm sm:grid-cols-3">
            {[
              { Icon: ShieldCheck, title: "אחריות יבואן רשמי", body: "על כל מוצר בקטלוג" },
              { Icon: Truck, title: "משלוח עד הבית", body: "לכל הארץ, כולל התקנה" },
              { Icon: Store, title: "חנות פיזית", body: BUSINESS_ADDRESS },
            ].map(({ Icon, title, body }) => (
              <li key={title} className="flex items-start gap-2.5">
                <Icon className="text-brand mt-0.5 size-4 shrink-0" />
                <span>
                  <strong className="font-bold">{title}</strong>
                  <span className="text-primary-foreground/70 block">{body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {showcase && (
          <Link
            href={`/product/${showcase.slug}`}
            className="group border-primary-foreground/15 bg-primary-foreground/[0.06] hover:border-brand/60 relative hidden overflow-hidden rounded-3xl border p-5 transition-colors lg:block"
          >
            <div className="bg-card relative aspect-square overflow-hidden rounded-2xl">
              {showcase.imageUrl && (
                <Image
                  src={showcase.imageUrl}
                  alt={showcase.title}
                  fill
                  sizes="(min-width: 1024px) 420px, 0px"
                  className="object-contain p-6 transition-transform duration-500 group-hover:scale-[1.03]"
                  priority
                />
              )}
            </div>
            <div className="flex items-end justify-between gap-4 pt-4">
              <div className="min-w-0">
                <p className="text-primary-foreground/60 text-xs font-bold tracking-[0.1em]">
                  {showcase.brandName}
                </p>
                <p className="mt-1 line-clamp-2 text-sm leading-snug font-semibold">{showcase.title}</p>
              </div>
              <p className="shrink-0 text-2xl font-black tabular-nums">{formatPrice(showcase.price)}</p>
            </div>
          </Link>
        )}
      </div>
    </section>
  );
}
