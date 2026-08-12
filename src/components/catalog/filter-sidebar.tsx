"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export type FilterAttribute = {
  key: string;
  label: string;
  unit: string | null;
  options: string[] | null;
};

export function FilterSidebar({
  brands,
  attributes,
  priceRange,
}: {
  brands: { name: string; slug: string }[];
  attributes: FilterAttribute[];
  priceRange: { min: number; max: number };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selectedBrands = searchParams.getAll("brand");
  const inStockOnly = searchParams.get("inStock") === "1";
  const [minPrice, setMinPrice] = useState(searchParams.get("min") ?? "");
  const [maxPrice, setMaxPrice] = useState(searchParams.get("max") ?? "");

  function pushParams(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  function toggleBrand(slug: string) {
    pushParams((params) => {
      const current = params.getAll("brand");
      params.delete("brand");
      if (current.includes(slug)) {
        current.filter((s) => s !== slug).forEach((s) => params.append("brand", s));
      } else {
        [...current, slug].forEach((s) => params.append("brand", s));
      }
    });
  }

  function toggleAttribute(key: string, value: string) {
    pushParams((params) => {
      const paramKey = `attr_${key}`;
      const current = params.getAll(paramKey);
      params.delete(paramKey);
      if (current.includes(value)) {
        current.filter((s) => s !== value).forEach((s) => params.append(paramKey, s));
      } else {
        [...current, value].forEach((s) => params.append(paramKey, s));
      }
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

  function clearAll() {
    router.push(pathname);
  }

  const hasActiveFilters =
    selectedBrands.length > 0 || inStockOnly || searchParams.get("min") || searchParams.get("max") ||
    attributes.some((a) => searchParams.getAll(`attr_${a.key}`).length > 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">מסננים</h3>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearAll} className="text-brand h-auto p-0 text-xs">
            נקה הכל
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="in-stock"
          checked={inStockOnly}
          onCheckedChange={() =>
            pushParams((params) => {
              if (inStockOnly) params.delete("inStock");
              else params.set("inStock", "1");
            })
          }
        />
        <Label htmlFor="in-stock" className="text-sm font-normal">
          במלאי בלבד
        </Label>
      </div>

      <Separator />

      <div>
        <p className="mb-2 text-sm font-medium">טווח מחירים</p>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            placeholder={String(priceRange.min)}
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            onBlur={applyPrice}
            className="h-8 text-sm"
          />
          <span className="text-muted-foreground text-xs">—</span>
          <Input
            type="number"
            placeholder={String(priceRange.max)}
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            onBlur={applyPrice}
            className="h-8 text-sm"
          />
        </div>
      </div>

      {brands.length > 0 && (
        <>
          <Separator />
          <div>
            <p className="mb-2 text-sm font-medium">יצרן</p>
            <div className="flex flex-col gap-2">
              {brands.map((b) => (
                <div key={b.slug} className="flex items-center gap-2">
                  <Checkbox
                    id={`brand-${b.slug}`}
                    checked={selectedBrands.includes(b.slug)}
                    onCheckedChange={() => toggleBrand(b.slug)}
                  />
                  <Label htmlFor={`brand-${b.slug}`} className="text-sm font-normal">
                    {b.name}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {attributes.map((attr) =>
        attr.options && attr.options.length > 0 ? (
          <div key={attr.key}>
            <Separator className="mb-4" />
            <p className="mb-2 text-sm font-medium">
              {attr.label} {attr.unit && `(${attr.unit})`}
            </p>
            <div className="flex flex-col gap-2">
              {attr.options.map((opt) => (
                <div key={opt} className="flex items-center gap-2">
                  <Checkbox
                    id={`${attr.key}-${opt}`}
                    checked={searchParams.getAll(`attr_${attr.key}`).includes(opt)}
                    onCheckedChange={() => toggleAttribute(attr.key, opt)}
                  />
                  <Label htmlFor={`${attr.key}-${opt}`} className="text-sm font-normal">
                    {opt}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        ) : null
      )}
    </div>
  );
}
