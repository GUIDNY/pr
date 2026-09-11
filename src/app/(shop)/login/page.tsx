import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";
import { googleOAuthConfigured } from "@/lib/google-oauth";

/**
 * A server component now, only so it can answer one question the browser
 * must not be asked to answer: whether Google sign-in is configured.
 *
 * The button appears when the credentials exist and not before, which is the
 * same rule the notification channels follow. A button that leads to "this
 * is not available" is worse than no button.
 */
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm googleEnabled={googleOAuthConfigured()} />
    </Suspense>
  );
}
