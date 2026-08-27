import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeroSearchPreview } from "@/components/home/hero-search-preview";
import { AlfredPicks } from "@/components/home/alfred-picks";
import type { ProductCardData } from "@/components/product/product-card";

export function Hero({
  ctaLabel,
  ctaHref,
  showcaseProducts = [],
  alfredPicks = [],
}: {
  ctaLabel: string;
  ctaHref: string;
  // The two-sided panel: HeroSearchPreview's side gets a rotating
  // real-product photo instead of a static placeholder (pulled from the
  // general deals list); this side gets Alfred's own admin-curated pick of
  // up to 3 products with a real chat about them (see AlfredPicks) — a
  // separate, deliberately-chosen list, not the same rotation.
  showcaseProducts?: ProductCardData[];
  alfredPicks?: ProductCardData[];
}) {
  return (
    <section className="relative overflow-hidden bg-primary text-primary-foreground">
      {/* Desktop's gradient, completely untouched — hidden below sm: only
          because a second, mobile-only version replaces it there. */}
      <div
        className="absolute inset-0 hidden opacity-90 sm:block"
        style={{
          background:
            "radial-gradient(ellipse 60% 80% at 15% 20%, oklch(0.35 0.09 20.7 / 0.55), transparent), radial-gradient(ellipse 50% 60% at 90% 90%, oklch(0.3 0.02 20.7 / 0.6), transparent)",
        }}
        aria-hidden
      />
      {/* Mobile-only: less red/purple, more navy with a subtle purple glow
          — the orange CTA/accent below needs to stay the only strong color
          competing for attention. */}
      <div
        className="absolute inset-0 opacity-90 sm:hidden"
        style={{
          background:
            "radial-gradient(ellipse 65% 70% at 20% 10%, oklch(0.3 0.08 264 / 0.6), transparent), radial-gradient(ellipse 55% 65% at 90% 95%, oklch(0.32 0.1 300 / 0.35), transparent)",
        }}
        aria-hidden
      />
      {/* This whole component only ever renders on sm: and up (page.tsx
          wraps it in `hidden sm:block`) — the title/subtitle/benefits that
          used to sit here moved into AlfredSection's square instead, so
          this section is now just the CTA row next to the search preview
          panel. */}
      <HeroSearchPreview showcaseProducts={showcaseProducts}>
        <div className="flex flex-col gap-4 pt-1 sm:gap-6 sm:pt-0">
          <AlfredPicks products={alfredPicks} />

          <div className="flex flex-col items-stretch gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            <Button
              variant="brand"
              size="lg"
              asChild
              className="h-[52px] w-full justify-center rounded-2xl text-base font-bold shadow-md shadow-black/10 sm:h-12 sm:w-fit sm:rounded-lg sm:px-6 sm:shadow-sm"
            >
              <Link href={ctaHref}>
                {ctaLabel}
                <ArrowLeft className="size-4" />
              </Link>
            </Button>
            {/* Mobile: a plain text link, not a second bordered button —
                it used to visually compete with the primary CTA right next
                to it. Desktop's outline button is unchanged. */}
            <Button
              variant="outline"
              size="lg"
              asChild
              className="text-primary-foreground h-auto w-fit self-center border-none bg-transparent p-0 text-sm font-medium underline underline-offset-4 hover:bg-transparent sm:border-primary-foreground/20 sm:hover:bg-primary-foreground/10 sm:h-12 sm:w-auto sm:self-auto sm:bg-transparent sm:px-6 sm:text-base sm:font-medium sm:no-underline"
            >
              <Link href="/finder">עזרו לי לבחור</Link>
            </Button>
          </div>
        </div>
      </HeroSearchPreview>
    </section>
  );
}
