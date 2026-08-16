"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { STOCK_STATUSES, STOCK_STATUS_LABELS } from "@/lib/enums";

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

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <form
        className="relative min-w-[220px] flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          pushParams((p) => (search ? p.set("search", search) : p.delete("search")));
        }}
      >
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder='חיפוש לפי מק"ט, דגם, שם או מותג'
          className="ps-9"
        />
      </form>

      <Select
        value={searchParams.get("status") ?? "ALL"}
        onValueChange={(v) => pushParams((p) => (v === "ALL" ? p.delete("status") : p.set("status", v)))}
      >
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="זמינות" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">כל הזמינויות</SelectItem>
          {STOCK_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {STOCK_STATUS_LABELS[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get("categorySlug") ?? "ALL"}
        onValueChange={(v) => pushParams((p) => (v === "ALL" ? p.delete("categorySlug") : p.set("categorySlug", v)))}
      >
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="קטגוריה" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">כל הקטגוריות</SelectItem>
          {categories.map((c) => (
            <SelectItem key={c.slug} value={c.slug}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get("brandId") ?? "ALL"}
        onValueChange={(v) => pushParams((p) => (v === "ALL" ? p.delete("brandId") : p.set("brandId", v)))}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="מותג" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">כל המותגים</SelectItem>
          {brands.map((b) => (
            <SelectItem key={b.id} value={b.id}>
              {b.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get("sourceId") ?? "ALL"}
        onValueChange={(v) => pushParams((p) => (v === "ALL" ? p.delete("sourceId") : p.set("sourceId", v)))}
      >
        <SelectTrigger className="w-[170px]">
          <SelectValue placeholder="קובץ מקור" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">כל הקבצים</SelectItem>
          {sources.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.filename}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get("publishStatus") ?? "ALL"}
        onValueChange={(v) => pushParams((p) => (v === "ALL" ? p.delete("publishStatus") : p.set("publishStatus", v)))}
      >
        <SelectTrigger className="w-[130px]">
          <SelectValue placeholder="פרסום" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">הכל</SelectItem>
          <SelectItem value="PUBLISHED">מפורסם</SelectItem>
          <SelectItem value="UNPUBLISHED">לא מפורסם</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get("sort") ?? "updated"}
        onValueChange={(v) => pushParams((p) => p.set("sort", v))}
      >
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="מיון" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="updated">עודכן לאחרונה</SelectItem>
          <SelectItem value="synced">סונכרן לאחרונה</SelectItem>
          <SelectItem value="stock">מלאי</SelectItem>
          <SelectItem value="price">מחיר</SelectItem>
          <SelectItem value="brand">מותג</SelectItem>
          <SelectItem value="model">דגם</SelectItem>
          <SelectItem value="title">שם מוצר</SelectItem>
          <SelectItem value="category">קטגוריה</SelectItem>
        </SelectContent>
      </Select>

      {searchParams.toString() && (
        <Button variant="ghost" size="sm" onClick={() => router.push(pathname)}>
          נקה סינון
        </Button>
      )}
    </div>
  );
}
