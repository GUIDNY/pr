import { Check, Circle, XCircle, RotateCcw, CreditCard } from "lucide-react";
import { ORDER_TIMELINE_STEPS, ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/enums";
import { cn } from "@/lib/utils";

/* Statuses that are not a step on the way to delivery. Each gets its own card
   instead of a position on the line — an order that never got paid for has not
   travelled part of the way, and showing it against the delivery steps reads
   as "in progress" to the one person who most needs to know it is not. */
const EXCEPTIONS: Partial<
  Record<OrderStatus, { icon: typeof XCircle; tone: "bad" | "warn"; note: string }>
> = {
  CANCELLED: { icon: XCircle, tone: "bad", note: "ההזמנה בוטלה ולא תחויב." },
  REFUND_PENDING: { icon: RotateCcw, tone: "warn", note: "אנו מטפלים בבקשת הזיכוי שלכם." },
  REFUNDED: { icon: RotateCcw, tone: "warn", note: "אנו מטפלים בבקשת הזיכוי שלכם." },
  PAYMENT_FAILED: {
    icon: CreditCard,
    tone: "bad",
    note: "התשלום לא נקלט ולא בוצע חיוב. ההזמנה שמורה — אפשר לנסות לשלם שוב או ליצור איתנו קשר.",
  },
};

export function OrderTimeline({ status }: { status: OrderStatus }) {
  const exception = EXCEPTIONS[status];
  if (exception) {
    const { icon: Icon, tone, note } = exception;
    const bad = tone === "bad";
    return (
      <div className={cn("flex items-center gap-3 rounded-xl border p-4", bad ? "border-destructive/30 bg-destructive/5" : "border-warning/30 bg-warning/10")}>
        <Icon className={cn("size-6 shrink-0", bad ? "text-destructive" : "text-warning-foreground")} />
        <div>
          <p className="font-semibold">{ORDER_STATUS_LABELS[status]}</p>
          <p className="text-muted-foreground text-sm">{note}</p>
        </div>
      </div>
    );
  }

  const currentIndex = ORDER_TIMELINE_STEPS.indexOf(status);

  return (
    <div className="flex flex-col gap-0 sm:flex-row sm:items-start sm:gap-0">
      {ORDER_TIMELINE_STEPS.map((step, i) => {
        const isDone = i < currentIndex || i === currentIndex;
        const isCurrent = i === currentIndex;
        const isLast = i === ORDER_TIMELINE_STEPS.length - 1;

        return (
          <div key={step} className={cn("flex sm:flex-1 sm:flex-col", "flex-row items-start gap-3 sm:items-center sm:gap-0")}>
            <div className="flex flex-col items-center sm:w-full sm:flex-row">
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold",
                  isDone ? "border-brand bg-brand text-brand-foreground" : "border-border bg-background text-muted-foreground"
                )}
              >
                {isDone ? <Check className="size-4" /> : <Circle className="size-2 fill-current" />}
              </span>
              {!isLast && (
                <span
                  className={cn(
                    "sm:mt-0 mt-1 ms-4 h-8 w-0.5 sm:ms-0 sm:h-0.5 sm:w-full sm:flex-1",
                    i < currentIndex ? "bg-brand" : "bg-border"
                  )}
                />
              )}
            </div>
            <p
              className={cn(
                "pb-4 text-sm sm:pt-2 sm:pb-0 sm:text-center",
                isCurrent ? "text-foreground font-semibold" : isDone ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {ORDER_STATUS_LABELS[step]}
            </p>
          </div>
        );
      })}
    </div>
  );
}
