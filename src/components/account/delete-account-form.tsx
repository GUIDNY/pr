"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useIsNativeApp } from "@/lib/native-app";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteAccountAction } from "@/actions/auth";

/**
 * Two steps on purpose. The first click only reveals the confirmation, so the
 * button that actually deletes the account can never be the button a thumb
 * lands on by accident while scrolling the account page.
 *
 * What the second step asks for depends on what the account has. An account
 * with a password is asked for it. An account opened through Apple or Google
 * has none — the bytes standing in for one match nothing anybody can type —
 * and was told "wrong password" every time for a month, which made those the
 * only accounts in the shop that could not be closed. They are asked to sign
 * in with the provider again instead, and that is the point: being signed in
 * is a thirty-day cookie, and this is the one action with nothing to undo it.
 *
 * `hasPassword` is decided on the server and passed in, and the server checks
 * it again — this prop chooses what to draw, never what is accepted.
 */
export function DeleteAccountForm({ hasPassword }: { hasPassword: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inApp = useIsNativeApp();
  /* The provider callback sends them back here with this. The proof itself is
     an httpOnly cookie the server minted and this page cannot read; the query
     only says a round trip happened, so the form can open at the right step
     rather than making somebody press "delete" a second time. A forged one
     buys nothing — deleteAccountAction asks the cookie, not the URL. */
  const reauthed = searchParams.get("reauth") === "ok";

  const [armed, setArmed] = useState(reauthed);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await deleteAccountAction(hasPassword ? { password } : {});
      if (!result.success) {
        setError(result.error ?? "מחיקת החשבון נכשלה");
        return;
      }
      toast.success("החשבון נמחק");
      // The session cookie is already cleared on the server; refresh so the
      // header and the cart stop showing a customer who no longer exists.
      router.push("/");
      router.refresh();
    });
  }

  if (!armed) {
    return (
      <Button variant="destructive" onClick={() => setArmed(true)}>
        <Trash2 />
        מחיקת החשבון
        <span dir="ltr" className="opacity-70">(Delete account)</span>
      </Button>
    );
  }

  const cancel = (
    <Button
      type="button"
      variant="ghost"
      onClick={() => {
        setArmed(false);
        setPassword("");
        setError(null);
      }}
      disabled={isPending}
    >
      ביטול
    </Button>
  );

  if (!hasPassword && !reauthed) {
    return (
      <div className="flex flex-col gap-3">
        <div>
          <p className="font-medium">אימות לפני המחיקה</p>
          <p className="text-muted-foreground mt-1 text-sm">
            החשבון הזה נפתח דרך Apple או Google ואין לו סיסמה. כדי לוודא שזה באמת אתם ולא מישהו
            שמחזיק את המכשיר, התחברו שוב עם אותו שירות. האימות תקף לחמש דקות.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline">
            <a href="/api/auth/apple?purpose=reauth&redirect=/account/delete">אימות עם Apple</a>
          </Button>
          {/* Google refuses OAuth inside an embedded WebView as a matter of
              policy, so in the app this link can only end in their
              "disallowed_useragent" page. Apple's does work here — its host
              is listed in allowNavigation, so the exchange stays inside the
              app — which is why only one of the two is hidden. */}
          {!inApp && (
            <Button asChild variant="outline">
              <a href="/api/auth/google?purpose=reauth&redirect=/account/delete">אימות עם Google</a>
            </Button>
          )}
          {cancel}
        </div>

        {inApp && (
          <p className="text-muted-foreground text-sm">
            נרשמתם דרך Google? את המחיקה צריך לעשות מהאתר בדפדפן — Google לא מאפשרת התחברות מתוך
            אפליקציה.
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {hasPassword ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="delete-password">הזינו את הסיסמה כדי לאשר</Label>
          <Input
            id="delete-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoFocus
            className="max-w-sm"
          />
        </div>
      ) : (
        <p className="text-sm">
          האימות התקבל. המחיקה סופית ואי אפשר לשחזר אותה.
        </p>
      )}

      {error && <p className="text-destructive text-sm">{error}</p>}

      <div className="flex items-center gap-2">
        <Button type="submit" variant="destructive" disabled={isPending || (hasPassword && !password)}>
          <Trash2 />
          {isPending ? "מוחק…" : "מחיקה סופית"}
        </Button>
        {cancel}
      </div>
    </form>
  );
}
