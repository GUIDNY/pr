export const metadata = { title: "הצהרת נגישות" };

export default function AccessibilityPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-6 text-3xl font-bold">הצהרת נגישות</h1>
      <div className="text-muted-foreground flex flex-col gap-4 text-sm leading-relaxed">
        <p>
          אתר A&I Electronics פועל לשיפור מתמיד של הנגישות עבור אנשים עם מוגבלות, מתוך אמונה כי לכל אדם מגיעה הזכות לגלוש
          באתר בנוחות, ללא תלות ביכולותיו.
        </p>
        <p>באתר יושמו, בין היתר, ההתאמות הבאות:</p>
        <ul className="list-inside list-disc space-y-1">
          <li>ניווט מלא באמצעות מקלדת בכל רחבי האתר</li>
          <li>תמיכה בטכנולוגיות קוראות מסך</li>
          <li>ניגודיות צבעים העומדת בתקן WCAG 2.2 ברמה AA</li>
          <li>אפשרות להגדלת/הקטנת גופן</li>
          <li>כיבוד הגדרת &quot;הפחתת תנועה&quot; של מערכת ההפעלה</li>
          <li>מבנה סמנטי, כותרות היררכיות ותוויות לטפסים</li>
        </ul>
        <p>
          חווית הגלישה באתר בנויה כראשית עבור השפה העברית (RTL), כולל התאמת חצים, כיוון טפסים וסדר קריאה.
        </p>
        <p>
          למרות מאמצינו להנגיש את כלל דפי האתר, ייתכן ויתגלו חלקים שטרם הונגשו במלואם. נשמח לקבל פניות בנושא
          נגישות בטלפון 04-6639510 או דרך עמוד{" "}
          <a href="/contact" className="text-brand hover:underline">
            צור קשר
          </a>
          , ונפעל לטיפול בהקדם.
        </p>
      </div>
    </div>
  );
}
