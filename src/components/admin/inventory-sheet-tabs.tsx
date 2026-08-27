"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

export type SheetSummaryCard = { sourceSheet: string; count: number };

// One tab per sheet/tab in the source file — the level between "which file"
// (InventorySummaryBar's file cards) and individual rows. Picking a sheet
// scopes the table below to just that tab's rows. Collapsed to one row by
// default (files with many sheets used to sprawl into a wall of pills) —
// "הצג הכל" reveals the rest.
export function InventorySheetTabs({ sheets }: { sheets: SheetSummaryCard[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = searchParams.get("sourceSheet") ?? "";

  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const [rowHeight, setRowHeight] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const firstChip = el.querySelector("button");
    if (!firstChip) return;
    const height = firstChip.getBoundingClientRect().height;
    setRowHeight(height);

    const check = () => setOverflowing(el.scrollHeight > height + 4);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [sheets]);

  function go(sourceSheet: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (!sourceSheet) params.delete("sourceSheet");
    else params.set("sourceSheet", sourceSheet);
    // A sub-category from one sheet may not exist in another.
    params.delete("categorySlug");
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  if (sheets.length < 2) return null;

  return (
    <div className="mb-2">
      <div
        ref={containerRef}
        className="flex flex-wrap gap-1 overflow-hidden"
        style={!expanded && rowHeight ? { maxHeight: rowHeight } : undefined}
      >
        <button
          type="button"
          onClick={() => go("")}
          className={cn(
            "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
            active === "" ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:bg-muted"
          )}
        >
          כל הגליונות
        </button>
        {sheets.map((s) => (
          <button
            key={s.sourceSheet}
            type="button"
            onClick={() => go(s.sourceSheet)}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              active === s.sourceSheet ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:bg-muted"
            )}
          >
            {s.sourceSheet}
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums",
                active === s.sourceSheet ? "bg-brand-foreground/20" : "bg-muted"
              )}
            >
              {s.count}
            </span>
          </button>
        ))}
      </div>

      {overflowing && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-brand mt-1.5 flex items-center gap-1 text-xs font-semibold hover:underline"
        >
          {expanded ? "הצג פחות" : "הצג הכל"}
          {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </button>
      )}
    </div>
  );
}
