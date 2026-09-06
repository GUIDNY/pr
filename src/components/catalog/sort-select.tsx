"use client";

import { useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const OPTIONS = [
  { value: "relevance", label: "רלוונטיות" },
  { value: "newest", label: "החדשים ביותר" },
  { value: "price-asc", label: "מחיר: מהנמוך לגבוה" },
  { value: "price-desc", label: "מחיר: מהגבוה לנמוך" },
  { value: "rating", label: "דירוג" },
];

// `query` is the page's own query string, handed down by the server rather
// than read here with useSearchParams. A client component that calls
// useSearchParams cannot be prerendered — it bails the whole route out to
// client-side rendering — and the category page is prerendered on purpose.
// The server already knows the filters; passing them costs a prop.
export function SortSelect({ query = "" }: { query?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useMemo(() => new URLSearchParams(query), [query]);
  const current = searchParams.get("sort") ?? "relevance";

  return (
    <Select
      value={current}
      onValueChange={(value) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("sort", value);
        params.delete("page");
        router.push(`${pathname}?${params.toString()}`);
      }}
    >
      <SelectTrigger className="h-9 w-[180px] text-sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
