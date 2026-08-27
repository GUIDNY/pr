import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, Truck, Headset } from "lucide-react";
import { SearchBar } from "@/components/layout/search-bar";
import { Button } from "@/components/ui/button";

const MOBILE_EXAMPLE_QUERIES = ["טלוויזיה לסלון", "מקרר למשפחה", "מכונת קפה"];

// A second, deliberately unmissable touchpoint for the same idea as the
// hero search bar — the site's whole premise is "tell Alfred what you
// need, AI finds it," and that needs to show up more than once for it to
// actually register as the site's identity rather than a one-off widget.
export function AlfredSection({
  heroTitle,
  heroSubtitle,
  ctaLabel,
  ctaHref,
}: {
  // Desktop only — the marketing headline/subtitle that used to live in
  // <Hero> moved here so Alfred's square carries the whole pitch instead
  // of splitting it across two sections. Falls back to Alfred's own
  // original copy if the CMS "hero" content is missing.
  heroTitle?: string;
  heroSubtitle?: string;
  ctaLabel?: string;
  ctaHref?: string;
}) {
  return (
    // overflow-x-hidden (not overflow-hidden) on purpose: the background
    // gradient below is `inset-0` so it never actually overflows the
    // section either way, but the mobile search dropdown's top-result
    // preview card DOES extend below the section's own (now much shorter)
    // content height — a plain `overflow-hidden` here was silently
    // clipping that card's price/title/button off, leaving only the photo
    // visible. Confirmed live: exactly what was reported.
    <section className="bg-primary text-primary-foreground relative overflow-x-hidden">
      <div
        className="absolute inset-0 opacity-90"
        style={{
          background:
            "radial-gradient(ellipse 55% 70% at 85% 15%, oklch(0.35 0.09 20.7 / 0.5), transparent), radial-gradient(ellipse 45% 55% at 10% 95%, oklch(0.3 0.02 20.7 / 0.55), transparent)",
        }}
        aria-hidden
      />

      {/* Desktop only — hidden below sm: in favor of the simplified mobile
          block underneath. */}
      <div className="relative mx-auto hidden max-w-7xl grid-cols-1 items-center gap-8 px-4 py-14 sm:grid sm:py-16 lg:grid-cols-[auto_1fr]">
        {/* Alfred stays centered ("באמצע") in his own column at every
            width — no lg:mx-0 edge-alignment — with the CTA buttons
            (moved down from Hero) sitting right below him. */}
        <div className="mx-auto flex flex-col items-center gap-4">
          <Image
            src="/mascot/alfred.png"
            alt="אלפרד, העוזר החכם של AiEC"
            width={280}
            height={280}
            className="h-auto w-48 sm:w-64"
            priority={false}
          />
          {ctaLabel && ctaHref && (
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button variant="brand" size="lg" asChild className="rounded-lg px-6 shadow-sm">
                <Link href={ctaHref}>
                  {ctaLabel}
                  <ArrowLeft className="size-4" />
                </Link>
              </Button>
              <Button
                variant="outline"
                size="lg"
                asChild
                className="border-primary-foreground/20 hover:bg-primary-foreground/10 text-primary-foreground bg-transparent px-6"
              >
                <Link href="/finder">עזרו לי לבחור</Link>
              </Button>
            </div>
          )}
        </div>
        <div className="flex flex-col items-center gap-4 text-center lg:items-start lg:text-start">
          {/* This carries the page's main heading now that Hero's own <h1>
              moved here with the rest of the copy — kept as an <h1>, not
              <h2>, so the homepage still has exactly one. */}
          <h1 className="max-w-xl text-2xl leading-tight font-black text-balance sm:text-4xl">
            {heroTitle || (
              <>
                תנו ל<span className="text-brand">אלפרד</span> לעבוד בשבילכם
              </>
            )}
          </h1>
          <p className="text-primary-foreground/70 max-w-xl text-base sm:text-lg">
            {heroSubtitle ||
              'לא צריך לדעת שם דגם או לגלול בין מאות מוצרים — פשוט תספרו לאלפרד מה אתם צריכים, גם אם זה "מקרר גדול שקט לא יקר", והוא כבר ימצא לכם את ההתאמה המדויקת מתוך כל מה שיש לנו במלאי.'}
          </p>
          <div className="mt-2 w-full max-w-xl">
            <SearchBar size="hero" showIntro={false} />
          </div>

          {/* The three trust badges that used to sit under Hero's CTA
              buttons — always centered ("באמצע") regardless of how the
              text above aligns at lg:, so they read as one clear row in
              the middle of the square. */}
          <div className="mt-1 flex w-full flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm">
            <span className="flex items-center gap-2">
              <Truck className="text-brand size-4" /> משלוח עד הבית
            </span>
            <span className="flex items-center gap-2">
              <ShieldCheck className="text-brand size-4" /> אחריות יבואן רשמי
            </span>
            <span className="flex items-center gap-2">
              <Headset className="text-brand size-4" /> שירות לקוחות זמין
            </span>
          </div>
        </div>
      </div>

      {/* Mobile: compact — this section used to run almost a full screen
          tall with nothing else visible below it (confirmed live: the
          chips sat right at the viewport's bottom edge). Shrunk so the
          whole block reads as roughly 3/4 of a typical phone screen,
          leaving the top of "קטגוריות מובילות" visibly peeking in right
          away instead of requiring a scroll to discover it exists. The
          input itself is the same real SearchBar component as desktop,
          just restyled at mobile widths inside search-bar.tsx (see its
          "hero" branch) — no duplicate search logic here. */}
      <div className="relative mx-auto flex max-w-7xl flex-col items-center gap-2.5 px-4 py-6 text-center sm:hidden">
        <Image
          src="/mascot/alfred.png"
          alt="אלפרד, העוזר החכם של A&I Electronics"
          width={280}
          height={280}
          className="h-auto w-24"
          priority={false}
        />
        <h2 className="text-xl leading-tight font-black text-balance">היי, אני אלפרד 👋</h2>
        <p className="text-primary-foreground/70 max-w-xs text-xs leading-relaxed">
          ספרו לי מה אתם מחפשים ואני אמצא לכם את המוצר המתאים.
        </p>

        <div className="mt-0.5 w-full">
          <SearchBar size="hero" showIntro={false} showTopResultPreview />
        </div>

        <div className="flex w-full flex-wrap items-center justify-center gap-1.5">
          {MOBILE_EXAMPLE_QUERIES.map((q) => (
            <Link
              key={q}
              href={`/search?q=${encodeURIComponent(q)}`}
              className="border-primary-foreground/20 bg-primary-foreground/5 hover:border-brand/50 hover:bg-brand/10 rounded-full border px-3 py-1.5 text-xs font-medium text-primary-foreground/80 transition-colors hover:text-primary-foreground"
            >
              {q}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
