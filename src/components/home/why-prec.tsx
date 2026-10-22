import { Check, Phone, MapPin, MessageCircle } from "lucide-react";
import { BUSINESS, BUSINESS_ADDRESS, BUSINESS_MAP_URL } from "@/lib/business";
import { DELIVERY_ZONES, FREE_DELIVERY_THRESHOLD } from "@/lib/delivery";
import { formatPrice } from "@/lib/format";

/**
 * The foot of the home page: where the shop is, and the four things that
 * are true about buying here.
 *
 * It was four cards — an icon in a circle over two lines of copy each —
 * and on a phone they stacked into four screens of the same card. The
 * owner's verdict on 22 October: it read as generated, and the opening
 * line ("a physical shop in Hadera, not only a site") was odd. The facts
 * were worth keeping; the shape was not.
 *
 * So the facts are a list, set the way the hero already sets its three
 * ticks — a check mark and a sentence, the figure in bold, no tiles and
 * no circles — and the shop is one card titled with what it is: our
 * shop, the street, the hours, and the two ways to reach it. Every
 * figure comes from lib/business and lib/delivery, the same constants the
 * policies and the JSON-LD are written from, so nothing here can drift.
 */
const FACTS: { lead: string; rest: string }[] = [
  { lead: "משלוח חינם", rest: `בהזמנה מעל ${formatPrice(FREE_DELIVERY_THRESHOLD)}, לכל הארץ` },
  {
    lead: `עד ${DELIVERY_ZONES.local.max} ימי עסקים`,
    rest: `${DELIVERY_ZONES.local.label}, ${DELIVERY_ZONES.national.min}–${DELIVERY_ZONES.national.max} בשאר הארץ`,
  },
  { lead: "אחריות יבואן רשמי", rest: "על כל מוצר באתר" },
  { lead: "תשלום מאובטח", rest: "גם בפריסה לתשלומים" },
];

export function WhyPrec() {
  return (
    <section className="bg-secondary border-border border-t">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:py-10 lg:grid-cols-2 lg:items-center lg:gap-10">
        {/* the shop */}
        <div className="bg-primary text-primary-foreground rounded-2xl p-5 sm:p-6">
          <p className="text-brand text-xs font-bold tracking-wide">החנות שלנו</p>
          <p className="mt-1 text-xl leading-tight font-bold sm:text-2xl">{BUSINESS_ADDRESS}</p>
          <p className="text-primary-foreground/75 mt-1.5 text-sm">{BUSINESS.phoneHoursLabel}</p>
          <div className="mt-4 flex gap-2">
            <a
              href={BUSINESS_MAP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-primary-foreground/10 hover:bg-primary-foreground/20 flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-medium whitespace-nowrap transition-colors sm:flex-none sm:px-4"
            >
              <MapPin className="size-4" /> ניווט
            </a>
            <a
              href={BUSINESS.phoneHref}
              className="bg-brand text-brand-foreground hover:bg-brand-hover flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-semibold whitespace-nowrap transition-colors sm:flex-none sm:px-4"
            >
              <Phone className="size-4" /> {BUSINESS.phone}
            </a>
            <a
              href={BUSINESS.whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="וואטסאפ"
              title="וואטסאפ"
              className="bg-primary-foreground/10 hover:bg-primary-foreground/20 flex size-11 shrink-0 items-center justify-center rounded-xl transition-colors"
            >
              <MessageCircle className="size-5" />
            </a>
          </div>
        </div>

        {/* the facts, as the hero sets its ticks: a check and a sentence */}
        <ul className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 sm:text-[15px]">
          {FACTS.map((f) => (
            <li key={f.lead} className="flex items-start gap-2.5">
              <Check className="text-brand mt-0.5 size-4 shrink-0" strokeWidth={2.5} />
              <span className="leading-snug">
                <span className="font-bold">{f.lead}</span> {f.rest}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
