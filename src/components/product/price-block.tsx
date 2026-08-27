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
          // The minus sign is a mathematical prefix, not a Hebrew word, so in
          // an RTL paragraph the bidi algorithm flipped it to the far side
          // and rendered "3%-". Spelling the saving out in Hebrew sidesteps
          // the bidi question entirely and reads better than a signed number.
          <span className="bg-brand/10 text-brand rounded px-1.5 py-0.5 text-xs font-bold">
            <span className="tabular-nums">{pct}%</span> הנחה
          </span>
        )}
      </div>
      {installmentMonths && (
        <span className="text-muted-foreground text-xs">{formatInstallment(price, installmentMonths)}</span>
      )}
    </div>
  );
}
