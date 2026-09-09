import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";
import { DeleteAccountForm } from "@/components/account/delete-account-form";

export const metadata: Metadata = {
  title: "מחיקת החשבון",
  // Nothing here belongs in a search result, and the page is behind a login
  // anyway — this only stops it being indexed if the login ever slips.
  robots: { index: false, follow: false },
};

/**
 * Exists because App Store guideline 5.1.1(v) requires an account that can be
 * created in the app to be deletable in the app. Reviewers look for it in the
 * account area rather than in a help page, so it is a stop on the account
 * navigation and not a link buried in body text.
 *
 * The two lists below are the honest answer to "what happens to my data",
 * and they match what deleteAccountAction actually does — orders survive
 * because the shop is required to keep sales records, and they are detached
 * from the account with the customer's details copied onto them so an invoice
 * does not end up belonging to nobody.
 */
export default function DeleteAccountPage() {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">מחיקת החשבון</h1>
        {/* Same reason as the sidebar label: the reviewer landing here has to
            recognise the page without reading Hebrew. */}
        <p dir="ltr" className="text-muted-foreground text-sm">
          Delete account
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          הפעולה הזו סופית. אי אפשר לשחזר חשבון שנמחק.
        </p>
      </div>

      <div className="border-destructive/30 bg-destructive/5 flex gap-3 rounded-xl border p-4">
        <AlertTriangle className="text-destructive mt-0.5 size-5 shrink-0" aria-hidden />
        <div className="text-sm">
          <p className="font-medium">מה נמחק</p>
          <ul className="text-muted-foreground mt-1.5 list-disc space-y-1 ps-5">
            <li>פרטי ההתחברות — לא תוכלו להיכנס לחשבון יותר</li>
            <li>הכתובות השמורות</li>
            <li>רשימת המועדפים</li>
            <li>עגלת הקניות</li>
          </ul>
        </div>
      </div>

      <div className="border-border rounded-xl border p-4 text-sm">
        <p className="font-medium">מה נשמר</p>
        <p className="text-muted-foreground mt-1.5">
          הזמנות שכבר בוצעו נשמרות, מנותקות מהחשבון. חנות מחויבת לשמור תיעוד של מכירות גם אחרי
          שהחשבון נסגר, ולכן שם, אימייל וטלפון נשמרים על ההזמנות עצמן — כמו בהזמנה שבוצעה ללא
          חשבון.
        </p>
      </div>

      <DeleteAccountForm />
    </div>
  );
}
