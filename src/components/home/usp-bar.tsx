import { CreditCard, ShieldCheck, Store, Truck } from "lucide-react";
import { BUSINESS_ADDRESS, BUSINESS_MAP_URL } from "@/lib/business";
import { FREE_DELIVERY_THRESHOLD } from "@/lib/delivery";
import { formatPrice } from "@/lib/format";

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
      <ul className="mx-auto grid max-w-7xl grid-cols-2 gap-x-4 gap-y-3 px-4 py-4 sm:grid-cols-4">
        {FACTS.map(({ icon: Icon, title, body, href }) => {
          const inner = (
            <>
              <span className="bg-brand/10 text-brand flex size-9 shrink-0 items-center justify-center rounded-full">
                <Icon className="size-4.5" strokeWidth={1.75} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{title}</span>
                <span className="text-muted-foreground block text-xs leading-snug">{body}</span>
              </span>
            </>
          );
          return (
            <li key={title}>
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-brand flex items-center gap-2.5 transition-colors"
                >
                  {inner}
                </a>
              ) : (
                <div className="flex items-center gap-2.5">{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
