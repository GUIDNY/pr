import { Suspense } from "react";
import { Gift } from "lucide-react";
import { REFERRAL_FRIEND_PERCENT } from "@/lib/referral-rules";
import { RegisterForm } from "@/components/auth/register-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { googleOAuthConfigured, googleNativeConfigured } from "@/lib/google-oauth";
import { appleOAuthConfigured, appleNativeConfigured } from "@/lib/apple-oauth";

/* Rendered per request, not baked at build time.
 *
 * This page has no dynamic data in it, so Next prerenders it — and that
 * freezes the answer to "is Google configured" into the HTML at the moment
 * of the build. The credentials were added to Vercel after the build that
 * prerendered this page, so the route handler (always dynamic) redirected to
 * Google correctly while the page it was linked from had no button on it.
 *
 * The same trap waits for anybody who rotates the keys later: the button
 * would keep pointing at a client that no longer exists, or stay missing
 * after the keys arrive, until somebody happened to redeploy. A settings
 * question has to be asked when somebody is actually looking. */
export const dynamic = "force-dynamic";

/** Server-side only so it can read whether Google sign-in is configured. */
export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ friend?: string }> }) {
  /* Arrived through a friend's link (/r/<code>): say what signing up is for. */
  const fromFriend = (await searchParams).friend === "1";
  return (
    <AuthShell mode="register">
      {fromFriend && (
        <div className="border-brand/30 bg-brand/5 mb-5 flex items-start gap-3 rounded-xl border p-4">
          <Gift className="text-brand mt-0.5 size-6 shrink-0" aria-hidden="true" />
          <div className="text-sm leading-relaxed">
            <p className="text-base font-bold">חבר הזמין אותך — מחכה לך {REFERRAL_FRIEND_PERCENT}% הנחה</p>
            <p className="text-muted-foreground mt-0.5">
              נרשמים פעם אחת, וההנחה נשמרת בחשבון ותופעל אוטומטית בהזמנה הראשונה — מהטלפון או מהמחשב. כבר יש לכם
              חשבון? פשוט התחברו והיא תישמר שם.
            </p>
          </div>
        </div>
      )}
      <Suspense>
        <RegisterForm
          googleEnabled={googleOAuthConfigured()}
          appleEnabled={appleOAuthConfigured()}
          appleNativeEnabled={appleNativeConfigured()}
          googleNativeEnabled={googleNativeConfigured()}
        />
      </Suspense>
    </AuthShell>
  );
}
