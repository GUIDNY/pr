"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Eye, EyeOff, Phone } from "lucide-react";
import { useIsNativeApp } from "@/lib/native-app";
import { GoogleButton } from "@/components/auth/google-button";
import { AppleNativeButton, useAppleNativeAvailable } from "@/components/auth/apple-native-button";
import { AppleButton } from "@/components/auth/apple-button";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction } from "@/actions/auth";
import { isBackOffice, backOfficeHome } from "@/lib/permissions";
import { BUSINESS } from "@/lib/business";

/* What the social sign-in routes can bounce back with. Each says what
   happened and what to do about it — "שגיאה" on its own leaves somebody
   pressing the same button again. */
const SOCIAL_ERRORS: Record<string, string> = {
  google_unavailable: "התחברות עם Google עדיין לא זמינה כאן.",
  google_cancelled: "ההתחברות עם Google בוטלה.",
  google_state: "ההתחברות עם Google פגה. אפשר לנסות שוב.",
  google_code: "ההתחברות עם Google לא הושלמה. אפשר לנסות שוב.",
  google_exchange: "לא הצלחנו לאמת את החשבון מול Google. אפשר לנסות שוב או להתחבר עם סיסמה.",
  google_unverified: "כתובת המייל בחשבון ה-Google הזה לא אומתה על ידי Google, ולכן אי אפשר להתחבר איתה.",
  apple_unavailable: "התחברות עם Apple עדיין לא זמינה כאן.",
  apple_cancelled: "ההתחברות עם Apple בוטלה.",
  apple_state: "ההתחברות עם Apple פגה. אפשר לנסות שוב.",
  apple_code: "ההתחברות עם Apple לא הושלמה. אפשר לנסות שוב.",
  apple_nonce: "ההתחברות עם Apple לא אומתה. אפשר לנסות שוב.",
  apple_exchange: "לא הצלחנו לאמת את החשבון מול Apple. אפשר לנסות שוב או להתחבר עם סיסמה.",
  apple_unverified: "כתובת המייל בחשבון ה-Apple הזה לא אומתה, ולכן אי אפשר להתחבר איתה.",
};

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
 * The "שכחתם סיסמה?" link is real now — see lib/password-reset.ts. The shop
 * phone stays underneath it anyway, because a reset that goes to an address
 * somebody has lost access to helps nobody.
 */
export function LoginForm({ googleEnabled, appleEnabled, appleNativeEnabled }: { googleEnabled: boolean; appleEnabled: boolean; appleNativeEnabled: boolean }) {
  /* Google refuses OAuth from an embedded WebView — their documented
     "disallowed_useragent" policy — and a top-level navigation to
     accounts.google.com leaves the app for Safari, where the session cookie
     lands in the wrong browser: the customer signs in and returns to an app
     that still shows them signed out. Confirmed on a TestFlight build.

     So the button is not offered in the app at all. Email, phone and Apple
     all work there, and a missing option beats one that cannot work.

     Nothing changes in a browser. Fixing it properly means opening the flow
     in the system browser and returning through a Universal Link — a native
     plugin and App Links, not a login page change. */
  const inApp = useIsNativeApp();
  const showGoogle = googleEnabled && !inApp;
  /* Apple is hidden in the app for a narrower reason, and only until the next
     build. Its flow leaves for appleid.apple.com and form_posts back, and the
     build currently under review does not list that host in allowNavigation —
     so the whole exchange is handed to Safari and the session cookie is set in
     a browser the app cannot see, exactly as Google's was. The host is listed
     in capacitor.config.ts now, which fixes it, but a config change only
     reaches a device through a new build while this file reaches it on the
     next page load. Flip this back once a build carrying that config ships. */
  /* The app gets the native sheet, the web keeps the redirect. Same provider,
     two buttons, because only one of them can work in each place. */
  const showApple = appleEnabled && !inApp;
  /* And only when the running build carries the plugin. Being in the app is
     not enough: this page reaches every install at once, the plugin only the
     ones built since it was added. */
  const appleNativeReady = useAppleNativeAvailable();
  const showAppleNative = appleNativeEnabled && inApp && appleNativeReady;
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? "/account";
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(SOCIAL_ERRORS[searchParams.get("error") ?? ""] ?? null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await loginAction({ identifier, password });
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
אפשר להתחבר עם כתובת המייל או עם מספר הטלפון
          </p>
        </div>

        {(showGoogle || showApple || showAppleNative) && (
          <>
            <div className="flex flex-col gap-2.5">
              {showGoogle && <GoogleButton />}
              {showApple && <AppleButton />}
              {showAppleNative && <AppleNativeButton />}
            </div>
            {/* A real separator rather than the word "or" floating between
                two stacks — the rule is what tells you these are two ways to
                do one thing, not two steps. */}
            <div className="my-5 flex items-center gap-3">
              <span className="bg-border h-px flex-1" />
              <span className="text-muted-foreground text-xs font-medium">או עם סיסמה</span>
              <span className="bg-border h-px flex-1" />
            </div>
          </>
        )}

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="identifier" className="mb-1.5">
              אימייל או טלפון
            </Label>
            {/* type="text", not "email": the browser would reject a phone
                number before the form was ever submitted. */}
            <Input
              id="identifier"
              type="text"
              autoComplete="username"
              dir="ltr"
              className="h-11 text-start"
              placeholder="you@example.com או 050-0000000"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
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

        <div className="border-border mt-6 flex flex-col gap-3 border-t pt-5 text-center">
          <Link href="/forgot-password" className="text-muted-foreground text-sm hover:underline">
            שכחתם סיסמה?
          </Link>
          <p className="text-sm">
            <span className="text-muted-foreground">אין לכם חשבון? </span>
            <Link href="/register" className="text-brand font-bold hover:underline">
              הרשמה
            </Link>
          </p>
        </div>
      </div>

      {/* Still here alongside the reset link: somebody who has lost the
          mailbox as well as the password has nothing a form can give them. */}
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

