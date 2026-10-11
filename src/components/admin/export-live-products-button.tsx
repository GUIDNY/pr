"use client";

import { useTransition } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { exportLiveProductsCsvAction } from "@/actions/export-live-products";

/**
 * Builds the file in the browser from what the action returns, rather than
 * linking to a route that streams it. Two reasons: the gate is the server
 * action's own (a GET route would need its own), and a link that 403s
 * downloads a file called "export.csv" containing an error page, which is
 * the kind of thing somebody emails to an accountant.
 */
export function ExportLiveProductsButton({ count }: { count: number }) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      try {
        const { filename, csv, rows } = await exportLiveProductsCsvAction();
        const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(`${rows.toLocaleString("he-IL")} מוצרים הורדו`);
      } catch {
        toast.error("הייצוא נכשל");
      }
    });
  }

  return (
    <Button onClick={handleClick} disabled={isPending} variant="brand" className="gap-2">
      <Download className={isPending ? "size-4 animate-pulse" : "size-4"} />
      {isPending ? "מייצא..." : `ייצוא ל-Excel (${count.toLocaleString("he-IL")})`}
    </Button>
  );
}
