"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { searchProductsAction, type SearchResult } from "@/actions/search";
import { formatPrice } from "@/lib/format";
import { ProductImagePlaceholder } from "@/components/product/product-image-placeholder";
import { StockBadge } from "@/components/product/stock-badge";
import { cn } from "@/lib/utils";

export function SearchBar({ className }: { className?: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          submitSearch();
        }}
        className="relative"
      >
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2" />
        <input
          value={query}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => query.trim().length >= 2 && setIsOpen(true)}
          type="search"
          placeholder="מה אתם מחפשים היום?"
          aria-label="חיפוש מוצרים"
          className="border-input bg-background focus-visible:ring-brand/40 h-10 w-full rounded-full border py-2 ps-9 pe-9 text-sm outline-none focus-visible:ring-3"
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
      </form>

      {isOpen && query.trim().length >= 2 && (
        <div className="bg-popover text-popover-foreground absolute top-full z-50 mt-2 w-full overflow-hidden rounded-xl border shadow-lg">
          {isPending && results.length === 0 ? (
            <div className="text-muted-foreground p-4 text-center text-sm">מחפש...</div>
          ) : results.length === 0 ? (
            <div className="text-muted-foreground p-4 text-center text-sm">לא נמצאו תוצאות עבור &quot;{query}&quot;</div>
          ) : (
            <>
              <ul className="max-h-96 overflow-y-auto">
                {results.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/product/${r.slug}`}
                      onClick={() => setIsOpen(false)}
                      className="hover:bg-muted flex items-center gap-3 px-4 py-2.5"
                    >
                      <div className="bg-muted size-12 shrink-0 overflow-hidden rounded-md">
                        <ProductImagePlaceholder title={r.title} icon={r.categoryIcon} />
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-medium">{r.title}</span>
                        <span className="text-muted-foreground text-xs">
                          {r.brandName} · {r.categoryName}
                        </span>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-0.5">
                        <span className="text-sm font-bold tabular-nums">{formatPrice(r.price)}</span>
                        <StockBadge status={r.stockStatus as never} />
                      </div>
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
