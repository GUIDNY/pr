import { Suspense } from "react";
import { RegisterForm } from "@/components/auth/register-form";
import { googleOAuthConfigured } from "@/lib/google-oauth";

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
export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm googleEnabled={googleOAuthConfigured()} />
    </Suspense>
  );
}
