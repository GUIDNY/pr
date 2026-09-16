import type { Metadata } from "next";
import Link from "next/link";
import { RETURNS_POLICY_UPDATED_LABEL } from "@/lib/returns-policy";
import { BUSINESS } from "@/lib/business";

/* מדיניות ביטול והחזרות.
   
   העמוד הזה הוא תנאי סף של Google Merchant Center: בלעדיו אף מוצר בפיד לא
   מאושר. שלוש דרישות שלה חייבות להתקיים, וכל אחת מהן נשברת בקלות בלי לשים לב:

   1. הדף נגיש בלי התחברות, בלי הרשמה ובלי הזנת פרטים. לכן הוא סטטי לגמרי —
      שום קריאה לסשן, שום עוגייה, שום searchParams. ברגע שמשהו כאן יקרא את
      המבקר, Next יגיש אותו private/no-store והוא יפסיק להיות דף ציבורי
      שאפשר לשמור בקאש.
   2. קישור אליו מהפוטר של כל עמוד, בטקסט "מדיניות ביטול והחזרות".
   3. הנוסח כאן זהה מילה במילה לנוסח שהוזן ב-Merchant Center. גוגל משווה
      ביניהם, ולכן אין לשכתב "קצת יותר יפה" בלי לעדכן גם שם. */

export const metadata: Metadata = {
  title: "מדיניות ביטול והחזרות",
  description:
    "מדיניות ביטול עסקה, החזרות והחזרים של Buy Today — 14 ימים לביטול, דמי ביטול, איסוף מוצרים גדולים מהבית והחזר כספי תוך 14 ימים, לפי חוק הגנת הצרכן.",
  alternates: { canonical: "/returns" },
};

export default function ReturnsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-2 text-3xl font-bold">מדיניות ביטול עסקה, החזרות והחזרים</h1>
      <p className="text-muted-foreground mb-8 text-sm">עודכנה לאחרונה: {RETURNS_POLICY_UPDATED_LABEL}</p>

      <div className="text-muted-foreground flex flex-col gap-8 text-sm leading-relaxed">
        <section>
          <h2 className="text-foreground mb-2 text-lg font-semibold">ביטול עסקה והחזרת מוצר</h2>
          <p>
            ניתן לבטל עסקה שבוצעה באתר בתוך 14 ימים ממועד קבלת המוצר או ממועד קבלת המסמך המכיל את פרטי העסקה, לפי
            המאוחר מביניהם.
          </p>
          <p className="mt-2">
            זכות הביטול חלה גם על מוצר תקין — לא רק על מוצר פגום — ואין צורך לנמק.
          </p>
        </section>

        <section>
          <h2 className="text-foreground mb-2 text-lg font-semibold">איך מבטלים</h2>
          <ul className="flex list-inside list-disc flex-col gap-1">
            <li>
              בטלפון:{" "}
              <a href={BUSINESS.phoneHref} className="text-brand hover:underline">
                {BUSINESS.phone}
              </a>
            </li>
            <li>
              בדוא&quot;ל:{" "}
              <a href={`mailto:${BUSINESS.email}`} className="text-brand hover:underline">
                {BUSINESS.email}
              </a>
            </li>
            <li>
              או באמצעות{" "}
              <Link href="/contact" className="text-brand hover:underline">
                טופס יצירת הקשר באתר
              </Link>
              .
            </li>
          </ul>
          <p className="mt-2">בפנייה יש לציין שם מלא, מספר הזמנה ופרטי המוצר.</p>
          {/* The extended window. It was on the CMS copy of this policy and
              not on this one, and it is not a detail: it is a statutory
              right with a term eight times longer than the general one, and
              a shop that does not state it is the shop that refuses it at
              the counter. */}
          <p className="mt-2">
            אדם עם מוגבלות, אזרח ותיק או עולה חדש רשאי לבטל עסקה בתוך ארבעה חודשים ממועד ההזמנה, ובלבד
            שההתקשרות בעסקה כללה שיחה בין הצדדים, לרבות שיחה אלקטרונית.
          </p>
        </section>

        <section>
          <h2 className="text-foreground mb-2 text-lg font-semibold">דמי ביטול</h2>
          <p>
            בביטול עסקה של מוצר תקין ייגבו דמי ביטול בשיעור של 5% ממחיר המוצר או 100 ש&quot;ח, לפי הנמוך מביניהם.
          </p>
          <p className="mt-2">
            בביטול עקב פגם במוצר, אי-התאמה בין המוצר לפרטי העסקה, או אי-אספקה במועד שנקבע — לא ייגבו דמי ביטול כלל,
            והמוצר ייאסף על חשבוננו.
          </p>
        </section>

        <section>
          <h2 className="text-foreground mb-2 text-lg font-semibold">החזרת המוצר</h2>
          <p>מוצרי חשמל גדולים שסופקו לבית הלקוח ייאספו על ידינו מהכתובת שאליה סופקו.</p>
          <p className="mt-2">מוצרים קטנים ניתן להחזיר בסניף או לשלוח אלינו.</p>
          <p className="mt-2">
            יש להחזיר את המוצר עם אריזתו המקורית ככל שניתן. ניתן להחזיר גם מוצר שנפתח או שנעשה בו שימוש סביר.
          </p>
        </section>

        <section>
          <h2 className="text-foreground mb-2 text-lg font-semibold">החזר כספי</h2>
          <p>
            הכסף יוחזר בתוך 14 ימים ממועד קבלת הודעת הביטול, באמצעי התשלום שבו בוצעה הרכישה.
          </p>
        </section>

        <section>
          <h2 className="text-foreground mb-2 text-lg font-semibold">החלפות</h2>
          <p>ניתן להחליף מוצר באותם תנאים ובאותה תקופת זמן.</p>
        </section>

        {/* Also carried only by the CMS copy. Worth stating plainly, because
            the common reading of a cancellation policy is that it replaces
            the warranty — it sits alongside it, and for an appliance the
            warranty is the longer of the two by years. */}
        <section>
          <h2 className="text-foreground mb-2 text-lg font-semibold">אחריות היצרן</h2>
          <p>
            מדיניות זו אינה גורעת מזכויות הלקוח מכוח תעודת האחריות של היבואן, החלה בנוסף לזכות הביטול
            ולתקופה הנקובה בה.
          </p>
        </section>

        <section>
          <h2 className="text-foreground mb-2 text-lg font-semibold">מקרים שבהם לא ניתן לבטל</h2>
          <p>
            בהתאם לחוק, לא ניתן לבטל עסקה לגבי: מוצרים שיוצרו במיוחד עבור הלקוח לפי מידות או דרישות מיוחדות; מוצרים
            הניתנים להקלטה, לשעתוק או לשכפול שהלקוח פתח את אריזתם המקורית.
          </p>
        </section>

        <section>
          <p>מדיניות זו מבוססת על חוק הגנת הצרכן, התשמ&quot;א-1981 ותקנותיו.</p>
          <p className="mt-2">אין באמור כדי לגרוע מזכויות הלקוח על פי כל דין.</p>
          {/* Who the customer is actually contracting with. Merchant Center
              reads this page before approving products and looks for a named
              merchant on it; a policy that never says whose policy it is
              also reads, to a customer, like one nobody has to honour. */}
          <p className="text-muted-foreground mt-4 text-sm">
            {BUSINESS.legalName} · ח.פ {BUSINESS.companyId} · {BUSINESS.street}, {BUSINESS.city}
          </p>
        </section>
      </div>
    </div>
  );
}
