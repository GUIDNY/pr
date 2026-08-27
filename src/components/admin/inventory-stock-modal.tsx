"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type StockLine = { id: string; label: string; quantity: number };

// The single "מלאי" table cell — a plain clickable badge showing the total,
// nothing else. Where that total is physically sitting (which showroom,
// which bonded warehouse) only shows up once the admin actually asks for
// it, via this popup — never as extra columns cluttering the table.
export function InventoryStockBadge({ total, lines }: { total: number; lines: StockLine[] }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className={
          total > 0
            ? "bg-success/15 text-success hover:bg-success/25 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums transition-colors"
            : "bg-muted text-muted-foreground hover:bg-muted/70 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums transition-colors"
        }
      >
        במלאי {total}
      </button>
      <DialogContent className="sm:max-w-xs" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>פירוט מלאי</DialogTitle>
        </DialogHeader>
        {lines.length === 0 ? (
          <p className="text-muted-foreground text-sm">אין נתוני מלאי לפי מקור עבור מוצר זה</p>
        ) : (
          <div className="flex flex-col gap-1.5 text-sm">
            {lines.map((line) => (
              <div key={line.id} className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{line.label}</span>
                <span className="font-medium tabular-nums">{line.quantity}</span>
              </div>
            ))}
            <div className="mt-1 flex items-center justify-between gap-3 border-t pt-1.5 font-semibold">
              <span>סה&quot;כ</span>
              <span className="tabular-nums">{total}</span>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
