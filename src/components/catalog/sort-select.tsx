"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const OPTIONS = [
  { value: "relevance", label: "רלוונטיות" },
  { value: "newest", label: "החדשים ביותר" },
  { value: "price-asc", label: "מחיר: מהנמוך לגבוה" },
  { value: "price-desc", label: "מחיר: מהגבוה לנמוך" },
  { value: "rating", label: "דירוג" },
];

export function SortSelect() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
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
