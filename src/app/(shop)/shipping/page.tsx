import type { Metadata } from "next";
import Link from "next/link";
import { SHIPPING_POLICY_UPDATED_LABEL } from "@/lib/shipping-policy";
import { BUSINESS, BUSINESS_ADDRESS } from "@/lib/business";
import { DELIVERY_CARRIER, FREE_DELIVERY_THRESHOLD, HOME_DELIVERY_FEE } from "@/lib/delivery";
import { formatPrice } from "@/lib/format";

/* מדיניות משלוחים ואספקה.

   The same Merchant Center contract the returns policy is written to, and
   the same three ways to break it without noticing:

   1. Reachable with no login, no registration and no details entered, so
      this page is entirely static — no session read, no cookie, no
      searchParams. The moment anything here reads the visitor, Next serves
      it private/no-store and it stops being a public cacheable page.
   2. Linked from the footer of every page, in words a reviewer recognises.
   3. The wording matches what is entered in Merchant Center. Google compares
      the two, so this is not a page to reword for style alone.

   The numbers are read from the delivery constants rather than typed, for
   the reason the header taught an hour ago: the one place a threshold is
   written by hand is the one place that does not follow when it changes,
   and here that would be a published promise disagreeing with the checkout.

   Section 12 of the terms says the same things in legal register. This page
   exists because a policy buried at §12 of a forty-section document is not
   what a shopper — or a reviewer — can find. */

export const metadata: Metadata = {
  title: "מדיניות משלוחים ואספקה",
  description: `מדיניות המשלוחים של Buy Today — משלוח עד הבית, נקודת איסוף ואיסוף עצמי מחדרה. משלוח חינם בהזמנה מעל ${FREE_DELIVERY_THRESHOLD} ש"ח, זמני אספקה והובלת מוצרים גדולים.`,
  alternates: { canonical: "/shipping" },
};

export default function ShippingPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-2 text-3xl font-bold">מדיניות משלוחים ואספקה</h1>
      <p className="text-muted-foreground mb-8 text-sm">עודכנה לאחרונה: {SHIPPING_POLICY_UPDATED_LABEL}</p>

      <div className="text-muted-foreground flex flex-col gap-8 text-sm leading-relaxed">
        <section>
          <h2 className="text-foreground mb-3 text-lg font-semibold">אפשרויות האספקה והעלות</h2>
          {/* The whole policy in one table, above everything else. A shopper
              opening this page has one question and it is this one. */}
          <div className="border-border overflow-hidden rounded-xl border">
            <table className="w-full text-start">
              <thead className="bg-muted/50 text-foreground">
                <tr>
                  <th className="px-3 py-2 text-start font-semibold">אופן האספקה</th>
                  <th className="px-3 py-2 text-start font-semibold">
                    הזמנה מתחת ל־{formatPrice(FREE_DELIVERY_THRESHOLD)}
                  </th>
                  <th className="px-3 py-2 text-start font-semibold">
                    הזמנה מעל {formatPrice(FREE_DELIVERY_THRESHOLD)}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-border border-t">
                  <td className="px-3 py-2">משלוח עד הבית</td>
                  <td className="text-foreground px-3 py-2 font-medium">{formatPrice(HOME_DELIVERY_FEE)}</td>
                  <td className="text-success px-3 py-2 font-medium">חינם</td>
                </tr>
                <tr className="border-border border-t">
                  <td className="px-3 py-2">נקודת איסוף</td>
                  <td className="text-success px-3 py-2 font-medium">חינם</td>
                  <td className="text-success px-3 py-2 font-medium">חינם</td>
                </tr>
                <tr className="border-border border-t">
                  <td className="px-3 py-2">איסוף עצמי מהחנות בחדרה</td>
                  <td className="text-success px-3 py-2 font-medium">חינם</td>
                  <td className="text-success px-3 py-2 font-medium">חינם</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3">
            עלות המשלוח המדויקת להזמנה שלכם מוצגת בקופה לפני אישור התשלום, ולפני שמזינים פרטי אמצעי תשלום.
          </p>
        </section>

        <section>
          <h2 className="text-foreground mb-2 text-lg font-semibold">מי מבצע את המשלוח</h2>
          <p>
            משלוחי חבילות רגילים מבוצעים באמצעות חברת {DELIVERY_CARRIER}. מוצרים גדולים מסופקים באמצעות מוביל, יבואן
            או ספק — ראו &quot;הובלת מוצרים גדולים&quot; בהמשך.
          </p>
        </section>

        <section>
          <h2 className="text-foreground mb-2 text-lg font-semibold">זמני אספקה</h2>
          <p>
            מוצרים המתאימים למשלוח חבילות רגיל מסופקים בדרך כלל בתוך <strong className="text-foreground">עד 3 ימי
            עסקים</strong>, אלא אם נכתב אחרת בדף המוצר או במהלך ההזמנה.
          </p>
          <p className="mt-2">
            ימי עסקים אינם כוללים שבתות, חגים וימים שבהם המשק אינו פועל באופן רגיל. זמני האספקה עשויים להיות שונים
            באילת, ביישובים מרוחקים ובאזורים שבהם חברת המשלוחים אינה מפעילה קו אספקה רגיל.
          </p>
        </section>

        <section>
          <h2 className="text-foreground mb-2 text-lg font-semibold">נקודת איסוף</h2>
          <p>
            בבחירת נקודת איסוף, {DELIVERY_CARRIER} יוצרים קשר עם הלקוח לאחר ההזמנה כדי לתאם את הנקודה הנוחה לו. לכן
            גם בבחירה זו יש למסור כתובת — היא משמשת כדי להציע נקודה קרובה אליכם, ולא כיעד המשלוח.
          </p>
          <p className="mt-2">
            <strong className="text-foreground">מוצרים גדולים לא ניתנים למסירה בנקודת איסוף</strong> — מקררים,
            מכונות כביסה, מייבשים, מדיחים, תנורים, כיריים, מזגנים, טלוויזיות ומוצרים דומים. אותם אפשר לקבל עד הבית
            או לאסוף מהחנות בחדרה, ובקופה תוצגנה רק האפשרויות המתאימות להזמנה שלכם.
          </p>
        </section>

        <section>
          <h2 className="text-foreground mb-2 text-lg font-semibold">איסוף עצמי מהחנות</h2>
          <p>
            כאשר האפשרות מוצעת עבור המוצר, ניתן לאסוף מהחנות ב־{BUSINESS_ADDRESS}. יש להגיע רק לאחר קבלת הודעה
            שההזמנה מוכנה. בעת האיסוף ייתכן שנבקש מספר הזמנה או פרטי זיהוי כדי לוודא שהמוצר נמסר לאדם הנכון.
          </p>
          <p className="mt-2">איסוף עצמי אינו כרוך בדמי משלוח.</p>
        </section>

        <section>
          <h2 className="text-foreground mb-2 text-lg font-semibold">הובלת מוצרים גדולים</h2>
          <p>
            מקררים, מכונות כביסה, מייבשים, תנורים ומוצרים גדולים אחרים עשויים להיות מסופקים באמצעות מוביל או ישירות
            על ידי היבואן או הספק, ותנאי ההובלה שלהם עשויים להיות שונים מתנאי המשלוח הרגיל. עלות ההובלה, ככל שקיימת,
            מוצגת בדף המוצר או בקופה לפני האישור.
          </p>
          <p className="mt-2">
            הובלה רגילה אינה כוללת, אלא אם צוין אחרת: מנוף, פירוק דלתות או חלונות, עבודות נגרות, פירוק מעקות, שינוי
            תשתיות, עבודות חשמל, מים או גז, וסבלות חריגה.
          </p>
          <p className="mt-2">
            <strong className="text-foreground">באחריות הלקוח לוודא מראש שקיימת גישה סבירה</strong> להכנסת המוצר.
            אם יש מגבלת גישה, מדרגות רבות, מעלית קטנה, מעבר צר או צורך במנוף — נשמח שתעדכנו אותנו מראש.
          </p>
        </section>

        <section>
          <h2 className="text-foreground mb-2 text-lg font-semibold">הזמנה עם כמה מוצרים</h2>
          <p>
            הטבת המשלוח נבחנת לפי הסכום הכולל של המוצרים המשתתפים בהזמנה. ייתכן שמוצרים מאותה הזמנה יסופקו במשלוחים
            נפרדים — למשל כשהם נמצאים אצל ספקים שונים או דורשים סוגי הובלה שונים.
          </p>
          <p className="mt-2">
            הטבת המשלוח אינה חלה באופן אוטומטי על מוצרים המחייבים הובלה מיוחדת או על שירותים נוספים כגון התקנה.
          </p>
        </section>

        <section>
          <h2 className="text-foreground mb-2 text-lg font-semibold">מסירת המשלוח</h2>
          <p>
            נבקש שתהיו זמינים בכתובת ובמועד שתואמו. חברת המשלוחים רשאית לבקש פרטים המאפשרים לאמת את זהות מקבל
            המשלוח או את מספר ההזמנה.
          </p>
          <p className="mt-2">
            אם לא ניתן לבצע את המסירה עקב היעדרות, כתובת שגויה, אי מענה או תנאי גישה שלא נמסרו מראש — משלוח נוסף עשוי
            להיות כרוך בתשלום. השארת מוצר מחוץ לדלת תתאפשר רק כשחברת המשלוחים מאפשרת זאת ובהסכמתכם.
          </p>
        </section>

        <section>
          <h2 className="text-foreground mb-2 text-lg font-semibold">עיכובים</h2>
          <p>
            אנו עושים מאמץ לעמוד במועדי האספקה. ייתכנו עיכובים עקב עומס בחברות ההפצה, מזג אוויר, מצב ביטחוני, מחסור
            אצל יבואן או ספק, שביתה או נסיבות אחרות שאינן בשליטתנו הסבירה. אם נדע על עיכוב מהותי ניצור קשר ונתאם מועד
            חדש.
          </p>
          <p className="mt-2">
            אין באמור כדי לגרוע מזכות ביטול או מכל זכות אחרת המוקנית לכם לפי דין במקרה של אי אספקה במועד.
          </p>
        </section>

        <section>
          <h2 className="text-foreground mb-2 text-lg font-semibold">פינוי מוצר חשמלי ישן</h2>
          <p>
            ברכישת מוצר חשמלי או אלקטרוני לשימוש ביתי ניתן למסור לפינוי מוצר ישן דומה, ללא תשלום, בהתאם לחוק לטיפול
            סביבתי בציוד חשמלי ואלקטרוני ובסוללות. הפרטים המלאים — לרבות הכנת המוצר הישן, מקרים של פינוי חריג
            והאופן שבו זה עובד בנקודת איסוף ובאיסוף עצמי — מופיעים ב
            <Link href="/old-product-removal" className="text-brand hover:underline">עמוד פינוי מוצר ישן</Link>{" "}
            ובסעיף 25 ב<Link href="/terms" className="text-brand hover:underline">תקנון</Link>.
          </p>
        </section>

        <section>
          <h2 className="text-foreground mb-2 text-lg font-semibold">ביטול והחזרה</h2>
          <p>
            תנאי ביטול עסקה, החזרת מוצר והחזר כספי מפורטים ב
            <Link href="/returns" className="text-brand hover:underline">מדיניות ביטול והחזרות</Link>.
          </p>
        </section>

        <section>
          <h2 className="text-foreground mb-2 text-lg font-semibold">שאלות על משלוח</h2>
          <p>
            טלפון:{" "}
            <a href={BUSINESS.phoneHref} className="text-brand hover:underline">
              {BUSINESS.phone}
            </a>
            {" · "}
            דוא&quot;ל:{" "}
            <a href={`mailto:${BUSINESS.email}`} className="text-brand hover:underline">
              {BUSINESS.email}
            </a>
          </p>
          <p className="mt-2">{BUSINESS.legalName} · {BUSINESS_ADDRESS}</p>
        </section>
      </div>
    </div>
  );
}
