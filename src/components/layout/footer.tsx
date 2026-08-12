import Link from "next/link";
import { Phone, MapPin, ShieldCheck, Truck, CreditCard, Share2 } from "lucide-react";
import { CATEGORY_TREE } from "@/lib/category-tree";

export function Footer() {
  const departments = CATEGORY_TREE.slice(0, 6);

  return (
    <footer className="bg-primary text-primary-foreground mt-16">
      <div className="border-border/10 border-b">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-8 sm:grid-cols-3">
          <div className="flex items-center gap-3">
            <Truck className="text-brand size-8 shrink-0" />
            <div>
              <p className="font-semibold">משלוח עד הבית</p>
              <p className="text-primary-foreground/60 text-sm">לכל הארץ, כולל התקנה</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ShieldCheck className="text-brand size-8 shrink-0" />
            <div>
              <p className="font-semibold">אחריות יבואן רשמי</p>
              <p className="text-primary-foreground/60 text-sm">על כל המוצרים באתר</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <CreditCard className="text-brand size-8 shrink-0" />
            <div>
              <p className="font-semibold">תשלום מאובטח</p>
              <p className="text-primary-foreground/60 text-sm">כולל פריסה לתשלומים</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-4 py-10 sm:grid-cols-4">
        <div className="col-span-2 sm:col-span-1">
          <span className="text-xl font-black">
            <span className="text-brand">P</span>REC
          </span>
          <p className="text-primary-foreground/60 mt-3 text-sm leading-relaxed">
            חנות מוצרי חשמל, אלקטרוניקה וקולנוע ביתי. קשת נרחבת של מוצרים במחירים תחרותיים.
          </p>
          <div className="mt-4 flex items-center gap-3">
            <a
              href="https://www.facebook.com/"
              target="_blank"
              rel="noreferrer noopener"
              aria-label="עמוד הפייסבוק שלנו"
              className="bg-primary-foreground/10 hover:bg-primary-foreground/20 flex size-9 items-center justify-center rounded-full transition-colors"
            >
              <Share2 className="size-4" />
            </a>
          </div>
        </div>

        <div>
          <p className="mb-3 text-sm font-semibold">קטגוריות</p>
          <ul className="flex flex-col gap-2">
            {departments.map((d) => (
              <li key={d.slug}>
                <Link href={`/category/${d.slug}`} className="text-primary-foreground/60 hover:text-primary-foreground text-sm">
                  {d.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="mb-3 text-sm font-semibold">שירות לקוחות</p>
          <ul className="flex flex-col gap-2">
            <li>
              <Link href="/contact" className="text-primary-foreground/60 hover:text-primary-foreground text-sm">
                צור קשר
              </Link>
            </li>
            <li>
              <Link href="/track-order" className="text-primary-foreground/60 hover:text-primary-foreground text-sm">
                מעקב הזמנה
              </Link>
            </li>
            <li>
              <Link href="/page/branches" className="text-primary-foreground/60 hover:text-primary-foreground text-sm">
                סניפים
              </Link>
            </li>
            <li>
              <Link href="/page/articles" className="text-primary-foreground/60 hover:text-primary-foreground text-sm">
                מאמרים
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <p className="mb-3 text-sm font-semibold">החברה</p>
          <ul className="flex flex-col gap-2">
            <li>
              <Link href="/page/about" className="text-primary-foreground/60 hover:text-primary-foreground text-sm">
                אודותינו
              </Link>
            </li>
            <li>
              <Link href="/page/terms" className="text-primary-foreground/60 hover:text-primary-foreground text-sm">
                תקנון האתר
              </Link>
            </li>
            <li>
              <Link href="/accessibility" className="text-primary-foreground/60 hover:text-primary-foreground text-sm">
                הצהרת נגישות
              </Link>
            </li>
            <li>
              <a href="tel:04-6639510" className="text-primary-foreground/60 hover:text-primary-foreground flex items-center gap-1.5 text-sm">
                <Phone className="size-3.5" /> 04-6639510
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-primary-foreground/10 border-t px-4 py-4">
        <div className="text-primary-foreground/50 mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 text-xs sm:flex-row">
          <span>© {new Date().getFullYear()} PREC. כל הזכויות שמורות.</span>
          <span className="flex items-center gap-1">
            <MapPin className="size-3" /> ישראל
          </span>
        </div>
      </div>
    </footer>
  );
}
