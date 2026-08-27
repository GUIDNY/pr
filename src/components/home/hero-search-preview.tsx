"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Search, Sparkles, X, ArrowLeft } from "lucide-react";
import { searchProductsAction, type SearchResult } from "@/actions/search";
import { formatPrice } from "@/lib/format";
import { ProductImagePlaceholder } from "@/components/product/product-image-placeholder";
import { useRotatingPlaceholder } from "@/components/layout/search-bar";
import type { ProductCardData } from "@/components/product/product-card";
import { displayBrandName } from "@/lib/brand-display";

const EXAMPLE_QUERIES = [
  "מקרר 4 דלתות עד 4,000 ₪",
  "אוזניות בלוטוס",
  "מכונת קפה עם מטחנה",
  "טלוויזיה לסלון גדול",
];

// Replaces the old rotating marketing-image carousel: the search bar lives
// inside the visual panel itself now (not a separate row above it) — type,
// and the top match fills the panel behind the input, so the search bar
// stays visible/usable while you keep refining, instead of a bar-then-result
// handoff between two separate elements.
export function HeroSearchPreview({
  children,
  showcaseProducts = [],
}: {
  children: React.ReactNode;
  // Real deals shown one at a time, auto-rotating, before anyone has typed
  // anything — "an area of good products with a changing photo" instead of
  // a static "type something" placeholder.
  showcaseProducts?: ProductCardData[];
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [showcaseIndex, setShowcaseIndex] = useState(0);
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rotatingPlaceholder = useRotatingPlaceholder(!query);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    if (query || showcaseProducts.length < 2) return;
    const id = setInterval(() => setShowcaseIndex((i) => (i + 1) % showcaseProducts.length), 2200);
    return () => clearInterval(id);
  }, [query, showcaseProducts.length]);

  function onChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      setResults([]);
      setHasSearched(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        const r = await searchProductsAction(value);
        setResults(r);
        setHasSearched(true);
      });
    }, 300);
  }

  function submitSearch() {
    if (!query.trim()) return;
    router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  }

  const topResult = results[0] ?? null;

  return (
    <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-6 px-4 pt-5 pb-8 sm:gap-10 sm:pt-14 sm:pb-20 lg:grid-cols-2">
      <div className="order-1">{children}</div>

      <div className="order-2">
        <div className="mb-2.5 flex items-center justify-center gap-2 text-sm lg:justify-start">
          <Image
            src="/mascot/alfred-512.webp"
            alt="אלפרד"
            width={28}
            height={28}
            className="size-7 shrink-0 rounded-full object-cover object-top"
          />
          <span className="text-primary-foreground/80">
            כתבו ל<span className="text-brand font-semibold">אלפרד</span>, העוזר החכם שלנו, מה שאתם צריכים
          </span>
        </div>

        <div className="relative h-72 overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/10 sm:h-80 xl:h-96">
          {topResult ? (
            <Link href={`/product/${topResult.slug}`} className="group absolute inset-0 block">
              {topResult.imageUrl ? (
                <Image
                  src={topResult.imageUrl}
                  alt={topResult.title}
                  fill
                  sizes="(min-width: 1024px) 44vw, 92vw"
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <ProductImagePlaceholder title={topResult.title} brand={displayBrandName(topResult.brandName) ?? undefined} icon={topResult.categoryIcon} />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/5 to-black/40" aria-hidden />
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-5">
                <div className="min-w-0">
                  {displayBrandName(topResult.brandName) && (
                    <p className="text-primary-foreground/70 text-xs">{displayBrandName(topResult.brandName)}</p>
                  )}
                  <p className="line-clamp-2 text-lg font-bold text-white">{topResult.title}</p>
                  <p className="text-brand mt-1 text-xl font-black tabular-nums">{formatPrice(topResult.price)}</p>
                </div>
                <span className="bg-brand text-brand-foreground flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold">
                  לצפייה
                  <ArrowLeft className="size-4" />
                </span>
              </div>
            </Link>
          ) : !isPending && !hasSearched && showcaseProducts.length > 0 ? (
            (() => {
              const showcase = showcaseProducts[showcaseIndex % showcaseProducts.length];
              return (
                <Link
                  key={showcase.id}
                  href={`/product/${showcase.slug}`}
                  className="group animate-in fade-in zoom-in-105 absolute inset-0 block duration-700 ease-out"
                >
                  {showcase.imageUrl ? (
                    <Image
                      src={showcase.imageUrl}
                      alt={showcase.title}
                      fill
                      sizes="(min-width: 1024px) 44vw, 92vw"
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <ProductImagePlaceholder title={showcase.title} icon={showcase.categoryIcon} />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/5 to-black/40" aria-hidden />
                  <div className="animate-in fade-in slide-in-from-bottom-2 absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-5 duration-700 ease-out">
                    <div className="min-w-0">
                      <p className="text-brand text-xs font-semibold">🔥 מוצרים שווים באלפרד</p>
                      <p className="line-clamp-2 text-lg font-bold text-white">{showcase.title}</p>
                      <p className="text-brand mt-1 text-xl font-black tabular-nums">{formatPrice(showcase.price)}</p>
                    </div>
                    <span className="bg-brand text-brand-foreground flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold">
                      לצפייה
                      <ArrowLeft className="size-4" />
                    </span>
                  </div>
                </Link>
              );
            })()
          ) : (
            <div className="from-brand/25 border-primary-foreground/10 absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-hidden border bg-gradient-to-br via-purple-500/10 to-transparent p-6 text-center backdrop-blur-sm">
              <div
                className="bg-brand/30 absolute size-56 rounded-full blur-3xl"
                style={{ top: "-15%" }}
                aria-hidden
              />
              <Image
                src="/mascot/alfred-512.webp"
                alt="אלפרד"
                width={88}
                height={88}
                className="relative size-[4.5rem] rounded-full object-cover object-top shadow-lg"
              />
              {isPending ? (
                <p className="text-primary-foreground relative text-lg font-semibold">אלפרד מחפש בשבילכם...</p>
              ) : hasSearched ? (
                <>
                  <p className="text-primary-foreground relative text-lg font-semibold">לא מצאתי התאמה מדויקת</p>
                  <p className="text-primary-foreground/60 relative max-w-xs text-sm">נסו לתאר את המוצר קצת אחרת, או לחצו על חיפוש לתוצאות מלאות</p>
                </>
              ) : (
                <>
                  <p className="text-primary-foreground relative text-lg font-semibold">תכתבו לאלפרד את המוצר שתרצו</p>
                  <div className="relative flex flex-wrap items-center justify-center gap-1.5">
                    {EXAMPLE_QUERIES.map((example) => (
                      <button
                        key={example}
                        type="button"
                        onClick={() => onChange(example)}
                        className="border-primary-foreground/20 bg-primary-foreground/5 hover:border-brand/50 hover:bg-brand/10 rounded-full border px-3 py-1.5 text-xs font-medium text-primary-foreground/80 transition-colors hover:text-primary-foreground"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Overlaid search bar — sits above both states (placeholder and a
              matched product photo) so it's always reachable to keep typing
              without the result disappearing first. */}
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              submitSearch();
            }}
            className="from-brand via-brand/60 absolute inset-x-3 top-3 rounded-full bg-gradient-to-l to-purple-400 p-[1.5px] shadow-lg shadow-black/20"
          >
            <div className="bg-background/95 flex items-center rounded-full backdrop-blur-sm">
              <Sparkles className="text-brand pointer-events-none ms-3.5 size-4.5 shrink-0" />
              <input
                value={query}
                onChange={(e) => onChange(e.target.value)}
                type="search"
                placeholder={rotatingPlaceholder}
                aria-label="חיפוש מוצרים"
                className="text-foreground placeholder:text-muted-foreground h-12 flex-1 bg-transparent px-2.5 text-sm outline-none placeholder:transition-opacity sm:text-base"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setResults([]);
                    setHasSearched(false);
                  }}
                  className="text-muted-foreground hover:text-foreground me-1 flex size-7 shrink-0 items-center justify-center"
                  aria-label="נקה חיפוש"
                >
                  <X className="size-4" />
                </button>
              )}
              <button
                type="submit"
                aria-label="חיפוש"
                className="bg-brand text-brand-foreground me-1 flex size-9 shrink-0 items-center justify-center rounded-full transition-opacity hover:opacity-90"
              >
                <Search className="size-4" />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
