import type { Metadata } from "next";
import Link from "next/link";
import { REMOVAL_POLICY_UPDATED_LABEL } from "@/lib/removal-policy";
import { BUSINESS, BUSINESS_ADDRESS } from "@/lib/business";
import { DELIVERY_CARRIER } from "@/lib/delivery";
import {
  REMOVAL_ACKNOWLEDGEMENT,
  REMOVAL_NOT_A_TRADESMAN,
  REMOVAL_ORDERING_ENABLED,
  REMOVAL_PREPARATION,
} from "@/lib/recycling";
import { EXCEPTIONAL_REMOVAL_REASONS } from "@/lib/enums";

/* פינוי מוצר חשמלי ואלקטרוני ישן.

   The standing page behind every removal link in the shop: the product page's
   notice, the checkbox at the checkout, the confirmation email, the footer
   and section 25 of the terms all arrive here.

   Static, like /shipping and for the same three reasons — reachable with no
   login and nothing entered, linked from the footer in words a person
   recognises, and worded to match what the shop says elsewhere. The moment
   anything here reads the visitor, Next serves it private and it stops being
   a public cacheable page.

   Every rule on it is imported rather than retyped. The preparation list, the
   access questions and the acknowledgement sentence are the same constants
   the checkout renders, so the page a customer reads before ordering and the
   form they tick cannot come to say different things — which for a page whose
   whole job is "here is what you are agreeing to" is the only failure that
   would matter.

   Section 25 of the terms says this in legal register. This page exists
   because a right buried at §25 of a forty-section document is not a right
   anybody finds. */

export const metadata: Metadata = {
  title: "פינוי מוצר חשמלי ואלקטרוני ישן",
  description:
    "ברכישת מוצר חשמלי או אלקטרוני חדש ב-Buy Today ניתן למסור מוצר ישן דומה לפינוי, ללא תשלום, בהתאם לחוק לטיפול סביבתי בציוד חשמלי ואלקטרוני ובסוללות.",
  alternates: { canonical: "/old-product-removal" },
};

export default function OldProductRemovalPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-2 text-3xl font-bold">פינוי מוצר חשמלי ואלקטרוני ישן</h1>
      <p className="text-muted-foreground mb-8 text-sm">עודכן לאחרונה: {REMOVAL_POLICY_UPDATED_LABEL}</p>

      <div className="text-muted-foreground flex flex-col gap-8 text-sm leading-relaxed">
        <section>
          <p>
            ב-Buy Today ניתן למסור ציוד חשמלי ואלקטרוני ישן בהתאם לחוק לטיפול סביבתי בציוד חשמלי ואלקטרוני ובסוללות
            ולנוהל המשרד להגנת הסביבה.
          </p>
        </section>

        <section>
          <h2 className="text-foreground mb-3 text-lg font-semibold">איזה מוצר אפשר למסור?</h2>
          <p>
            ניתן למסור מוצר ישן <strong className="text-foreground">דומה</strong> למוצר החדש שנרכש. &quot;דומה&quot;
            פירושו מוצר מאותה קבוצת ציוד שנועד לשימוש דומה.
          </p>
          {/* A table rather than a list of sentences: the question this page
              is opened with is "does my old one count", and a column of
              new-beside-old answers it at a glance in a way prose does not. */}
          <div className="border-border mt-3 overflow-hidden rounded-xl border">
            <table className="w-full text-start">
              <thead className="bg-muted/50 text-foreground">
                <tr>
                  <th className="px-3 py-2 text-start font-semibold">המוצר החדש שנרכש</th>
                  <th className="px-3 py-2 text-start font-semibold">המוצר הישן שניתן למסור</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["מקרר", "מקרר ישן"],
                  ["מכונת כביסה", "מכונת כביסה ישנה"],
                  ["מייבש כביסה", "מייבש כביסה ישן"],
                  ["מדיח כלים", "מדיח כלים ישן"],
                  ["טלוויזיה", "טלוויזיה ישנה"],
                  ["מיקרוגל", "מיקרוגל ישן"],
                  ["שואב אבק", "שואב אבק ישן"],
                ].map(([bought, given]) => (
                  <tr key={bought} className="border-border border-t">
                    <td className="px-3 py-2">{bought}</td>
                    <td className="text-foreground px-3 py-2 font-medium">{given}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3">
            המוצר הישן <strong className="text-foreground">אינו חייב</strong> להיות מאותו מותג, מאותו יבואן, באותו דגם
            או באותו גודל. לדוגמה, ברכישת מקרר 600 ליטר ניתן למסור מקרר ישן של 300 ליטר.
          </p>
          <p className="mt-2">
            לעומת זאת, לא ניתן למסור מוצר מקבוצת ציוד אחרת — מקרר חדש אינו מזכה בפינוי מכונת כביסה ישנה, וטלוויזיה
            חדשה אינה מזכה בפינוי מיקרוגל ישן.
          </p>
        </section>

        <section>
          <h2 className="text-foreground mb-2 text-lg font-semibold">כמה עולה הפינוי?</h2>
          <p>
            ככלל, פינוי מוצר ישן דומה מתבצע <strong className="text-foreground">ללא תשלום</strong>. במוצרי חשמל
            גדולים, במקרים של פינוי חריג המפורטים בהמשך, עשויה להיות תוספת תשלום — ותימסר לכם לפני ביצוע הפינוי.
          </p>
        </section>

        <section>
          <h2 className="text-foreground mb-2 text-lg font-semibold">איך מכינים את המוצר לפינוי?</h2>
          <p>המוצר הישן צריך להיות:</p>
          <ul className="mt-2 flex list-disc flex-col gap-1 ps-5">
            {REMOVAL_PREPARATION.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="mt-3">{REMOVAL_NOT_A_TRADESMAN}</p>
          <p className="mt-2">
            אפשר לסרב לפנות מוצר שמצבו יוצר סיכון בריאותי או בטיחותי.
          </p>
        </section>

        <section>
          <h2 className="text-foreground mb-2 text-lg font-semibold">מתי פינוי יכול להיות חריג?</h2>
          <p>במוצר חשמלי גדול — מוצר שלפחות צלע אחת שלו ארוכה מ-50 ס&quot;מ — בין היתר כאשר:</p>
          <ul className="mt-2 flex list-disc flex-col gap-1 ps-5">
            {/* The same five questions the checkout asks, from the same
                constant. "לא בטוח" is one of them there and is therefore one
                of them here: it is an answer that sends the order to a phone
                call, not a blank. */}
            {EXCEPTIONAL_REMOVAL_REASONS.map((r) => (
              <li key={r.key}>{r.label}</li>
            ))}
          </ul>
          <p className="mt-3">
            <strong className="text-foreground">פינוי של עד שתי קומות ללא מעלית אינו כרוך בתוספת</strong> בשל המדרגות
            בלבד. אם הדירה בקומה 6 והמעלית מגיעה לקומה 4, נותרות שתי קומות ברגל — וזה אינו נחשב כשלעצמו לפינוי של 3
            קומות ומעלה.
          </p>
          <p className="mt-2">
            אם מקרר אינו עובר בדלת ונדרש פירוק דלתות על ידי המוביל, זו יכולה להיות פעולת פינוי חריגה בתשלום. אם
            הוצאתם את המוצר בעצמכם, בשלמותו, למקום נגיש — לא ייגבה תשלום רק משום שנדרש פירוק כדי להוציא אותו.
          </p>
        </section>

        <section>
          <h2 className="text-foreground mb-2 text-lg font-semibold">מתי מתבצע הפינוי?</h2>
          <p>
            <strong className="text-foreground">במשלוח עד הבית</strong> — הפינוי מתבצע בדרך כלל בעת אספקת המוצר החדש,
            על ידי המוביל שמביא אותו. אין צורך לתאם ביקור נפרד.
          </p>
          <p className="mt-2">
            <strong className="text-foreground">בנקודת איסוף</strong> — המוצר החדש נמסר בנקודת איסוף של{" "}
            {DELIVERY_CARRIER} ולא בבית, ולכן מסירת המוצר הישן תתבצע בדרך חלופית בהתאם להסדר הפינוי של Buy Today.
            ניצור איתכם קשר לתיאום.
          </p>
          <p className="mt-2">
            <strong className="text-foreground">באיסוף עצמי</strong> — ניתן למסור בעת האיסוף מ{BUSINESS_ADDRESS} מוצר
            חשמלי או אלקטרוני ישן דומה למוצר שנרכש.
          </p>
        </section>

        <section>
          <h2 className="text-foreground mb-2 text-lg font-semibold">איך מבקשים פינוי?</h2>
          {REMOVAL_ORDERING_ENABLED ? (
            <>
              <p>
                בקופה, לפני התשלום, תוצג אפשרות פינוי לכל מוצר בהזמנה שזכאי לכך — לפי סוג המוצר עצמו. מסמנים את
                המוצרים שעבורם רוצים פינוי ומאשרים:
              </p>
              <p className="border-border bg-muted/40 text-foreground mt-2 rounded-lg border p-3">
                {REMOVAL_ACKNOWLEDGEMENT}
              </p>
              <p className="mt-2">
                בקשת הפינוי מופיעה באישור ההזמנה ובמייל שנשלח אליכם, יחד עם סוג המוצר לפינוי ועלותו.
              </p>
            </>
          ) : (
            /* The honest version while the carrier arrangement is being put
               in place. The right exists either way and this page says so; a
               checkbox that records a request nobody has agreed to collect
               would be the worse of the two answers, so the shop gives a
               phone number instead of a tick. */
            <p>
              לתיאום פינוי מוצר ישן יש ליצור איתנו קשר בטלפון{" "}
              <a href={BUSINESS.phoneHref} className="text-brand hover:underline">
                {BUSINESS.phone}
              </a>{" "}
              או בדוא&quot;ל{" "}
              <a href={`mailto:${BUSINESS.email}`} className="text-brand hover:underline">
                {BUSINESS.email}
              </a>
              , לפני האספקה או בסמוך להזמנה. הזכאות לפינוי אינה תלויה בכך.
            </p>
          )}
        </section>

        <section>
          <h2 className="text-foreground mb-2 text-lg font-semibold">יצירת קשר</h2>
          <p>{BUSINESS.name}</p>
          <p>{BUSINESS.legalName}</p>
          <p>ח.פ. {BUSINESS.companyId}</p>
          <p>{BUSINESS_ADDRESS}</p>
          <p className="mt-2">
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
        </section>

        <section>
          <p className="text-xs">
            במקרה של סתירה בין האמור בעמוד זה לבין הוראות הדין או הנוהל התקף — הוראות הדין והנוהל גוברות. ראו גם סעיף
            25 ב<Link href="/terms" className="text-brand hover:underline">תקנון</Link> ואת{" "}
            <Link href="/shipping" className="text-brand hover:underline">מדיניות המשלוחים</Link>.
          </p>
        </section>
      </div>
    </div>
  );
}
