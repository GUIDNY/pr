"use client";

import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

const VIEWS: { key: string; label: string }[] = [
  { key: "ALL", label: "הכל" },
  { key: "NEEDS_ATTENTION", label: "דורש טיפול" },
  { key: "LOW_STOCK", label: "מלאי נמוך" },
  { key: "READY_TO_PUBLISH", label: "מוכן לפרסום" },
  { key: "PUBLISHED", label: "פורסם" },
  { key: "UNPUBLISHED", label: "לא פורסם" },
];

export function InventoryViewTabs() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = searchParams.get("view") ?? "ALL";

  function go(view: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (view === "ALL") params.delete("view");
    else params.set("view", view);
    params.delete("page");
    params.delete("alertType");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="mb-4 flex flex-wrap gap-1">
      {VIEWS.map((v) => (
        <button
          key={v.key}
          type="button"
          onClick={() => go(v.key)}
          className={cn(
            "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
            active === v.key ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:bg-muted"
          )}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}
