"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Search, Sparkles, X } from "lucide-react";
import { searchProductsAction, type SearchResult } from "@/actions/search";
import { formatPrice } from "@/lib/format";
import { ProductImagePlaceholder } from "@/components/product/product-image-placeholder";
import { StockBadge } from "@/components/product/stock-badge";
import { splitOnMatches } from "@/lib/search-highlight";
import { cn } from "@/lib/utils";

export const HERO_PLACEHOLDERS = [
  "כתבו לאלפרד מה אתם מחפשים...",
  "לדוגמה: מקרר 4 דלתות בתקציב עד 4,000 ש״ח",
  "לדוגמה: מכונת כביסה שקטה ל-8 ק״ג",
  "לדוגמה: רמקול JBL נייד עמיד למים",
  "לדוגמה: מכונת קפה עם מטחנת פולים",
  "לדוגמה: אוזניות בלוטוס עד 300 ש״ח",
];

// Rotates through a few example queries so the placeholder itself hints at
// what the search can do — purely cosmetic, no effect on the actual search.
export function useRotatingPlaceholder(active: boolean) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % HERO_PLACEHOLDERS.length), 2600);
    return () => clearInterval(id);
  }, [active]);
  return HERO_PLACEHOLDERS[index];
}

function highlightMatch(title: string, query: string) {
  return splitOnMatches(title, query).map((part, index) =>
    part.match ? (
      <mark key={index} className="bg-transparent font-bold text-inherit">
        {part.text}
      </mark>
    ) : (
      part.text
    ),
  );
}

export function SearchBar({
  className,
  inputClassName,
  size = "default",
  showIntro = true,
  showTopResultPreview = false,
}: {
  className?: string;
  // Only ever passed from the mobile-only header search row, to bump its
  // height/radius without touching every other place this default variant
  // renders (the desktop header search, category/search pages, ...).
  inputClassName?: string;
  size?: "default" | "hero";
  showIntro?: boolean;
  // Opt-in only (the mobile Alfred section) — surfaces the best match as a
  // real photo+price card above the plain results list, the same "the
  // product you're looking for pops into view" moment the hero search
  // panel already has elsewhere on the page. Off by default so every other
  // SearchBar (header, category pages, desktop Alfred section) keeps its
  // existing plain dropdown untouched.
  showTopResultPreview?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  /* Where the header row ends, so the suggestions can hang off it while
     being as wide as the page rather than as wide as the field. 56px is
     the phone header's own height and is correct whenever it is stuck to
     the top, which it is the moment anybody has scrolled — so the first
     paint lands in the right place and the measurement below only
     corrects the case where the page is still at the very top. */
  const [rowBottom, setRowBottom] = useState(56);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHero = size === "hero";
  const rotatingPlaceholder = useRotatingPlaceholder(isHero && !query);

  /* Re-measured while the list is open, because until the header sticks
     the row moves with the page. */
  useEffect(() => {
    if (!isOpen) return;
    const measure = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) setRowBottom(rect.bottom);
    };
    measure();
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [isOpen]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function onChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        const r = await searchProductsAction(value);
        setResults(r);
        setIsOpen(true);
      });
    }, 300);
  }

  function submitSearch() {
    if (!query.trim()) return;
    setIsOpen(false);
    router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  }

  return (
    <div ref={containerRef} className={cn("relative w-full", isHero && "mx-auto max-w-2xl", className)}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          submitSearch();
        }}
        className="relative"
      >
        {isHero ? (
          <>
            {showIntro && (
              <div className="mb-2.5 flex items-center justify-center gap-2 text-sm">
                <Image
                  src="/mascot/alfred.png"
                  alt="אלפרד"
                  width={28}
                  height={28}
                  className="size-7 shrink-0 rounded-full object-cover object-top"
                />
                <span className="text-primary-foreground/80">
                  כתבו ל<span className="text-brand font-semibold">אלפרד</span>, העוזר החכם שלנו, מה שאתם צריכים — הוא ימצא לכם את זה תוך שניות
                </span>
              </div>
            )}
            {/* Desktop: the exact original gradient-pill input, untouched
                — just hidden below sm: in favor of the mobile version. */}
            <div className="from-brand to-brand/40 hidden rounded-full bg-gradient-to-l p-[1.5px] shadow-lg shadow-black/10 sm:block">
              <div className="bg-background/95 flex items-center rounded-full backdrop-blur-sm">
                <Sparkles className="text-brand pointer-events-none ms-4 size-5 shrink-0" />
              <input
                value={query}
                onChange={(e) => onChange(e.target.value)}
                onFocus={() => query.trim().length >= 2 && setIsOpen(true)}
                type="search"
                placeholder={rotatingPlaceholder}
                aria-label="חיפוש מוצרים"
                className="text-foreground placeholder:text-muted-foreground h-14 flex-1 bg-transparent px-3 text-base outline-none placeholder:transition-opacity"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setResults([]);
                  }}
                  className="text-muted-foreground hover:text-foreground me-1 flex size-8 shrink-0 items-center justify-center"
                  aria-label="נקה חיפוש"
                >
                  <X className="size-4" />
                </button>
              )}
              <button
                type="submit"
                className="bg-brand text-brand-foreground me-1.5 flex h-11 shrink-0 items-center gap-1.5 rounded-full px-5 text-sm font-semibold transition-opacity hover:opacity-90"
              >
                <Search className="size-4" />
                חיפוש
              </button>
              </div>
            </div>

            {/* Mobile: white card, thin brand-colored border, search icon
                in a small brand-colored circle that also submits — same
                query state as the desktop input above, just a different,
                more compact visual treatment for a narrow screen. */}
            <div className="border-brand/30 bg-background focus-within:border-brand focus-within:ring-brand/20 flex h-14 items-center rounded-[18px] border shadow-sm transition-colors focus-within:ring-2 sm:hidden">
              <button
                type="submit"
                aria-label="חיפוש"
                className="bg-brand text-brand-foreground ms-1.5 flex size-9 shrink-0 items-center justify-center rounded-full"
              >
                <Search className="size-4" />
              </button>
              <input
                value={query}
                onChange={(e) => onChange(e.target.value)}
                onFocus={() => query.trim().length >= 2 && setIsOpen(true)}
                type="search"
                placeholder={rotatingPlaceholder}
                aria-label="חיפוש מוצרים"
                className="text-foreground placeholder:text-muted-foreground h-full flex-1 bg-transparent px-3 text-sm outline-none placeholder:transition-opacity"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setResults([]);
                  }}
                  className="text-muted-foreground hover:text-foreground me-2 flex size-8 shrink-0 items-center justify-center"
                  aria-label="נקה חיפוש"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            {/* A real submit control, not a decorative glyph. On a phone
                people look to the page for the search button before they
                look to the keyboard, and a field with only an icon they
                cannot press is a field they give up on. */}
            <button
              type="submit"
              aria-label="חיפוש"
              className="text-muted-foreground hover:text-brand absolute top-1/2 start-1.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-full"
            >
              <Search className="size-4" />
            </button>
            <input
              value={query}
              onChange={(e) => onChange(e.target.value)}
              onFocus={() => query.trim().length >= 2 && setIsOpen(true)}
              type="search"
              placeholder="מה אתם מחפשים היום?"
              aria-label="חיפוש מוצרים"
              className={cn(
                "border-input bg-background focus-visible:ring-brand/40 h-10 w-full rounded-full border py-2 ps-10 pe-9 text-sm outline-none focus-visible:ring-3",
                inputClassName
              )}
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setResults([]);
                }}
                className="text-muted-foreground hover:text-foreground absolute top-1/2 end-3 -translate-y-1/2"
                aria-label="נקה חיפוש"
              >
                <X className="size-4" />
              </button>
            )}
          </>
        )}
      </form>

      {isOpen && query.trim().length >= 2 && (
        <div
          style={{ "--suggestions-top": `${rowBottom}px` } as React.CSSProperties}
          className={cn(
            "bg-popover text-popover-foreground mt-2 overflow-hidden rounded-xl border text-start shadow-lg",
            // Everywhere else this floats on top of whatever's below it —
            // standard search-dropdown behavior. Only the mobile Alfred
            // search (showTopResultPreview) wants it to instead push the
            // "קטגוריות מובילות" section underneath it further down the
            // page, which just means letting it take up real space in
            // normal flow instead of being pulled out of it.
            /* On a phone the field is about 190px of a 374px screen — it
               shares the row with the menu, the logo, the back-office link
               and the cart — and `w-full` handed the suggestions that same
               190px. Four results then read "מקרר ...", "מקרר קובייה...",
               "מקרר משרדי...": the one column that had to stay whole was
               the one with no room left.

               So the list stops inheriting the field's width. Fixed to the
               viewport, inset to the header's own gutter, hanging off the
               measured bottom of the row — which also takes it out of any
               ancestor that clips. From sm up there is room and it goes
               back to being an ordinary dropdown under a wide field. */
            showTopResultPreview
              ? "relative"
              : "fixed inset-x-3 top-[var(--suggestions-top)] z-50 sm:absolute sm:inset-x-auto sm:top-full sm:w-full"
          )}
        >
          {isPending && results.length === 0 ? (
            <div className="text-muted-foreground p-4 text-center text-sm">מחפש...</div>
          ) : results.length === 0 ? (
            <div className="text-muted-foreground p-4 text-center text-sm">לא נמצאו תוצאות עבור &quot;{query}&quot;</div>
          ) : (
            <>
              {showTopResultPreview &&
                (() => {
                  const top = results[0];
                  return (
                    <Link
                      href={`/product/${top.slug}`}
                      onClick={() => setIsOpen(false)}
                      className="group relative block h-40 overflow-hidden border-b"
                    >
                      {top.imageUrl ? (
                        <Image src={top.imageUrl} alt={top.title} fill sizes="100vw" className="object-cover transition-transform duration-300 group-hover:scale-105" />
                      ) : (
                        <ProductImagePlaceholder title={top.title} icon={top.categoryIcon} />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" aria-hidden />
                      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3">
                        <div className="min-w-0">
                          <p className="line-clamp-1 text-sm font-bold text-white">{top.title}</p>
                          <p className="text-brand text-lg font-black tabular-nums">{formatPrice(top.price)}</p>
                        </div>
                        <span className="bg-brand text-brand-foreground shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold">לצפייה</span>
                      </div>
                    </Link>
                  );
                })()}
              {/* Half the viewport at most. A fixed 24rem is taller than
                  what is left above an open phone keyboard, so the last
                  rows rendered underneath it and the list looked cut off
                  rather than scrollable. overscroll-contain keeps a flick
                  at the end of the list from scrolling the page behind. */}
              <ul className="max-h-[min(24rem,50vh)] overflow-y-auto overscroll-contain">
                {results.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/product/${r.slug}`}
                      onClick={() => setIsOpen(false)}
                      className="hover:bg-muted active:bg-muted flex items-center gap-3 px-3 py-3 sm:px-4"
                    >
                      <div className="bg-muted relative size-14 shrink-0 overflow-hidden rounded-lg sm:size-12">
                        {r.imageUrl ? (
                          <Image src={r.imageUrl} alt={r.title} fill className="bg-white object-contain" sizes="56px" />
                        ) : (
                          <ProductImagePlaceholder title={r.title} icon={r.categoryIcon} />
                        )}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        {/* Two lines on a phone, one from sm up.
                          
                            This was `truncate`, and on a narrow screen the
                            name is the first thing it spent: four results
                            for "מקרר" all read "מקרר ..." and the only
                            column that distinguished them was the one
                            that got cut. A product name is the answer to
                            the question being asked, so it is the last
                            thing that should lose room, not the first. */}
                        <span className="line-clamp-2 text-sm leading-snug font-medium sm:line-clamp-1">
                          {highlightMatch(r.title, query)}
                        </span>
                        {/* One line, and the stock badge rides here rather
                            than beside the price. It carries labels as
                            long as "מלאי אחרון", and in the price column —
                            which is shrink-0 — that length came straight
                            out of the title's width on every row. */}
                        <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                          <span className="truncate">
                            {r.brandName} · {r.categoryName}
                          </span>
                          <StockBadge status={r.stockStatus as never} className="shrink-0" />
                        </span>
                      </div>
                      <span className="shrink-0 text-sm font-bold tabular-nums whitespace-nowrap">
                        {formatPrice(r.price)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <button
                onClick={submitSearch}
                className="text-brand hover:bg-muted w-full border-t py-2.5 text-center text-sm font-medium"
              >
                הצג את כל התוצאות עבור &quot;{query}&quot;
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
