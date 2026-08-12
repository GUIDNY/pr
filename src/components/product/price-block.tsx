import { formatInstallment, formatPrice, discountPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export function PriceBlock({
  price,
  compareAtPrice,
  installmentMonths,
  size = "md",
  className,
}: {
  price: number;
  compareAtPrice?: number | null;
  installmentMonths?: number | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const pct = discountPercent(price, compareAtPrice);

  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            "font-bold tabular-nums",
            size === "sm" && "text-base",
            size === "md" && "text-xl",
            size === "lg" && "text-3xl"
          )}
        >
          {formatPrice(price)}
        </span>
        {compareAtPrice && compareAtPrice > price && (
          <span className="text-muted-foreground text-sm tabular-nums line-through">
            {formatPrice(compareAtPrice)}
          </span>
        )}
        {pct && (
          <span className="bg-brand/10 text-brand rounded px-1.5 py-0.5 text-xs font-bold tabular-nums">
            {pct}%-
          </span>
        )}
      </div>
      {installmentMonths && (
        <span className="text-muted-foreground text-xs">{formatInstallment(price, installmentMonths)}</span>
      )}
    </div>
  );
}
