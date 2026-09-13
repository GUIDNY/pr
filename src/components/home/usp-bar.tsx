import { CreditCard, ShieldCheck, Store, Truck } from "lucide-react";
import { BUSINESS_ADDRESS, BUSINESS_MAP_URL } from "@/lib/business";
import { FREE_DELIVERY_THRESHOLD } from "@/lib/delivery";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

const FACTS = [
  { icon: ShieldCheck, title: "אחריות יבואן רשמי", body: "על כל מוצר באתר" },
  { icon: Truck, title: "משלוח עד הבית", body: `חינם מעל ${formatPrice(FREE_DELIVERY_THRESHOLD)}, לכל הארץ` },
  { icon: CreditCard, title: "תשלום מאובטח", body: "גם בפריסה לתשלומים" },
  { icon: Store, title: "חנות פיזית בחדרה", body: BUSINESS_ADDRESS, href: BUSINESS_MAP_URL },
];

/**
 * The four facts a doubtful visitor checks, in one row under the hero:
 * who stands behind the product, how it arrives, how it is paid for, and
 * where the counter is. Every line is something that can be verified.
 */
export function UspBar() {
  return (
    <section aria-label="למה לקנות אצלנו" className="border-border border-b">
      {/* Phone: one row of pills that scrolls; the 2×2 grid it replaces was
          a fourth box under three others. Desktop: four columns. */}
      <ul className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none] sm:grid sm:grid-cols-4 sm:gap-x-4 sm:gap-y-3 sm:overflow-visible sm:py-4 [&::-webkit-scrollbar]:hidden">
        {FACTS.map(({ icon: Icon, title, body, href }) => {
          const inner = (
            <>
              <span className="bg-brand/10 text-brand flex size-7 shrink-0 items-center justify-center rounded-full sm:size-9">
                <Icon className="size-4 sm:size-4.5" strokeWidth={1.75} />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold whitespace-nowrap sm:text-sm">{title}</span>
                <span className="text-muted-foreground hidden text-xs leading-snug sm:block">{body}</span>
              </span>
            </>
          );
          const cls =
            "bg-card flex items-center gap-2 rounded-full py-1.5 ps-1.5 pe-3.5 shadow-[0_1px_2px_rgb(0_0_0/0.05),0_0_0_1px_rgb(0_0_0/0.05)] sm:gap-2.5 sm:rounded-none sm:bg-transparent sm:p-0 sm:shadow-none";
          return (
            <li key={title} className="shrink-0">
              {href ? (
                <a href={href} target="_blank" rel="noopener noreferrer" className={cn(cls, "hover:text-brand transition-colors")}>
                  {inner}
                </a>
              ) : (
                <div className={cls}>{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
