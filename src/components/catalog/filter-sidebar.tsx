"use client";

import { useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** `values` are the raw database spellings one chip stands for — a chip
    reading "8" carries both "8" and `8 ק"ג`. See getCategoryFacets. */
export type FacetOption = { value: string; count: number; values: string[] };
export type BrandFacet = FacetOption & { name: string };
export type Facet = { key: string; label: string; unit: string | null; options: FacetOption[] };

/* Six is the whole anti-clutter rule, and it is not arbitrary: six lines is
   about what the eye takes in without reading, and a section that is taller
   than that stops being a choice and becomes a wall. Anything the shopper
   has already picked is always shown, so a selection can never hide behind
   "show more" — a filter you cannot see is a filter you cannot undo. */
const VISIBLE = 6;

export function FilterSidebar({
  brands,
  attributes,
  priceRange,
  query = "",
}: {
  brands: BrandFacet[];
  attributes: Facet[];
  priceRange: { min: number; max: number };
  query?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  // See SortSelect: handed down, not read, so the route stays prerenderable.
  const searchParams = useMemo(() => new URLSearchParams(query), [query]);

  const selectedBrands = searchParams.getAll("brand");
  const [minPrice, setMinPrice] = useState(searchParams.get("min") ?? "");
  const [maxPrice, setMaxPrice] = useState(searchParams.get("max") ?? "");

  function pushParams(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  /* A chip owns a set of raw values, not one, so it goes into the URL and
     comes out of it as a set. Toggling one spelling at a time would leave a
     chip that looks off while half its products are still filtered out. */
  function toggle(paramKey: string, values: string[]) {
    pushParams((params) => {
      const current = params.getAll(paramKey);
      params.delete(paramKey);
      const isOn = values.some((v) => current.includes(v));
      const next = isOn ? current.filter((s) => !values.includes(s)) : [...current, ...values];
      next.forEach((s) => params.append(paramKey, s));
    });
  }

  function clearPrice() {
    setMinPrice("");
    setMaxPrice("");
    pushParams((params) => {
      params.delete("min");
      params.delete("max");
    });
  }

  function applyPrice() {
    pushParams((params) => {
      if (minPrice) params.set("min", minPrice);
      else params.delete("min");
      if (maxPrice) params.set("max", maxPrice);
      else params.delete("max");
    });
  }

  /* Everything currently narrowing the shelf, in one row at the top.
   *
   * Without it the only record of a choice is a tick somewhere down a list
   * the shopper has scrolled past, and the usual result is a page showing
   * four products, a shopper who cannot see why, and a shop that looks empty
   * rather than filtered. */
  const activeChips: { label: string; clear: () => void }[] = [];
  for (const slug of selectedBrands) {
    const brand = brands.find((b) => b.value === slug);
    activeChips.push({ label: brand?.name ?? slug, clear: () => toggle("brand", [slug]) });
  }
  for (const attr of attributes) {
    const active = searchParams.getAll(`attr_${attr.key}`);
    // One chip per option the shopper picked, not per raw spelling behind it.
    for (const opt of attr.options) {
      if (opt.values.some((v) => active.includes(v))) {
        activeChips.push({ label: opt.value, clear: () => toggle(`attr_${attr.key}`, opt.values) });
      }
    }
  }
  const priceActive = searchParams.get("min") || searchParams.get("max");
  if (priceActive) {
    activeChips.push({
      label: `₪${searchParams.get("min") ?? priceRange.min}–₪${searchParams.get("max") ?? priceRange.max}`,
      clear: clearPrice,
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">מסננים</h3>
        {activeChips.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => router.push(pathname)} className="text-brand h-auto p-0 text-xs">
            נקה הכל
          </Button>
        )}
      </div>

      {activeChips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {activeChips.map((chip, i) => (
            <button
              key={`${chip.label}-${i}`}
              type="button"
              onClick={chip.clear}
              className="bg-brand/10 text-brand hover:bg-brand/20 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors"
            >
              {chip.label}
              <X className="size-3" />
            </button>
          ))}
        </div>
      )}

      <div>
        <p className="mb-2 text-sm font-medium">טווח מחירים</p>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            aria-label="מחיר מינימלי"
            placeholder={String(priceRange.min)}
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            onBlur={applyPrice}
            className="h-8 text-sm"
          />
          <span className="text-muted-foreground text-xs">—</span>
          <Input
            type="number"
            aria-label="מחיר מקסימלי"
            placeholder={String(priceRange.max)}
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            onBlur={applyPrice}
            className="h-8 text-sm"
          />
        </div>
      </div>

      {brands.length > 0 && (
        <FacetSection
          title="יצרן"
          options={brands.map((b) => ({ label: b.name, count: b.count, values: b.values }))}
          selected={selectedBrands}
          onToggle={(values) => toggle("brand", values)}
        />
      )}

      {attributes.map((attr) => (
        <FacetSection
          key={attr.key}
          title={attr.unit ? `${attr.label} (${attr.unit})` : attr.label}
          options={attr.options.map((o) => ({ label: o.value, count: o.count, values: o.values }))}
          selected={searchParams.getAll(`attr_${attr.key}`)}
          onToggle={(values) => toggle(`attr_${attr.key}`, values)}
        />
      ))}
    </div>
  );
}

function FacetSection({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: { label: string; count: number; values: string[] }[];
  selected: string[];
  onToggle: (values: string[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  // A chosen option is never folded away, whatever its position in the list.
  const isOn = (o: { values: string[] }) => o.values.some((v) => selected.includes(v));
  const shown = expanded ? options : options.filter((o, i) => i < VISIBLE || isOn(o));
  const hidden = options.length - shown.length;

  return (
    <div className="border-border border-t pt-4">
      <p className="mb-2 text-sm font-medium">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {shown.map((opt) => {
          const isSelected = isOn(opt);
          return (
            <button
              key={opt.label}
              type="button"
              onClick={() => onToggle(opt.values)}
              aria-pressed={isSelected}
              className={cn(
                "rounded-lg border px-2.5 py-1.5 text-xs transition-colors",
                isSelected
                  ? "border-brand bg-brand/10 text-brand font-semibold"
                  : "border-border hover:border-brand/50 hover:bg-muted"
              )}
            >
              {opt.label}
              {/* The count is the point of the whole rebuild: it turns a
                  guess into a choice, and it is the reason an option that
                  leads nowhere is never printed. */}
              <span className={cn("ms-1", isSelected ? "text-brand/70" : "text-muted-foreground")}>{opt.count}</span>
            </button>
          );
        })}
      </div>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-muted-foreground hover:text-brand mt-2 text-xs underline"
        >
          עוד {hidden}
        </button>
      )}
      {expanded && options.length > VISIBLE && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-muted-foreground hover:text-brand mt-2 text-xs underline"
        >
          הצג פחות
        </button>
      )}
    </div>
  );
}
