import Link from "next/link";
import { ORDER_STATUSES, ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/enums";

/**
 * Where the work is, in one row. Without this, finding out how many orders are
 * waiting on the supplier means selecting that status in a dropdown and
 * reading the result count — for each of twelve statuses in turn.
 *
 * Statuses nobody has an order in are left out: an empty status is not a
 * destination, and twelve chips reading "0" hide the three that matter.
 */
export function OrdersStatusTabs({
  counts,
  total,
  active,
  buildHref,
}: {
  counts: Record<string, number>;
  total: number;
  active: OrderStatus | "ALL";
  buildHref: (status: OrderStatus | "ALL") => string;
}) {
  const shown = ORDER_STATUSES.filter((s) => (counts[s] ?? 0) > 0);

  return (
    <div className="mb-4 flex flex-wrap gap-2">
      <Chip href={buildHref("ALL")} label="הכל" count={total} active={active === "ALL"} />
      {shown.map((s) => (
        <Chip
          key={s}
          href={buildHref(s)}
          label={ORDER_STATUS_LABELS[s]}
          count={counts[s] ?? 0}
          active={active === s}
        />
      ))}
    </div>
  );
}

function Chip({
  href,
  label,
  count,
  active,
}: {
  href: string;
  label: string;
  count: number;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "bg-primary text-primary-foreground flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium"
          : "border-border hover:bg-muted flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm"
      }
    >
      {label}
      <span className={active ? "text-primary-foreground/70 tabular-nums" : "text-muted-foreground tabular-nums"}>
        {count}
      </span>
    </Link>
  );
}
