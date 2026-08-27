"use client";

import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { Boxes } from "lucide-react";
import { cn } from "@/lib/utils";

// Recognizable Excel-green document glyph — kept as a plain inline SVG
// (no icon-library dependency) since it's a specific brand mark, not a
// generic lucide icon.
function ExcelIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect x="3" y="2" width="24" height="32" rx="3" fill="#21A366" />
      <rect x="3" y="2" width="24" height="32" rx="3" fill="url(#excel-sheen)" fillOpacity="0.15" />
      <path d="M9 11.5h12M9 18h12M9 24.5h12" stroke="white" strokeWidth="1.4" strokeOpacity="0.55" />
      <rect x="16" y="12" width="17" height="17" rx="2.5" fill="#107C41" />
      <path
        d="M20.3 16.3l3 4.7-3.1 4.9h2.3l1.9-3.2 1.9 3.2h2.3l-3.1-4.9 3-4.7h-2.2l-1.8 3-1.8-3h-2.4z"
        fill="white"
      />
      <defs>
        <linearGradient id="excel-sheen" x1="3" y1="2" x2="27" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="white" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export type InventorySource = { id: string; filename: string };

// Total-in-stock stat, plus one card per connected source file — visually
// the same "square card" language, so the file picker reads as part of the
// same summary strip rather than a separate control. Picking a file scopes
// the category tabs and table below it to that file's own sub-categories;
// picking none (or re-clicking "כל הקבצים") shows everything combined.
export function InventorySummaryBar({ totalProducts, sources }: { totalProducts: number; sources: InventorySource[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeSourceId = searchParams.get("sourceId") ?? "";

  function selectSource(sourceId: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (!sourceId) params.delete("sourceId");
    else params.set("sourceId", sourceId);
    // A category from one file may not exist in another — switching files
    // without clearing it would silently filter to an empty table.
    params.delete("categorySlug");
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="mb-5 flex flex-wrap items-stretch gap-3">
      <div className="border-border bg-card flex items-center gap-3 rounded-xl border px-4 py-3">
        <span className="bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-lg">
          <Boxes className="size-4.5" />
        </span>
        <div>
          <p className="text-xl font-bold tabular-nums">{totalProducts.toLocaleString("he-IL")}</p>
          <p className="text-muted-foreground text-xs">מוצרים במלאי</p>
        </div>
      </div>

      {sources.length >= 2 && (
        <button
          type="button"
          onClick={() => selectSource("")}
          className={cn(
            "flex items-center gap-3 rounded-xl border px-4 py-3 text-start transition-colors",
            activeSourceId === "" ? "border-brand bg-brand/5" : "border-border bg-card hover:bg-muted/50"
          )}
        >
          <span className="bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-lg">
            <Boxes className="size-4.5" />
          </span>
          <div>
            <p className="text-sm font-semibold">כל הקבצים</p>
            <p className="text-muted-foreground text-xs">{sources.length} מקורות מחוברים</p>
          </div>
        </button>
      )}

      {sources.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => selectSource(s.id)}
          className={cn(
            "flex items-center gap-3 rounded-xl border px-4 py-3 text-start transition-colors",
            activeSourceId === s.id ? "border-brand bg-brand/5" : "border-border bg-card hover:bg-muted/50"
          )}
        >
          <ExcelIcon className="size-9 shrink-0" />
          <div className="min-w-0">
            <p className="max-w-[160px] truncate text-sm font-semibold">{s.filename}</p>
            <p className="text-muted-foreground text-xs">מקור נתונים</p>
          </div>
        </button>
      ))}
    </div>
  );
}
