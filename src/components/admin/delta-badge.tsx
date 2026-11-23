import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { pctChange } from "@/lib/admin/trend-math";

/** Green up-arrow or red down-arrow with the change against the previous
    period. When the previous period was zero there is no percentage to
    give, and the badge says so rather than inventing one. */
export function DeltaBadge({ cur, prev, invert = false }: { cur: number; prev: number; invert?: boolean }) {
  const pct = pctChange(cur, prev);
  if (pct === null) {
    return (
      <span className="text-muted-foreground inline-flex items-center gap-0.5 text-xs">
        <Minus className="size-3" />
        {cur > 0 ? "אין בסיס להשוואה" : "—"}
      </span>
    );
  }
  const rounded = Math.round(pct * 10) / 10;
  if (rounded === 0) {
    return (
      <span className="text-muted-foreground inline-flex items-center gap-0.5 text-xs font-medium">
        <Minus className="size-3" />0%
      </span>
    );
  }
  const good = invert ? rounded < 0 : rounded > 0;
  const Icon = rounded > 0 ? ArrowUp : ArrowDown;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-bold tabular-nums ${good ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
    >
      <Icon className="size-3.5" />
      {Math.abs(rounded).toLocaleString("he-IL")}%
    </span>
  );
}
