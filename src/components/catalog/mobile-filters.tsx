"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { FilterSidebar, type FilterAttribute } from "@/components/catalog/filter-sidebar";

export function MobileFilters({
  brands,
  attributes,
  priceRange,
  resultCount,
}: {
  brands: { name: string; slug: string }[];
  attributes: FilterAttribute[];
  priceRange: { min: number; max: number };
  resultCount: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 lg:hidden">
          <SlidersHorizontal className="size-4" />
          מסננים
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>מסננים</SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-4">
          <FilterSidebar brands={brands} attributes={attributes} priceRange={priceRange} />
        </div>
        <div className="bg-background sticky bottom-0 border-t p-4">
          <Button variant="brand" className="w-full" onClick={() => setOpen(false)}>
            הצג {resultCount} תוצאות
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
