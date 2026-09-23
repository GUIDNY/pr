import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { inspectResetToken } from "@/lib/password-reset";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata = { title: "בחירת סיסמה חדשה" };

const REASONS: Record<string, string> = {
  invalid: "הקישור אינו תקין. ייתכן שהועתק חלקית מהמייל.",
  expired: "הקישור פג תוקף. קישור לאיפוס סיסמה תקף לשעה אחת.",
  used: "כבר השתמשת בקישור הזה. כל קישור עובד פעם אחת בלבד.",
};

/**
 * The link's landing page.
 *
 * The token is checked here, before the form is drawn, so somebody holding
 * an expired link is told so immediately instead of typing a password twice
 * and being refused afterwards. Checked, not spent — the form still has to
 * submit it, and the write is what marks it used.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const outcome = token ? await inspectResetToken(token) : ({ ok: false, reason: "invalid" } as const);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col px-4 py-10 sm:py-16">
      <div className="border-border bg-card rounded-2xl border p-6 shadow-sm sm:p-8">
        {outcome.ok ? (
          <>
            <div className="mb-6 text-center">
              <h1 className="text-2xl font-black tracking-tight">בחירת סיסמה חדשה</h1>
              <p className="text-muted-foreground mt-1.5 text-sm">
                אחרי השמירה תיכנסו לחשבון אוטומטית.
              </p>
            </div>
            <ResetPasswordForm token={token!} />
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="bg-destructive/10 text-destructive flex size-12 items-center justify-center rounded-full">
              <AlertTriangle className="size-6" />
            </span>
            <h1 className="text-xl font-black">הקישור לא עובד</h1>
            <p className="text-muted-foreground text-sm leading-relaxed">{REASONS[outcome.reason]}</p>
            <Link
              href="/forgot-password"
              className="bg-brand text-brand-foreground mt-2 rounded-lg px-5 py-2.5 text-sm font-bold"
            >
              בקשת קישור חדש
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
