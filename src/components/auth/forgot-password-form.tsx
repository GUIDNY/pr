"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forgotPasswordAction } from "@/actions/auth";
import { BUSINESS } from "@/lib/business";

/**
 * Asking for a reset link.
 *
 * The confirmation does not say whether the address is registered, and the
 * wording is chosen so it does not have to: "אם יש חשבון עם הכתובת הזאת".
 * A screen that answered honestly would let anybody test addresses against
 * this shop's customer list one at a time.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await forgotPasswordAction({ email });
      if (!result.success) {
        setError(result.error ?? "שגיאה בשליחה");
        return;
      }
      setSent(true);
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col px-4 py-10 sm:py-16">
      <div className="border-border bg-card rounded-2xl border p-6 shadow-sm sm:p-8">
        {sent ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="bg-brand/10 text-brand flex size-12 items-center justify-center rounded-full">
              <MailCheck className="size-6" />
            </span>
            <h1 className="text-xl font-black">בדקו את המייל</h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              אם יש חשבון עם הכתובת הזאת, שלחנו אליו קישור לבחירת סיסמה חדשה. הקישור תקף לשעה
              אחת.
            </p>
            <p className="text-muted-foreground text-sm">
              לא הגיע? כדאי לבדוק בספאם, או להתקשר{" "}
              <a href={BUSINESS.phoneHref} className="text-brand font-semibold hover:underline">
                {BUSINESS.phone}
              </a>
            </p>
            <Link href="/login" className="text-brand mt-2 text-sm font-bold hover:underline">
              חזרה להתחברות
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-6 text-center">
              <h1 className="text-2xl font-black tracking-tight">שכחתם סיסמה?</h1>
              <p className="text-muted-foreground mt-1.5 text-sm">
                נשלח קישור לבחירת סיסמה חדשה לכתובת המייל של החשבון.
              </p>
            </div>

            <form onSubmit={submit} className="flex flex-col gap-4">
              <div>
                <Label htmlFor="email" className="mb-1.5">
                  אימייל
                </Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  dir="ltr"
                  className="h-11 text-start"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              {error && (
                <p
                  role="alert"
                  className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border px-3 py-2 text-sm"
                >
                  {error}
                </p>
              )}

              <Button type="submit" variant="brand" size="lg" disabled={isPending} className="h-12 text-base font-bold">
                {isPending ? "שולח…" : "שליחת קישור"}
              </Button>
            </form>

            <div className="border-border mt-6 border-t pt-5 text-center">
              <Link href="/login" className="text-brand text-sm font-bold hover:underline">
                חזרה להתחברות
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
