import Link from "next/link";
import { ClipboardCheck, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Two ways of looking at the same orders, for the people who have both.
 *
 * Until 25 October a manager got only the table — every status in a
 * dropdown, the assignee, the dates — and a seller got only the handling
 * view: the queue in three stages, one next action per order, "שולם
 * ידנית" and the deposit capture. The owner, handling a declined card from
 * a phone, found the table had none of the buttons he had asked for,
 * because those had been built into the view his role never saw.
 *
 * So a manager has both, as two pills, and opens on the handling view: it
 * is the one that gets an order out. The table is one tap away, as
 * `?view=full`, and the pills carry the order's own address so the switch
 * never loses the page. A seller is not shown the switch at all.
 */
export type OrdersView = "handle" | "full";

export function ordersViewFor(canSeeFull: boolean, requested: string | undefined): OrdersView {
  if (!canSeeFull) return "handle";
  return requested === "full" ? "full" : "handle";
}

export function OrdersViewSwitch({ view, href }: { view: OrdersView; href: (view: OrdersView) => string }) {
  const pill = (v: OrdersView, label: string, Icon: typeof Table2) => (
    <Link
      href={href(v)}
      aria-current={view === v ? "page" : undefined}
      className={cn(
        "flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-colors",
        view === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-4" />
      {label}
    </Link>
  );
  return (
    <div className="flex items-center gap-1.5" role="tablist" aria-label="תצוגת הזמנות">
      {pill("handle", "טיפול בהזמנות", ClipboardCheck)}
      {pill("full", "טבלה מלאה", Table2)}
    </div>
  );
}
