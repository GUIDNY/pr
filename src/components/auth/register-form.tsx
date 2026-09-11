"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useIsNativeApp } from "@/lib/native-app";
import { GoogleButton } from "@/components/auth/google-button";
import { AppleButton } from "@/components/auth/apple-button";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerAction } from "@/actions/auth";

export function RegisterForm({ googleEnabled, appleEnabled }: { googleEnabled: boolean; appleEnabled: boolean }) {
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
  const router = useRouter();
  /* Handed over by the confirmation page, so a guest who just ordered is asked
     for a password and nothing they have already typed. Only ever prefills
     fields the customer can see and correct before submitting. */
  const searchParams = useSearchParams();
  const [form, setForm] = useState({
    name: searchParams.get("name") ?? "",
    email: searchParams.get("email") ?? "",
    phone: searchParams.get("phone") ?? "",
    password: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await registerAction(form);
      if (!result.success) {
        setError(result.error ?? "שגיאה בהרשמה");
        return;
      }
      toast.success("החשבון נוצר בהצלחה");
      router.push("/account");
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <div className="mb-6 text-center">
        <span className="bg-brand/10 text-brand mx-auto mb-3 flex size-12 items-center justify-center rounded-full">
          <UserPlus className="size-5" />
        </span>
        <h1 className="text-2xl font-bold">יצירת חשבון</h1>
      </div>

      {(showGoogle || appleEnabled) && (
        <>
          <div className="flex flex-col gap-2.5">
            {showGoogle && <GoogleButton />}
            {appleEnabled && <AppleButton />}
          </div>
          <div className="my-5 flex items-center gap-3">
            <span className="bg-border h-px flex-1" />
            <span className="text-muted-foreground text-xs font-medium">או עם סיסמה</span>
            <span className="bg-border h-px flex-1" />
          </div>
        </>
      )}

      <form onSubmit={submit} className="flex flex-col gap-3">
        <div>
          <Label className="mb-1.5">שם מלא</Label>
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required autoFocus />
        </div>
        <div>
          <Label className="mb-1.5">אימייל</Label>
          <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
        </div>
        <div>
          <Label className="mb-1.5">טלפון</Label>
          <Input type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} required />
        </div>
        <div>
          <Label className="mb-1.5">סיסמה</Label>
          <Input
            type="password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            required
            minLength={6}
          />
        </div>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <Button type="submit" variant="brand" size="lg" disabled={isPending} className="mt-2">
          {isPending ? "יוצר חשבון..." : "הרשמה"}
        </Button>
        <p className="text-muted-foreground text-xs leading-relaxed">
          מסירת הפרטים אינה חובה חוקית והיא נעשית מרצונכם. הם ישמשו לניהול החשבון ולמתן השירות בלבד, בהתאם ל
          <Link href="/privacy" className="hover:text-foreground underline">
            מדיניות הפרטיות
          </Link>{" "}
          ול
          <Link href="/page/terms" className="hover:text-foreground underline">
            תקנון האתר
          </Link>
          .
        </p>
      </form>

      <p className="text-muted-foreground mt-6 text-center text-sm">
        כבר יש לכם חשבון?{" "}
        <Link href="/login" className="text-brand font-medium hover:underline">
          התחברות
        </Link>
      </p>
    </div>
  );
}
