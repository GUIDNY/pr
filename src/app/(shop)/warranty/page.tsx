import type { Metadata } from "next";
import Link from "next/link";
import { WARRANTY_POLICY_UPDATED_LABEL } from "@/lib/warranty-policy";
import { BUSINESS, BUSINESS_ADDRESS } from "@/lib/business";

/* אחריות ושירות.

   WHY THIS PAGE EXISTS. The shop promises "אחריות יבואן רשמי" in five
   places — the footer, the USP bar, the hero band, the brand strip and
   every product page — and /warranty, /page/warranty and /page/service all
   answered 404. A promise on 1,800 pages with nothing behind it is the one
   thing on the Merchant Center review list that is a false claim rather
   than an inconsistency, which is why it was fixed first.

   WHAT IS AND IS NOT WRITTEN HERE, and this matters more than the wording.
   Every statement below is either something the shop already asserts on
   every page, a number that comes out of the catalogue, or a contact detail
   from BUSINESS. Nothing about repair turnaround, collection arrangements,
   labour charges or exclusions appears, because nobody has told this file
   what those are, and inventing a service procedure on a page a customer
   will hold the shop to is worse than the 404 it replaces. If those facts
   exist, they belong here next — added by someone who knows them.

   The durations are not typed in: Product.warrantyMonths carries 12, 24, 36
   or 60 depending on the item, the product page already prints it beside
   the same "אחריות יבואן רשמי" line, and a page claiming one fixed number
   would contradict the product pages it is meant to explain. */

export const metadata: Metadata = {
  title: "אחריות ושירות",
  description:
    "האחריות על המוצרים ב-Buy Today ניתנת על ידי היבואן הרשמי. תקופת האחריות מוצגת בדף כל מוצר, וכאן מוסבר איך פותחים קריאת שירות ומה עושים כשמוצר מגיע פגום.",
  alternates: { canonical: "/warranty" },
};

export default function WarrantyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-2 text-3xl font-bold">אחריות ושירות</h1>
      <p className="text-muted-foreground mb-8 text-sm">עודכן לאחרונה: {WARRANTY_POLICY_UPDATED_LABEL}</p>

      <div className="text-muted-foreground flex flex-col gap-8 text-sm leading-relaxed">
        <section>
          <h2 className="text-foreground mb-2 text-lg font-semibold">מי נותן את האחריות</h2>
          <p>
            כל המוצרים הנמכרים באתר הם מוצרים חדשים באחריות{" "}
            <strong className="text-foreground">היבואן הרשמי</strong> של המותג בישראל. האחריות היא של היבואן, והיא
            תקפה בכל נקודות השירות שלו בארץ — לא רק מולנו.
          </p>
          <p className="mt-2">
            תעודת האחריות מגיעה עם המוצר. שמרו אותה יחד עם חשבונית הקנייה; שתיהן נדרשות לפתיחת קריאת שירות.
          </p>
        </section>

        <section>
          <h2 className="text-foreground mb-2 text-lg font-semibold">לכמה זמן</h2>
          <p>
            תקופת האחריות משתנה בין מוצר למוצר ובין יצרן ליצרן, ולכן היא{" "}
            <strong className="text-foreground">מצוינת בדף של כל מוצר</strong>, ליד הכיתוב &quot;אחריות יבואן
            רשמי&quot;. בקטלוג שלנו יש מוצרים עם אחריות של 12, 24, 36 ו-60 חודשים.
          </p>
          <p className="mt-2">
            אם בדף מוצר מסוים לא מצוינת תקופת אחריות — פנו אלינו לפני הרכישה ונברר מול היבואן.
          </p>
        </section>

        <section>
          <h2 className="text-foreground mb-2 text-lg font-semibold">איך פותחים קריאת שירות</h2>
          <p>
            אפשר לפנות ישירות למוקד השירות של היבואן, כפי שמופיע בתעודת האחריות — או אלינו, ונעזור לכם מול היבואן:
          </p>
          <ul className="mt-3 flex list-inside list-disc flex-col gap-1">
            <li>
              טלפון:{" "}
              <a href={BUSINESS.phoneHref} className="text-foreground underline">
                {BUSINESS.phone}
              </a>
            </li>
            <li>
              וואטסאפ:{" "}
              <a href={BUSINESS.whatsappHref} className="text-foreground underline">
                {BUSINESS.whatsapp}
              </a>
            </li>
            <li>
              דוא&quot;ל:{" "}
              <a href={`mailto:${BUSINESS.email}`} className="text-foreground underline">
                {BUSINESS.email}
              </a>
            </li>
            <li>בחנות: {BUSINESS_ADDRESS}</li>
          </ul>
          <p className="mt-3">כדי שנוכל לטפל מהר, החזיקו בהישג יד את מספר ההזמנה, דגם המוצר ותיאור התקלה.</p>
        </section>

        <section>
          <h2 className="text-foreground mb-2 text-lg font-semibold">מוצר שהגיע פגום או לא תקין</h2>
          <p>
            זה לא מקרה של אחריות אלא של ביטול עסקה, והוא מטופל לפי{" "}
            <Link href="/returns" className="text-foreground underline">
              מדיניות הביטולים וההחזרות
            </Link>
            : במוצר פגום לא נגבים דמי ביטול כלל, והמוצר נאסף על חשבוננו.
          </p>
        </section>

        <section>
          <h2 className="text-foreground mb-2 text-lg font-semibold">שאלה לפני שקונים</h2>
          <p>
            אם אתם רוצים לדעת מה בדיוק כוללת האחריות על מוצר מסוים לפני הרכישה — מי נותן אותה, מה היא מכסה ואיפה
            נקודות השירות — פנו אלינו באחת מהדרכים למעלה ונברר מול היבואן לפני שתזמינו.
          </p>
        </section>
      </div>
    </div>
  );
}
