import type { Metadata } from "next";
import Link from "next/link";
import { BUSINESS } from "@/lib/business";
import { EXTENSION_PRIVACY_UPDATED_AT } from "@/lib/content/privacy-extension";

/**
 * The browser extension's privacy policy, at its own address.
 *
 * The Chrome Web Store requires a policy URL for an extension that reads the
 * page you are on, and a reviewer reads whichever URL the listing names.
 * /privacy is the *website's* policy: it describes this shop's forms, its
 * cookies and its database, and says nothing about a program running in
 * somebody else's tab. Pointing the listing there would be a policy that
 * does not describe the thing under review.
 *
 * Three of the claims below are about this repository rather than about the
 * extension, and they are true because of two files:
 *
 *   - **The price, and the address of the page you are on, never leave the
 *     browser.** The only server the extension talks to is
 *     /api/price-compare, and it reads `q` and `limit` and nothing else —
 *     there is nowhere to put them.
 *   - **Nothing on the server ties a visitor to the pages they browsed.**
 *     `api/` is excluded by proxy.ts's own matcher and again by
 *     SKIP_PREFIXES in lib/pageview/capture.ts, so a lookup is not written
 *     to the first-party path log and is not even issued a bt_sid cookie.
 *   - **A lookup is an ordinary search.** The route holds no session, sets
 *     no cookie and writes no row.
 *
 * All three stop being true quietly — one parameter added to the endpoint
 * while debugging, one log that starts covering /api — so
 * `npm run check:extension-privacy` asserts them rather than trusting the
 * next person to read this. And the date at the top of the page moves
 * whenever the extension's behaviour does, the same rule /privacy states
 * for itself.
 */

export const metadata: Metadata = {
  title: "מדיניות פרטיות — תוסף השוואת המחירים",
  description:
    "מה תוסף הדפדפן של Buy Today קורא מהדף, מה נשלח לאתר ומה נשאר במחשב שלכם, מה נשמר ולכמה זמן, אילו הרשאות נדרשות וכיצד מכבים אותו.",
  alternates: { canonical: "/privacy-extension" },
};

export default function ExtensionPrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-2 text-3xl font-bold">מדיניות פרטיות — תוסף Buy Today להשוואת מחירים</h1>
      <p className="text-muted-foreground mb-8 text-sm">עודכן לאחרונה: {EXTENSION_PRIVACY_UPDATED_AT}</p>

      <div className="text-muted-foreground flex flex-col gap-8 text-sm leading-relaxed">
        <section>
          <p className="mb-4">
            המסמך הזה מתאר אילו נתונים תוסף הדפדפן <strong className="text-foreground">Buy Today – השוואת מחירים</strong>{" "}
            קורא, לאן הם נשלחים ומה לא נעשה בהם. התוסף מופעל על ידי Buy Today, המפעילה את האתר{" "}
            <Link href="/" className="text-brand hover:underline">
              buytoday.co.il
            </Link>
            .
          </p>
          {/* The summary first and in a box, because it is the paragraph a
              reviewer and a shopper both actually read. */}
          <p className="border-border bg-muted/40 text-foreground rounded-lg border p-4">
            <strong>בשורה אחת:</strong> התוסף קורא שם מוצר ומחיר מהדף שאתם נמצאים בו, שולח את שם המוצר לחיפוש באתר
            Buy Today, ומציג את התוצאה. אין איסוף מידע אישי, אין חשבון משתמש, אין פרסום, ואין מכירת נתונים לצד שלישי.
          </p>
        </section>

        <section>
          <h2 className="text-foreground mb-2 text-lg font-semibold">אילו נתונים התוסף קורא</h2>
          <p className="mb-2">
            כשאתם נמצאים בדף שהתוסף מזהה כדף מוצר, הוא קורא מתוך הדף שלושה פרטים בלבד:
          </p>
          <ul className="list-inside list-disc space-y-1">
            <li>
              <strong className="text-foreground">שם המוצר</strong> — מהנתונים המובנים של הדף (JSON-LD / Microdata /
              Open Graph) או מכותרת הדף.
            </li>
            <li>
              <strong className="text-foreground">מחיר המוצר</strong> — מאותם מקורות.
            </li>
            <li>
              <strong className="text-foreground">כתובת הדף (Domain)</strong> — רק כדי לדעת שאין להפעיל את התוסף באתר
              Buy Today עצמו ובאתרים שהוחרגו.
            </li>
          </ul>
          <p className="mt-3">
            התוסף אינו קורא טפסים, שדות תשלום, פרטי התחברות, עוגיות, היסטוריית גלישה, תוכן דוא&quot;ל או כל תוכן אחר
            בדף.
          </p>
        </section>

        <section>
          <h2 className="text-foreground mb-2 text-lg font-semibold">לאן הנתונים נשלחים</h2>
          <p className="mb-2">
            שם המוצר נשלח כשאילתת חיפוש אל buytoday.co.il בלבד — בדיוק כפי שהיה נשלח אם הייתם מקלידים את שם המוצר
            בתיבת החיפוש באתר. המחיר שנקרא מהדף נשאר בדפדפן שלכם ואינו נשלח לשום מקום; הוא משמש רק להשוואה מקומית.
          </p>
          <p>
            לא מועברים נתונים לשרתי פרסום, לרשתות מדידה, או לכל צד שלישי אחר. אין Google Analytics, אין פיקסלים ואין
            מזהי משתמש בתוסף.
          </p>
        </section>

        <section>
          <h2 className="text-foreground mb-2 text-lg font-semibold">מה נשמר, ולכמה זמן</h2>
          <ul className="list-inside list-disc space-y-1">
            <li>
              <strong className="text-foreground">בזיכרון המקומי של הדפדפן</strong> (
              <code dir="ltr" className="font-mono text-xs">
                chrome.storage.local
              </code>
              ) — שתי העדפות בלבד: האם התוסף פעיל, והאם להציג הצעת מוצר דומה. אלה אינן יוצאות מהמחשב שלכם.
            </li>
            <li>
              <strong className="text-foreground">מטמון זמני בזיכרון</strong> — תוצאות חיפוש נשמרות עד 30 דקות כדי לא
              לחזור על אותה בקשה, ונמחקות כשהדפדפן נסגר.
            </li>
            <li>
              <strong className="text-foreground">סימון סגירה</strong> — אם סגרתם את ההודעה על מוצר מסוים, הסימון
              נשמר ב־
              <code dir="ltr" className="font-mono text-xs">
                sessionStorage
              </code>{" "}
              של אותו טאב ונמחק בסגירתו.
            </li>
          </ul>
          <p className="mt-3">
            Buy Today אינה שומרת בצד השרת רשומה הקושרת בין משתמש לבין הדפים שבהם גלש. בקשות החיפוש מגיעות לשרת כבקשות
            חיפוש רגילות, ללא מזהה משתמש.
          </p>
        </section>

        <section>
          <h2 className="text-foreground mb-2 text-lg font-semibold">הרשאות, ולמה הן נדרשות</h2>
          <ul className="list-inside list-disc space-y-1">
            <li>
              <strong className="text-foreground">גישה לאתרים שאתם מבקרים בהם</strong> — כדי לזהות שאתם בדף מוצר
              ולקרוא ממנו שם ומחיר. בלי זה אין מה להשוות. התוסף פועל רק בדפים שבהם זוהה מוצר, ונשאר שקט בכל דף אחר.
            </li>
            <li>
              <strong className="text-foreground">גישה ל־buytoday.co.il</strong> — כדי לבצע את החיפוש בקטלוג.
            </li>
            <li>
              <strong className="text-foreground">
                <code dir="ltr" className="font-mono text-xs">
                  storage
                </code>
              </strong>{" "}
              — כדי לזכור את שתי ההעדפות שבפופ-אפ.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-foreground mb-2 text-lg font-semibold">מי עוד רואה את המידע</h2>
          <p>
            אף אחד. התוסף אינו מוכר, משכיר, מעביר או חולק נתונים עם צדדים שלישיים, ואינו משתמש בנתונים לצרכים שאינם
            הצגת ההשוואה עצמה — לא לפרסום, לא לדירוג אשראי, ולא לאימון מודלים.
          </p>
        </section>

        <section>
          <h2 className="text-foreground mb-2 text-lg font-semibold">איך מפסיקים</h2>
          <p>
            אפשר לכבות את התוסף בכל רגע בלחיצה על הסמל שלו ובהסרת הסימון &quot;התוסף פעיל&quot;, או להסיר אותו לגמרי
            מ־
            <code dir="ltr" className="font-mono text-xs">
              chrome://extensions
            </code>
            . הסרה מוחקת גם את ההעדפות השמורות.
          </p>
        </section>

        <section>
          <h2 className="text-foreground mb-2 text-lg font-semibold">ילדים</h2>
          <p>התוסף אינו מכוון לילדים מתחת לגיל 13 ואינו אוסף מהם מידע ביודעין.</p>
        </section>

        <section>
          <h2 className="text-foreground mb-2 text-lg font-semibold">שינויים במדיניות</h2>
          <p>
            אם מדיניות זו תתעדכן, התאריך בראש העמוד ישתנה. שינוי מהותי באופן הטיפול בנתונים ילווה בעדכון גרסה של
            התוסף.
          </p>
        </section>

        <section>
          <h2 className="text-foreground mb-2 text-lg font-semibold">יצירת קשר</h2>
          <p className="mb-2">
            שאלות או בקשות בנושא פרטיות:{" "}
            <a href={`mailto:${BUSINESS.email}`} className="text-brand hover:underline">
              {BUSINESS.email}
            </a>
            .
          </p>
          {/* Two documents, two subjects. A reader who arrived here from the
              Web Store listing is one click from the shop itself, and the
              policy that covers the shop is not this one. */}
          <p>
            מדיניות זו חלה על התוסף בלבד. מדיניות הפרטיות של אתר buytoday.co.il עצמו — הפרטים שנאספים באתר, העוגיות
            שבו וזכות העיון, התיקון והמחיקה — נמצאת בעמוד{" "}
            <Link href="/privacy" className="text-brand hover:underline">
              מדיניות פרטיות
            </Link>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
