import { requireAdmin } from "@/lib/auth";
import { SpecImport } from "@/components/admin/spec-import";

export const metadata = { title: "ייבוא מפרטים | Buy Today Admin" };

/**
 * Where a spec hand-off is applied. See components/admin/spec-import.tsx
 * and actions/admin-spec-import.ts for the rules; this page only holds
 * the words an admin reads before pressing anything.
 */
export default async function ImportSpecsPage() {
  await requireAdmin();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">ייבוא מפרטים</h1>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
          קובץ <code>spec-attributes.json</code> שנבנה מייצוא הקטלוג. הייבוא מחליף את כל שורות המפרט של כל
          מוצר שמופיע בקובץ בשורות שבקובץ — לא ממזג. קודם בדיקה: היא מחשבת בדיוק מה ייכתב ולא כותבת כלום.
          ההחלפה עצמה נפתחת רק אחרי בדיקה, ורק עם אישור.
        </p>
      </div>
      <SpecImport />
    </div>
  );
}
