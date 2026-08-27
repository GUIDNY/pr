"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { STOCK_STATUSES, STOCK_STATUS_LABELS, INVENTORY_ALERT_TYPE_LABELS, type InventoryAlertType } from "@/lib/enums";

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "updated", label: "עודכן לאחרונה" },
  { value: "title", label: "שם" },
  { value: "sku", label: 'מק"ט' },
  { value: "brand", label: "מותג" },
  { value: "price_desc", label: "מחיר גבוה לנמוך" },
  { value: "price_asc", label: "מחיר נמוך לגבוה" },
  { value: "cost_desc", label: "מחיר ספק גבוה לנמוך" },
  { value: "cost_asc", label: "מחיר ספק נמוך לגבוה" },
  { value: "stock_desc", label: "מלאי גבוה לנמוך" },
  { value: "stock", label: "מלאי נמוך לגבוה" },
  { value: "synced", label: "חדש במערכת" },
];

export function InventoryFilterBar({
  brands,
  sources,
  categories,
}: {
  brands: { id: string; name: string }[];
  sources: { id: string; filename: string }[];
  categories: { slug: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");

  function pushParams(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  const secondaryKeys = ["status", "categorySlug", "brandId", "sourceId", "publishStatus", "hasTemporarySku", "sort"] as const;
  const activeCount = secondaryKeys.filter((k) => searchParams.get(k)).length;

  const chips: { key: string; label: string }[] = [];
  const status = searchParams.get("status");
  if (status) chips.push({ key: "status", label: STOCK_STATUS_LABELS[status as keyof typeof STOCK_STATUS_LABELS] ?? status });
  const categorySlug = searchParams.get("categorySlug");
  if (categorySlug) chips.push({ key: "categorySlug", label: categories.find((c) => c.slug === categorySlug)?.name ?? categorySlug });
  const brandId = searchParams.get("brandId");
  if (brandId) chips.push({ key: "brandId", label: brands.find((b) => b.id === brandId)?.name ?? "מותג" });
  const sourceId = searchParams.get("sourceId");
  if (sourceId) chips.push({ key: "sourceId", label: sources.find((s) => s.id === sourceId)?.filename ?? "מקור" });
  const publishStatus = searchParams.get("publishStatus");
  if (publishStatus) chips.push({ key: "publishStatus", label: publishStatus === "PUBLISHED" ? "מפורסם" : "לא מפורסם" });
  const alertType = searchParams.get("alertType");
  if (alertType) chips.push({ key: "alertType", label: INVENTORY_ALERT_TYPE_LABELS[alertType as InventoryAlertType] ?? alertType });
  const hasTemporarySku = searchParams.get("hasTemporarySku");
  if (hasTemporarySku) chips.push({ key: "hasTemporarySku", label: 'ללא מק"ט מקורי' });

  return (
    <div className="mb-4 flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <form
          className="relative min-w-[240px] flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            pushParams((p) => (search ? p.set("search", search) : p.delete("search")));
          }}
        >
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder='חיפוש לפי שם, מק"ט, מותג או דגם'
            className="ps-9"
          />
        </form>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <SlidersHorizontal className="size-3.5" />
              סינון
              {activeCount > 0 && (
                <span className="bg-brand text-brand-foreground flex size-4 items-center justify-center rounded-full text-[10px] font-bold">
                  {activeCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="grid w-72 gap-3">
            <div className="space-y-1.5">
              <label className="text-muted-foreground text-xs font-medium">מצב מלאי</label>
              <Select
                value={searchParams.get("status") ?? "ALL"}
                onValueChange={(v) => pushParams((p) => (v === "ALL" ? p.delete("status") : p.set("status", v)))}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">הכל</SelectItem>
                  {STOCK_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{STOCK_STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-muted-foreground text-xs font-medium">קטגוריה</label>
              <Select
                value={searchParams.get("categorySlug") ?? "ALL"}
                onValueChange={(v) => pushParams((p) => (v === "ALL" ? p.delete("categorySlug") : p.set("categorySlug", v)))}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">כל הקטגוריות</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-muted-foreground text-xs font-medium">מותג</label>
              <Select
                value={searchParams.get("brandId") ?? "ALL"}
                onValueChange={(v) => pushParams((p) => (v === "ALL" ? p.delete("brandId") : p.set("brandId", v)))}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">כל המותגים</SelectItem>
                  {brands.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-muted-foreground text-xs font-medium">מקור נתונים</label>
              <Select
                value={searchParams.get("sourceId") ?? "ALL"}
                onValueChange={(v) => pushParams((p) => (v === "ALL" ? p.delete("sourceId") : p.set("sourceId", v)))}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">כל המקורות</SelectItem>
                  {sources.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.filename}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-muted-foreground text-xs font-medium">מצב פרסום</label>
              <Select
                value={searchParams.get("publishStatus") ?? "ALL"}
                onValueChange={(v) => pushParams((p) => (v === "ALL" ? p.delete("publishStatus") : p.set("publishStatus", v)))}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">הכל</SelectItem>
                  <SelectItem value="PUBLISHED">מפורסם</SelectItem>
                  <SelectItem value="UNPUBLISHED">לא מפורסם</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={searchParams.get("hasTemporarySku") === "1"}
                onChange={(e) => pushParams((p) => (e.target.checked ? p.set("hasTemporarySku", "1") : p.delete("hasTemporarySku")))}
                className="accent-brand size-4"
              />
              רק מוצרים ללא מק&quot;ט מקורי
            </label>
          </PopoverContent>
        </Popover>

        <Select
          value={searchParams.get("sort") ?? "updated"}
          onValueChange={(v) => pushParams((p) => p.set("sort", v))}
        >
          <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => pushParams((p) => p.delete(chip.key))}
              className="bg-accent text-accent-foreground hover:bg-accent/70 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors"
            >
              {chip.label}
              <X className="size-3" />
            </button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground h-auto p-1 text-xs"
            onClick={() => router.push(pathname)}
          >
            נקה הכל
          </Button>
        </div>
      )}
    </div>
  );
}
