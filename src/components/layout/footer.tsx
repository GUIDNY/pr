import Image from "next/image";
import Link from "next/link";
import { Phone, MapPin, ShieldCheck, Truck, CreditCard, MessageCircle } from "lucide-react";
/* The official marks, from Simple Icons. lucide-react dropped every brand
   glyph before v1.31, so these cannot come from the same import as the icons
   beside them.

   Imported per icon rather than from the package root: that barrel re-exports
   around three thousand components, and while the package sets
   sideEffects:false so a production build shakes the rest out, the subpath
   costs nothing and keeps dev compiles from walking all of them. */
import SiInstagram from "@icons-pack/react-simple-icons/icons/SiInstagram";
import SiFacebook from "@icons-pack/react-simple-icons/icons/SiFacebook";
import { ConsentSettingsLink } from "@/components/layout/consent-settings-link";
import { getNavigableCategoryTree } from "@/lib/queries/categories";
import { BUSINESS, BUSINESS_ADDRESS, BUSINESS_MAP_URL } from "@/lib/business";

export async function Footer() {
  const departments = (await getNavigableCategoryTree()).slice(0, 6);

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
          {/* The tile alone, matching the header — it carries the name
              itself, so type beside it only repeated it.

              Named, unlike the header's copy of the same image. There the
              logo sits inside a link that is already labelled "Buy Today —
              לדף הבית", so alt text would make a screen reader say the name
              twice. Here it stands alone and is the only thing identifying
              the shop in the footer, so an empty alt really would drop
              information rather than avoid repeating it. */}
          <Image
            src="/brand/logo.png"
            alt="Buy Today"
            width={512}
            height={512}
            className="size-12 rounded-[22%]"
          />
          <p className="text-primary-foreground/60 mt-3 text-sm leading-relaxed">
            חנות מוצרי חשמל, אלקטרוניקה וקולנוע ביתי. קשת נרחבת של מוצרים במחירים תחרותיים.
          </p>
          {/* Was one button, captioned "עמוד הפייסבוק שלנו", pointing at
              https://www.facebook.com/ — Facebook's own front page. A visitor
              who pressed it was told the shop had a page and then handed
              somebody else's, which is worse than offering nothing, and
              schema.ts left sameAs out for exactly that reason. Both
              addresses are real now and live in BUSINESS, so the footer and
              the structured data cannot drift apart. */}
          <div className="mt-4 flex items-center gap-3">
            <a
              href={BUSINESS.instagram}
              target="_blank"
              rel="noreferrer noopener"
              aria-label="Buy Today באינסטגרם"
              className="bg-primary-foreground/10 hover:bg-primary-foreground/20 flex size-9 items-center justify-center rounded-full transition-colors"
            >
              <SiInstagram aria-hidden className="size-4" />
            </a>
            <a
              href={BUSINESS.facebook}
              target="_blank"
              rel="noreferrer noopener"
              aria-label="Buy Today בפייסבוק"
              className="bg-primary-foreground/10 hover:bg-primary-foreground/20 flex size-9 items-center justify-center rounded-full transition-colors"
            >
              <SiFacebook aria-hidden className="size-4" />
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
              <Link href="/articles" className="text-primary-foreground/60 hover:text-primary-foreground text-sm">
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
              <Link href="/terms" className="text-primary-foreground/60 hover:text-primary-foreground text-sm">
                תקנון האתר
              </Link>
            </li>
            <li>
              {/* Merchant Center will not approve a single product without a
                  returns policy it can reach from the site, and it looks for
                  a link in the footer. The wording here is the wording it is
                  told to look for. */}
              <Link href="/returns" className="text-primary-foreground/60 hover:text-primary-foreground text-sm">
                מדיניות ביטול והחזרות
              </Link>
            </li>
            <li>
              <Link href="/privacy" className="text-primary-foreground/60 hover:text-primary-foreground text-sm">
                מדיניות פרטיות
              </Link>
            </li>
            <li>
              <Link href="/accessibility" className="text-primary-foreground/60 hover:text-primary-foreground text-sm">
                הצהרת נגישות
              </Link>
            </li>
            {/* Next to the privacy policy on purpose: withdrawing consent has
                to be findable in the same place someone goes to read what
                they agreed to. It renders its own <li>, because inside the
                iOS app it renders nothing at all and an empty row would be
                left behind. */}
            <ConsentSettingsLink />
            <li>
              <a href={BUSINESS.phoneHref} className="text-primary-foreground/60 hover:text-primary-foreground flex items-center gap-1.5 text-sm">
                <Phone className="size-3.5" /> {BUSINESS.phone}
              </a>
            </li>
            <li>
              {/* A separate line, because it is a separate number answered in
                  a separate place. */}
              <a
                href={BUSINESS.whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-foreground/60 hover:text-primary-foreground flex items-center gap-1.5 text-sm"
              >
                <MessageCircle className="size-3.5" /> {BUSINESS.whatsapp}
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-primary-foreground/10 border-t px-4 py-4">
        <div className="text-primary-foreground/50 mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 text-xs sm:flex-row">
          {/* The registered company beside the trading name: a shop that says
              who is legally behind it reads as one that expects to be found. */}
          <span>
            © {new Date().getFullYear()} Buy Today · {BUSINESS.legalName}. כל הזכויות שמורות.
          </span>
          {/* Was "ישראל", which is not an address — it told a visitor
              wondering whether this is a real shop with a real counter
              exactly nothing. */}
          <a
            href={BUSINESS_MAP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary-foreground flex items-center gap-1"
          >
            <MapPin className="size-3" /> {BUSINESS_ADDRESS}
          </a>
        </div>
      </div>
    </footer>
  );
}
