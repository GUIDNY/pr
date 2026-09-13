"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export type PromoSlide =
  | {
      kind: "brand";
      title: string;
      subtitle: string;
      ctaLabel?: string;
      ctaHref?: string;
    }
  | {
      kind: "promo";
      title: string;
      body: string;
      href: string;
      tone: "brand" | "light" | "navy";
      // Real product photographs from the catalogue, up to three, shown as
      // a small collage at the slide's end — what turns a coloured block
      // into a shop's banner without inventing artwork.
      images?: string[];
    }
  | {
      // One designed picture, edge to edge; the words are in the picture.
      kind: "image";
      src: string;
      alt: string;
      href: string;
    };

/**
 * One banner slot, several slides: a swipe moves them, dots say where you
 * are, and left alone it advances every few seconds. The pattern every
 * shop app on a phone opens with, done the way the usability research
 * asks: real swipe with snapping, a visible position, a pause the moment
 * a finger or a pointer is on it, and no motion at all for anyone who has
 * asked their device for less of it.
 */
export function PromoCarousel({
  slides,
  className,
  intervalMs = 5000,
  compact = false,
  stacked = false,
  slogan,
}: {
  slides: PromoSlide[];
  className?: string;
  intervalMs?: number;
  // A shorter slot — for the promotions under a hero that stays put.
  compact?: boolean;
  // Text above the photographs instead of beside them — for a narrow
  // column, where side by side leaves the words no room.
  stacked?: boolean;
  // The shop's own line, small, at the top of every slide — so the
  // banner is one card that always says whose it is, and only the offer
  // underneath rotates. A separate navy card above the promotions read as
  // a box on a box.
  slogan?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const pausedRef = useRef(false);

  function goTo(i: number) {
    const el = trackRef.current;
    if (!el) return;
    const w = el.clientWidth;
    const rtl = getComputedStyle(el).direction === "rtl";
    // In RTL the scroll origin is the right edge and scrollLeft runs
    // negative leftwards, so slide i sits at -i * width.
    el.scrollTo({ left: (rtl ? -1 : 1) * i * w, behavior: "smooth" });
  }

  // Which slide is in view, from the scroll position — the dots follow a
  // finger, not the timer.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const onScroll = () => {
      const w = el.clientWidth || 1;
      setIndex(Math.min(slides.length - 1, Math.max(0, Math.round(Math.abs(el.scrollLeft) / w))));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [slides.length]);

  useEffect(() => {
    if (slides.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => {
      if (pausedRef.current || document.hidden) return;
      const el = trackRef.current;
      if (!el) return;
      const w = el.clientWidth || 1;
      const current = Math.round(Math.abs(el.scrollLeft) / w);
      goTo((current + 1) % slides.length);
    }, intervalMs);
    return () => clearInterval(id);
  }, [slides.length, intervalMs]);

  if (slides.length === 0) return null;

  // A set of designed pictures is shown as the pictures are: each at its
  // own ratio, edge to edge, nothing drawn over it but the position dots.
  const natural = !stacked && slides.every((s) => s.kind === "image");

  return (
    <div className={cn("relative", className)}>
      <div
        ref={trackRef}
        className="flex snap-x snap-mandatory overflow-x-auto rounded-2xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onPointerDown={() => (pausedRef.current = true)}
        onPointerUp={() => (pausedRef.current = false)}
        onPointerCancel={() => (pausedRef.current = false)}
        onMouseEnter={() => (pausedRef.current = true)}
        onMouseLeave={() => (pausedRef.current = false)}
        onFocusCapture={() => (pausedRef.current = true)}
        onBlurCapture={() => (pausedRef.current = false)}
      >
        {slides.map((s, i) => (
          <div key={i} className="w-full shrink-0 snap-center">
            <Slide slide={s} compact={compact} stacked={stacked} slogan={slogan} natural={natural} />
          </div>
        ))}
      </div>

      {slides.length > 1 && (
        <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5" aria-hidden>
          {slides.map((s, i) => (
            <button
              key={i}
              type="button"
              tabIndex={-1}
              onClick={() => goTo(i)}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === index ? "bg-brand w-5" : s.kind === "promo" && s.tone === "light" ? "w-1.5 bg-black/20" : "w-1.5 bg-white/60 shadow"
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SloganStrip({ slogan, light }: { slogan: string; light: boolean }) {
  return (
    <div className={cn("relative mb-3 flex items-center gap-2 text-xs font-semibold", light ? "text-foreground" : "text-white")}>
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ring-1",
          light ? "bg-brand/10 text-brand ring-brand/20" : "bg-white/10 ring-white/20"
        )}
      >
        <ShieldCheck className={cn("size-3.5", light ? "text-brand" : "text-brand")} />
        יבואן רשמי
      </span>
      <span className={cn("truncate", light ? "text-muted-foreground" : "text-white/85")}>{slogan}</span>
    </div>
  );
}

function Slide({
  slide,
  compact,
  stacked,
  slogan,
  natural,
}: {
  slide: PromoSlide;
  compact: boolean;
  stacked: boolean;
  slogan?: string;
  natural: boolean;
}) {
  if (slide.kind === "brand") {
    return (
      <div className="bg-primary text-primary-foreground relative flex h-full min-h-56 flex-col justify-center overflow-hidden p-5 pb-8 sm:min-h-64 sm:p-8">
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
          {/* Styled as the headline, but a <p>: the page's <h1> is in the
              desktop banner, which is only hidden below lg:, and a second
              one would be a second one. */}
          <p className="max-w-md text-[1.7rem] leading-tight font-black text-balance sm:text-3xl">{slide.title}</p>
          <p className="text-primary-foreground/75 max-w-sm text-sm">{slide.subtitle}</p>
          {slide.ctaLabel && slide.ctaHref && (
            <Link
              href={slide.ctaHref}
              className="bg-brand text-brand-foreground hover:bg-brand-hover mt-1 inline-flex h-10 items-center gap-1.5 rounded-lg px-5 text-sm font-bold shadow-sm transition-colors"
            >
              {slide.ctaLabel}
              <ArrowLeft className="size-4" />
            </Link>
          )}
        </div>
      </div>
    );
  }

  if (slide.kind === "image" && natural) {
    // The picture as it was made: full width, its own height, nothing
    // cropped. The width/height attributes only hold the space until it
    // loads; then its real ratio takes over.
    return (
      <Link href={slide.href} className="group relative block overflow-hidden bg-white">
        <Image src={slide.src} alt={slide.alt} width={1600} height={700} sizes="(min-width: 1280px) 1024px, 100vw" className="h-auto w-full" priority />
      </Link>
    );
  }

  if (slide.kind === "image") {
    // Beside collage slides the slot has a fixed height, so the picture
    // fills it and crops; in the desktop side column too.
    return (
      <Link
        href={slide.href}
        className={cn(
          "group relative block h-full overflow-hidden bg-white",
          stacked || !compact ? "min-h-56 sm:min-h-64" : "aspect-[16/7] min-h-40 sm:min-h-44"
        )}
      >
        <Image src={slide.src} alt={slide.alt} fill sizes="(min-width: 1024px) 288px, 100vw" className="object-cover" priority />
      </Link>
    );
  }

  const tone = slide.tone;
  const images = (slide.images ?? []).slice(0, 3);
  return (
    <Link
      href={slide.href}
      className={cn(
        "group relative flex h-full gap-3 overflow-hidden p-5 pb-8 sm:p-6",
        stacked ? "flex-col items-start justify-between" : "items-center justify-between sm:p-8",
        slogan && !stacked && "pt-12 sm:pt-14",
        compact ? "min-h-40 sm:min-h-44" : "min-h-56 sm:min-h-64",
        tone === "brand" && "bg-brand text-brand-foreground",
        tone === "navy" && "bg-primary text-primary-foreground",
        tone === "light" && "text-foreground bg-white"
      )}
    >
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            tone === "light"
              ? "radial-gradient(ellipse 55% 90% at 0% 0%, oklch(0.658 0.209 39.1 / 0.16), transparent), radial-gradient(ellipse 40% 70% at 100% 100%, oklch(0.32 0.1 264 / 0.08), transparent)"
              : "radial-gradient(ellipse 60% 100% at 100% 100%, oklch(1 0 0 / 0.22), transparent), radial-gradient(ellipse 40% 60% at 0% 0%, oklch(0 0 0 / 0.12), transparent)",
        }}
      />
      {slogan && !stacked && (
        <div className="absolute inset-x-5 top-4 sm:inset-x-8 sm:top-6">
          <SloganStrip slogan={slogan} light={tone === "light"} />
        </div>
      )}
      {images.length === 0 && (
        <div
          aria-hidden
          className={cn(
            "absolute -end-10 -bottom-16 rounded-full border-[18px]",
            compact ? "size-40 border-[12px] sm:size-56" : "size-56 sm:size-72",
            tone === "light" ? "border-brand/10" : "border-white/10"
          )}
        />
      )}
      <div className="relative flex min-w-0 flex-col items-start gap-2">
        <span
          className={cn(
            "leading-none font-black tracking-tight",
            stacked ? "text-4xl" : compact ? "text-4xl sm:text-5xl" : "text-[3.2rem] sm:text-6xl"
          )}
        >
          {slide.title}
        </span>
        <span
          className={cn(
            "mt-1 inline-flex items-center gap-1.5 text-sm font-semibold",
            tone === "light" ? "text-brand" : "text-white/90"
          )}
        >
          {slide.body}
          <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
        </span>
      </div>

      {images.length > 0 && (
        /* Three photographs, fanned: the first upright and largest, the
           others tucked behind it at a slight tilt — a shop window, not
           a grid. Each on its own white card so a dark oven and a white
           kettle read as one set. */
        <div
          className={cn(
            "relative shrink-0",
            stacked ? "mt-3 h-28 w-40 self-end" : compact ? "h-28 w-36 sm:h-32 sm:w-44" : "h-40 w-48 sm:h-48 sm:w-60"
          )}
        >
          {images.map((src, i) => (
            <span
              key={src + i}
              className={cn(
                "absolute overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-black/5",
                i === 0 && "end-0 bottom-0 z-30 h-full w-[62%]",
                i === 1 && "end-[42%] bottom-2 z-20 h-[78%] w-[50%] -rotate-6",
                i === 2 && "end-[68%] bottom-5 z-10 h-[62%] w-[42%] rotate-6"
              )}
            >
              <Image src={src} alt="" fill sizes="120px" className="object-contain p-1.5" referrerPolicy="no-referrer" />
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}
