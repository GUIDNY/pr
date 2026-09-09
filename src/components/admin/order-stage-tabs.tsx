import Link from "next/link";
import { ORDER_STAGES, STAGE_LABELS, STAGE_HINTS, type OrderStage } from "@/lib/order-stage";

/**
 * The three tabs the whole queue hangs off.
 *
 * Server-rendered links rather than client state, so a tab is a real address:
 * it can be bookmarked, opened in a second window beside the first, and — the
 * one that matters daily — returned to by the browser's back button after
 * opening an order and coming back. Client-side tabs lose that, and the way
 * you find out is somebody complaining that going back from an order dumps
 * them on the wrong list.
 */
export function OrderStageTabs({
  active,
  counts,
}: {
  active: OrderStage;
  counts: Record<OrderStage, number>;
}) {
  return (
    <div className="border-border flex gap-1 overflow-x-auto border-b" role="tablist">
      {ORDER_STAGES.map((stage) => {
        const on = stage === active;
        return (
          <Link
            key={stage}
            href={`/admin/orders?stage=${stage}`}
            role="tab"
            aria-selected={on}
            title={STAGE_HINTS[stage]}
            className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-bold whitespace-nowrap transition-colors ${
              on
                ? "border-brand text-brand"
                : "text-muted-foreground hover:text-foreground border-transparent"
            }`}
          >
            {STAGE_LABELS[stage]}
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-black ${
                on ? "bg-brand text-brand-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              {counts[stage]}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
