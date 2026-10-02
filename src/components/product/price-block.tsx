import { formatInstallment, formatPrice, discountPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export function PriceBlock({
  price,
  compareAtPrice,
  installmentMonths,
  size = "md",
  className,
  showPercent = true,
}: {
  price: number;
  compareAtPrice?: number | null;
  installmentMonths?: number | null;
  size?: "sm" | "md" | "lg";
  className?: string;
  // Off where the discount is already said nearby — the product card has
  // it in the corner of the photograph, and at two cards to a phone row
  // a third item on the price line spilled out of the card.
  showPercent?: boolean;
}) {
  const pct = discountPercent(price, compareAtPrice);

  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
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
        {pct && showPercent && (
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
