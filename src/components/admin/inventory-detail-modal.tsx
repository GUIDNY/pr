"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getInventoryDrawerDataAction } from "@/actions/admin-inventory";

type Detail = Awaited<ReturnType<typeof getInventoryDrawerDataAction>>;

// "קרא עוד" — the one place every field from the original source row lives,
// even fields with no dedicated column anywhere else in the admin. Fetched
// lazily on open rather than carried on every table row: the raw snapshot
// can be large and most rows are never opened.
export function InventoryDetailButton({ productId }: { productId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);

  function handleOpen() {
    setOpen(true);
    if (detail) return;
    setLoading(true);
    getInventoryDrawerDataAction(productId).then((data) => {
      setDetail(data);
      setLoading(false);
    });
  }

  let raw: Record<string, unknown> = {};
  try {
    raw = detail?.stockBreakdown ? JSON.parse(detail.stockBreakdown) : {};
  } catch {
    raw = {};
  }
  const entries = Object.entries(raw).filter(([, v]) => v !== null && v !== "");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-muted-foreground gap-1.5"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleOpen();
        }}
      >
        <Info className="size-3.5" /> קרא עוד
      </Button>
      <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>פרטי מוצר</DialogTitle>
        </DialogHeader>
        {loading || !detail ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-2/3" />
          </div>
        ) : entries.length === 0 ? (
          <p className="text-muted-foreground text-sm">אין נתונים נוספים עבור מוצר זה</p>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <tbody>
                {entries.map(([label, value]) => (
                  <tr key={label} className="border-border border-b last:border-0">
                    <td className="text-muted-foreground py-1.5 pl-3 align-top font-medium whitespace-nowrap">
                      {label}
                    </td>
                    <td className="py-1.5 text-end">{String(value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
