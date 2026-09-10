import Link from "next/link";
import { ArrowLeft, Phone, ShieldCheck, Store, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchBar } from "@/components/layout/search-bar";
import { BUSINESS, BUSINESS_ADDRESS } from "@/lib/business";

/**
 * What the shop says about itself, above everything else.
 *
 * This replaces the block that led with Alfred. Alfred is a good tool and he
 * is still on the page, further down and doing a tool's job — but a homepage
 * that opens by introducing its assistant is a homepage whose first claim is
 * about software. A visitor who has never heard of this shop and is about to
 * consider a fridge at ₪14,900 is asking something else entirely: is this a
 * real shop, does it have what I need, and what happens if it goes wrong.
 *
 * So the three things that answer that are the opening: the size of the
 * catalogue as a live number, the warranty, and a street address with a
 * phone number on it. None of them is a slogan and every one of them can be
 * checked, which is the only kind of trust signal this shop can honestly
 * make — it has no reviews, no ratings and no customer count, and inventing
 * them is the one thing that would cost more than saying nothing.
 *
 * Search sits in the hero rather than only in the header because it is the
 * fastest route into a catalogue this size, and because a search box people
 * can see is the single most-used control on a shop like this one.
 */
export function ShopHero({
  productCount,
  departmentCount,
  ctaLabel,
  ctaHref,
}: {
  productCount: number;
  departmentCount: number;
  ctaLabel?: string;
  ctaHref?: string;
}) {
  return (
    <section className="bg-primary text-primary-foreground relative overflow-hidden">
      {/* The same navy the footer and the logo's plug icon use, warmed at one
          corner so the orange CTA below has something to sit against. Kept
          quiet: the products are the colour on this page. */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-90"
        style={{
          background:
            "radial-gradient(ellipse 70% 90% at 85% 10%, oklch(0.35 0.09 39.1 / 0.45), transparent), radial-gradient(ellipse 60% 70% at 5% 95%, oklch(0.3 0.05 264 / 0.6), transparent)",
        }}
      />

      <div className="relative mx-auto flex max-w-7xl flex-col gap-7 px-4 py-10 sm:py-14">
        <div className="flex flex-col gap-3">
          <h1 className="max-w-3xl text-2xl leading-tight font-black text-balance sm:text-4xl">
            מוצרי חשמל לבית, עם אחריות יבואן רשמי
          </h1>
          <p className="text-primary-foreground/75 max-w-2xl text-sm leading-relaxed sm:text-base">
            <strong className="text-primary-foreground font-bold tabular-nums">
              {productCount.toLocaleString("he-IL")}
            </strong>{" "}
            מוצרים במלאי ב-{departmentCount} מחלקות, משלוח עד הבית לכל הארץ, וחנות בחדרה שאפשר
            להיכנס אליה ולשאול.
          </p>
        </div>

        {/* Wider than the header's copy of it, and first in the tab order
            after the heading — for a catalogue of this size, typing a model
            number beats any amount of browsing. */}
        <div className="max-w-3xl">
          <SearchBar size="hero" showIntro={false} />
        </div>

        <div className="flex flex-col items-stretch gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
          <Button
            variant="brand"
            size="lg"
            asChild
            className="h-12 w-full justify-center rounded-xl text-base font-bold sm:w-fit sm:px-6"
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
            className="text-primary-foreground/85 hover:text-primary-foreground flex items-center justify-center gap-2 py-2 text-base font-semibold sm:py-0 sm:ps-2"
          >
            <Phone className="size-4" />
            {BUSINESS.phone}
          </a>
        </div>

        {/* Three facts, not three slogans. Each one is either a number this
            page just read or something a customer can walk into. */}
        <ul className="border-primary-foreground/15 grid list-none grid-cols-1 gap-x-8 gap-y-3 border-t pt-6 text-sm sm:grid-cols-3">
          <li className="flex items-start gap-2.5">
            <ShieldCheck className="text-brand mt-0.5 size-4 shrink-0" />
            <span>
              <strong className="font-bold">אחריות יבואן רשמי</strong>
              <span className="text-primary-foreground/70 block">על כל מוצר בקטלוג</span>
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <Truck className="text-brand mt-0.5 size-4 shrink-0" />
            <span>
              <strong className="font-bold">משלוח עד הבית</strong>
              <span className="text-primary-foreground/70 block">לכל הארץ, כולל התקנה למוצרים גדולים</span>
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <Store className="text-brand mt-0.5 size-4 shrink-0" />
            <span>
              <strong className="font-bold">חנות פיזית</strong>
              <span className="text-primary-foreground/70 block">{BUSINESS_ADDRESS}</span>
            </span>
          </li>
        </ul>
      </div>
    </section>
  );
}
