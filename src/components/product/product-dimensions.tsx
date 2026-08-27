import { Ruler } from "lucide-react";
import type { ProductDimension } from "@/lib/product-key-facts";

// Real dimension attributes only (see getProductDimensions) — renders
// nothing when a product has none, same rule as every other section here.
export function ProductDimensions({ dimensions }: { dimensions: ProductDimension[] }) {
  if (dimensions.length === 0) return null;

  return (
    <div>
      <h3 className="mb-3 flex items-center gap-1.5 text-base font-bold">
        <Ruler className="text-brand size-4" />
        מידות
      </h3>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {dimensions.map((d, i) => (
          <div key={i} className="border-border bg-card rounded-xl border p-3.5 text-center shadow-sm">
            <p className="text-muted-foreground text-xs">{d.label}</p>
            <p className="mt-1 text-lg font-bold">{d.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
