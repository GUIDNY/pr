import Link from "next/link";
import { getRecentChanges } from "@/lib/queries/admin-inventory";
import { InventoryTabs } from "@/components/admin/inventory-tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination, PaginationContent, PaginationItem, PaginationLink } from "@/components/ui/pagination";
import { formatDateTime } from "@/lib/format";
import { INVENTORY_CHANGE_TYPE_LABELS, type InventoryChangeType } from "@/lib/enums";

export const metadata = { title: "שינויים אחרונים | A&I Electronics Admin" };

const PAGE_SIZE = 50;

function formatVal(v: string | null) {
  if (v === null) return "—";
  try {
    const parsed = JSON.parse(v);
    if (typeof parsed === "object" && parsed !== null) {
      return "title" in parsed ? parsed.title : JSON.stringify(parsed);
    }
    return String(parsed);
  } catch {
    return v;
  }
}

export default async function InventoryChangesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  const { events, total } = await getRecentChanges({ page, pageSize: PAGE_SIZE });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">מרכז בקרת מלאי</h1>
      <InventoryTabs />

      <div className="text-muted-foreground mb-2 text-sm">{total.toLocaleString("he-IL")} שינויים</div>

      <div className="border-border bg-card overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>מוצר</TableHead>
              <TableHead>דגם</TableHead>
              <TableHead>סוג שינוי</TableHead>
              <TableHead>מ-</TableHead>
              <TableHead>ל-</TableHead>
              <TableHead>זמן</TableHead>
              <TableHead>מקור</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground py-10 text-center">
                  אין עדיין שינויים רשומים
                </TableCell>
              </TableRow>
            ) : (
              events.map((e) => (
                <TableRow key={e.id} className="hover:bg-muted/50">
                  <TableCell className="max-w-[200px]">
                    {e.product ? (
                      <Link href={`/admin/inventory/${e.product.id}`} className="text-brand line-clamp-1 font-medium hover:underline">
                        {e.product.title}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">{e.sourceSku}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">{e.product?.model ?? "—"}</TableCell>
                  <TableCell>
                    <span className="bg-accent text-accent-foreground rounded-full px-2 py-0.5 text-xs font-medium">
                      {INVENTORY_CHANGE_TYPE_LABELS[e.changeType as InventoryChangeType] ?? e.changeType}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm tabular-nums">{formatVal(e.previousValue)}</TableCell>
                  <TableCell className="text-sm font-medium tabular-nums">{formatVal(e.newValue)}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{formatDateTime(e.createdAt)}</TableCell>
                  <TableCell className="text-muted-foreground max-w-[140px] truncate text-xs">
                    {e.source?.filename ?? "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <Pagination className="mt-6">
          <PaginationContent>
            {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => i + 1).map((p) => (
              <PaginationItem key={p}>
                <PaginationLink href={`/admin/inventory/changes?page=${p}`} isActive={p === page}>
                  {p}
                </PaginationLink>
              </PaginationItem>
            ))}
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
