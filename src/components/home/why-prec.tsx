import Link from "next/link";
import { ShieldCheck, Truck, Headset, Tags, Store, Phone, MapPin, type LucideIcon } from "lucide-react";
import { BUSINESS, BUSINESS_ADDRESS, BUSINESS_MAP_URL } from "@/lib/business";

const ICONS: LucideIcon[] = [Truck, ShieldCheck, Headset, Tags];

export function WhyPrec({ title, items }: { title: string; items: { title: string; body: string }[] }) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-10">
      <h2 className="mb-6 text-xl font-bold sm:text-2xl">{title}</h2>

      {/* The shop itself, first. The four cards below are promises; this is
          an address and a phone number, which is the one thing on the page
          a doubtful visitor can actually check. Not from the CMS: the street
          lives in lib/business with the rest of the shop's identity, so it
          cannot drift from what the footer and the JSON-LD say. */}
      <div className="bg-primary text-primary-foreground mb-4 flex flex-col gap-5 rounded-2xl p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="bg-brand text-brand-foreground flex size-12 shrink-0 items-center justify-center rounded-full">
            <Store className="size-6" strokeWidth={1.75} />
          </span>
          <div>
            <p className="text-lg font-bold">חנות פיזית בחדרה, לא רק אתר</p>
            <p className="text-primary-foreground/70 mt-1 text-sm">
              {BUSINESS.legalName} · {BUSINESS_ADDRESS}. אפשר לבוא לראות את המוצרים, לשאול ולקנות במקום.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <a
            href={BUSINESS_MAP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-primary-foreground/10 hover:bg-primary-foreground/20 flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            <MapPin className="size-4" /> ניווט לחנות
          </a>
          <a
            href={BUSINESS.phoneHref}
            className="bg-brand text-brand-foreground hover:bg-brand-hover flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
          >
            <Phone className="size-4" /> {BUSINESS.phone}
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item, i) => {
          const Icon = ICONS[i % ICONS.length];
          return (
            <div key={item.title} className="border-border bg-card rounded-xl border p-5">
              <span className="bg-brand/10 text-brand mb-3 flex size-11 items-center justify-center rounded-full">
                <Icon className="size-5" strokeWidth={1.5} />
              </span>
              <p className="font-semibold">{item.title}</p>
              <p className="text-muted-foreground mt-1 text-sm leading-relaxed">{item.body}</p>
            </div>
          );
        })}
      </div>
      <p className="text-muted-foreground mt-4 text-sm">
        שאלות לפני קנייה?{" "}
        <Link href="/contact" className="text-brand font-medium hover:underline">
          צרו קשר
        </Link>{" "}
        או{" "}
        <Link href="/track-order" className="text-brand font-medium hover:underline">
          עקבו אחרי הזמנה קיימת
        </Link>
        .
      </p>
    </section>
  );
}
