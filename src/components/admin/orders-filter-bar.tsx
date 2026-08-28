"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ORDER_STATUSES, ORDER_STATUS_LABELS } from "@/lib/enums";

export function OrdersFilterBar({ staff }: { staff: { id: string; name: string }[] }) {
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
          placeholder="חיפוש לפי מספר הזמנה, שם, טלפון או אימייל"
          className="ps-9"
        />
      </form>

      <Select
        value={searchParams.get("status") ?? "ALL"}
        onValueChange={(v) => pushParams((p) => (v === "ALL" ? p.delete("status") : p.set("status", v)))}
      >
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="סטטוס" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">כל הסטטוסים</SelectItem>
          {ORDER_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {ORDER_STATUS_LABELS[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get("assignedToId") ?? "ALL"}
        onValueChange={(v) => pushParams((p) => (v === "ALL" ? p.delete("assignedToId") : p.set("assignedToId", v)))}
      >
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="עובד אחראי" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">כל העובדים</SelectItem>
          {staff.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Two bare date boxes reading "mm/dd/yyyy" on a Hebrew screen say
          nothing about which end of the range they are. */}
      <label className="text-muted-foreground flex items-center gap-1.5 text-sm">
        מתאריך
        <Input
          type="date"
          aria-label="מתאריך"
          value={searchParams.get("dateFrom") ?? ""}
          onChange={(e) => pushParams((p) => (e.target.value ? p.set("dateFrom", e.target.value) : p.delete("dateFrom")))}
          className="w-[150px]"
        />
      </label>
      <label className="text-muted-foreground flex items-center gap-1.5 text-sm">
        עד
        <Input
          type="date"
          aria-label="עד תאריך"
          value={searchParams.get("dateTo") ?? ""}
          onChange={(e) => pushParams((p) => (e.target.value ? p.set("dateTo", e.target.value) : p.delete("dateTo")))}
          className="w-[150px]"
        />
      </label>

      {searchParams.toString() && (
        <Button variant="ghost" size="sm" onClick={() => router.push(pathname)}>
          נקה סינון
        </Button>
      )}
    </div>
  );
}
