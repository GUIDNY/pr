"use client";

import { Suspense, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Eye, EyeOff, Phone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction } from "@/actions/auth";
import { isBackOffice, backOfficeHome } from "@/lib/permissions";
import { BUSINESS } from "@/lib/business";

/**
 * Signing in.
 *
 * The block of demo credentials that used to sit under this form is gone,
 * and it was not a styling problem: it published a working administrator
 * email and password, in plain text, to every visitor of a live shop.
 *
 * The rest is tightened rather than rethought. A sign-in form is a place
 * people want to leave quickly, so it is one column, the fields are large
 * enough to hit on a phone, and nothing sits between the password and the
 * button. The logo is there because this page is also reached from an email
 * link, where "which shop is this" is a real question.
 *
 * There is no "forgot password" link, because there is no password reset in
 * this application. A link to a route that does not exist is worse than its
 * absence — the phone number underneath is the honest answer, and it reaches
 * somebody who can actually help.
 */
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? "/account";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await loginAction({ email, password });
      if (!result.success) {
        setError(result.error ?? "שגיאה בהתחברות");
        return;
      }
      toast.success("התחברת בהצלחה");
      router.push(isBackOffice(result.role) ? backOfficeHome(result.role) : redirectTo);
      router.refresh();
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col px-4 py-10 sm:py-16">
      <div className="border-border bg-card rounded-2xl border p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <Image
            src="/brand/logo.png"
            alt="Buy Today"
            width={512}
            height={512}
            className="mb-4 size-12 rounded-[22%]"
          />
          <h1 className="text-2xl font-black tracking-tight">התחברות לחשבון</h1>
          <p className="text-muted-foreground mt-1.5 text-sm">
            כדי לראות את ההזמנות, הכתובות והמוצרים ששמרתם
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
              inputMode="email"
              autoComplete="email"
              dir="ltr"
              className="h-11 text-start"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div>
            <Label htmlFor="password" className="mb-1.5">
              סיסמה
            </Label>
            {/* The reveal toggle is not a nicety on a phone keyboard: a
                mistyped password that cannot be seen is the most common
                reason somebody gives up here. */}
            {/* dir on the wrapper, not only on the input, and that is the
                whole bug that was here: `pe-11` on an input marked ltr
                reserves space on its right, while `end-0` on a button inside
                an rtl parent puts it on the left. Padding one side, button
                the other, so the eye sat on top of the password. Both sit in
                the same direction now, which is also where a reveal control
                belongs on a latin field — the trailing end. */}
            <div dir="ltr" className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                dir="ltr"
                className="h-11 pe-11 text-start"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "הסתרת הסיסמה" : "הצגת הסיסמה"}
                className="text-muted-foreground hover:text-foreground absolute end-0 top-0 flex h-11 w-11 items-center justify-center"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
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
            {isPending ? "מתחבר…" : "התחברות"}
          </Button>
        </form>

        <div className="border-border mt-6 border-t pt-5 text-center">
          <p className="text-sm">
            <span className="text-muted-foreground">אין לכם חשבון? </span>
            <Link href="/register" className="text-brand font-bold hover:underline">
              הרשמה
            </Link>
          </p>
        </div>
      </div>

      {/* No password reset exists in this application, so this is what a
          locked-out customer actually has. */}
      <p className="text-muted-foreground mt-5 text-center text-sm">
        נתקעתם?{" "}
        <a href={BUSINESS.phoneHref} className="text-brand font-semibold hover:underline">
          <Phone className="ms-1 inline size-3.5" />
          {BUSINESS.phone}
        </a>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
