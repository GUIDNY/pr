import { Store, Phone, MapPin } from "lucide-react";
import { BUSINESS, BUSINESS_ADDRESS, BUSINESS_MAP_URL } from "@/lib/business";

/**
 * The shop itself, at the foot of the home page: an address and a phone
 * number, which is the one thing on the page a doubtful visitor can check.
 *
 * This used to be followed by four promise cards — delivery, warranty,
 * service, range — each an icon in a circle over two lines of copy. On a
 * phone they stacked into four screens of the same card, and the owner's
 * verdict on 22 October was that it read as generated. It also said
 * nothing the page had not already said: the usp-bar under the hero
 * carries the same four promises in one row, and the footer repeats three
 * of them. So the cards are gone and what is real stays, sized for a
 * thumb: one card, two buttons that fill its width.
 *
 * Not from the CMS: the street lives in lib/business with the rest of the
 * shop's identity, so it cannot drift from the footer and the JSON-LD.
 */
export function WhyPrec() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-8 sm:py-10">
      <div className="bg-primary text-primary-foreground flex flex-col gap-4 rounded-2xl p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-start gap-3.5">
          <span className="bg-brand text-brand-foreground flex size-11 shrink-0 items-center justify-center rounded-full">
            <Store className="size-5" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <p className="text-base leading-tight font-bold sm:text-lg">חנות פיזית בחדרה, לא רק אתר</p>
            <p className="text-primary-foreground/75 mt-1.5 text-[13px] leading-snug sm:text-sm">
              {BUSINESS_ADDRESS}. אפשר לבוא לראות את המוצרים, לשאול ולקנות במקום.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <a
            href={BUSINESS_MAP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-primary-foreground/10 hover:bg-primary-foreground/20 flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-medium whitespace-nowrap transition-colors sm:flex-none"
          >
            <MapPin className="size-4" /> ניווט לחנות
          </a>
          <a
            href={BUSINESS.phoneHref}
            className="bg-brand text-brand-foreground hover:bg-brand-hover flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-semibold whitespace-nowrap transition-colors sm:flex-none"
          >
            <Phone className="size-4" /> {BUSINESS.phone}
          </a>
        </div>
      </div>
    </section>
  );
}
