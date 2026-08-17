"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { Package } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StockBadge } from "@/components/product/stock-badge";
import { formatPrice, formatDateTime } from "@/lib/format";
import type { StockStatus } from "@/lib/enums";

export type InventoryTableProduct = {
  id: string;
  title: string;
  sku: string;
  price: number;
  stockQty: number;
  stockStatus: string;
  updatedAt: Date;
  brand: { name: string };
  category: { name: string };
  source: { filename: string } | null;
  images: { url: string }[];
  _count?: { alerts: number };
};

export function InventoryTable({ products }: { products: InventoryTableProduct[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function rowHref(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("product", id);
    return `${pathname}?${params.toString()}`;
  }

  return (
    <div className="border-border bg-card overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>מוצר</TableHead>
            <TableHead>קטגוריה</TableHead>
            <TableHead>מחיר</TableHead>
            <TableHead>מלאי</TableHead>
            <TableHead>סטטוס</TableHead>
            <TableHead className="hidden md:table-cell">שינוי אחרון</TableHead>
            <TableHead className="hidden lg:table-cell">מקור</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-muted-foreground py-10 text-center">
                לא נמצאו מוצרים תואמים
              </TableCell>
            </TableRow>
          ) : (
            products.map((p) => (
              <TableRow key={p.id} className="hover:bg-muted/50 cursor-pointer">
                <TableCell className="max-w-[260px]">
                  <Link href={rowHref(p.id)} scroll={false} className="flex items-center gap-3">
                    <div className="bg-muted relative size-10 shrink-0 overflow-hidden rounded-md">
                      {p.images[0] ? (
                        <Image src={p.images[0].url} alt="" fill className="object-cover" sizes="40px" />
                      ) : (
                        <div className="text-muted-foreground flex size-full items-center justify-center">
                          <Package className="size-4" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="line-clamp-1 text-sm font-medium">{p.title}</p>
                      <p className="text-muted-foreground text-xs">
                        <span dir="ltr">{p.sku}</span> · {p.brand.name}
                      </p>
                    </div>
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  <Link href={rowHref(p.id)} scroll={false}>{p.category.name}</Link>
                </TableCell>
                <TableCell className="font-semibold tabular-nums">
                  <Link href={rowHref(p.id)} scroll={false}>{formatPrice(p.price)}</Link>
                </TableCell>
                <TableCell className="tabular-nums">
                  <Link href={rowHref(p.id)} scroll={false}>{p.stockQty}</Link>
                </TableCell>
                <TableCell>
                  <Link href={rowHref(p.id)} scroll={false} className="flex items-center gap-1.5">
                    <StockBadge status={p.stockStatus as StockStatus} />
                    {!!p._count?.alerts && p._count.alerts > 0 && (
                      <span className="bg-warning/15 text-warning-foreground rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
                        {p._count.alerts === 1 ? "בעיה 1" : `${p._count.alerts} בעיות`}
                      </span>
                    )}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground hidden text-xs md:table-cell">
                  <Link href={rowHref(p.id)} scroll={false}>{formatDateTime(p.updatedAt)}</Link>
                </TableCell>
                <TableCell className="text-muted-foreground hidden max-w-[140px] truncate text-xs lg:table-cell">
                  <Link href={rowHref(p.id)} scroll={false}>{p.source?.filename ?? "—"}</Link>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
