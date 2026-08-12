"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Scale, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompareStore } from "@/stores/compare-store";

export function CompareTray() {
  const [mounted, setMounted] = useState(false);
  const productIds = useCompareStore((s) => s.productIds);
  const clear = useCompareStore((s) => s.clear);

  useEffect(() => setMounted(true), []);

  if (!mounted || productIds.length === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4">
      <div className="bg-primary text-primary-foreground flex items-center gap-4 rounded-full px-5 py-3 shadow-xl">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Scale className="size-4" />
          {productIds.length} מוצרים להשוואה
        </span>
        <Button variant="brand" size="sm" asChild>
          <Link href="/compare">השוואה</Link>
        </Button>
        <button onClick={clear} aria-label="נקה השוואה" className="text-primary-foreground/60 hover:text-primary-foreground">
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
