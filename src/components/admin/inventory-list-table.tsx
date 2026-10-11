import Link from "next/link";
import { CheckCircle2, ExternalLink } from "lucide-react";
import type { ProductLine } from "@/lib/queries/inventory-control";
import { formatPrice } from "@/lib/format";

/**
 * One table, four tabs.
 *
 * The four lists the owner asked for — new from the sync, a price
 * disagreement, no photograph, and everything else wrong — differ only in
 * which products are in them and what the last column says. Writing them
 * four times is how four pages drift into looking like four different
 * products, so the shape lives here and each page supplies its own rows and
 * its own right-hand column.
 */
export function InventoryListTable({
  rows,
  empty,
  columnLabel,
  column,
}: {
  rows: ProductLine[];
  empty: string;
  columnLabel?: string;
  column?: (p: ProductLine) => React.ReactNode;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground border-border flex items-center gap-2 rounded-xl border px-4 py-8 text-sm">
        <CheckCircle2 className="text-success size-4 shrink-0" />
        {empty}
      </p>
    );
  }

  return (
    <div className="border-border overflow-hidden rounded-xl border">
      <table className="w-full text-sm">
        <thead className="bg-muted/60 text-muted-foreground">
          <tr>
            <th className="p-3 text-start font-semibold">מוצר</th>
            <th className="p-3 text-start font-semibold whitespace-nowrap">מחיר</th>
            <th className="p-3 text-start font-semibold whitespace-nowrap">עלות</th>
            <th className="p-3 text-start font-semibold whitespace-nowrap">מלאי</th>
            {column && <th className="p-3 text-start font-semibold">{columnLabel ?? ""}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="border-border border-t">
              <td className="p-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0">
                    <p className="line-clamp-2 font-medium">{p.title}</p>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {p.category && <span className="text-foreground/70 font-medium">{p.category} · </span>}
                      {p.brand && <span>{p.brand} · </span>}
                      מק״ט {p.sku}
                      {/* Trimmed on display only. A tab name that still carries
                          the supplier's stray space is a product the current
                          sync did not match, and that is worth knowing — but
                          it is not worth a column. */}
                      {p.sheet && <span> · {p.sheet.trim()}</span>}
                    </p>
                  </div>
                  <div className="ms-auto flex shrink-0 items-center gap-1.5">
                    <Link
                      href={`/admin/products/${p.id}`}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="פתח את כרטיס המוצר"
                    >
                      <ExternalLink className="size-3.5" />
                    </Link>
                  </div>
                </div>
              </td>
              <td className="p-3 font-semibold whitespace-nowrap">
                {p.price > 0 ? formatPrice(p.price) : <span className="text-destructive">—</span>}
              </td>
              <td className="text-muted-foreground p-3 whitespace-nowrap">
                {p.supplierCost === null ? "—" : formatPrice(p.supplierCost)}
              </td>
              <td className="p-3 whitespace-nowrap">{p.stockQty} יח׳</td>
              {column && <td className="p-3 text-xs">{column(p)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
