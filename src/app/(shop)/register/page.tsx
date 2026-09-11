import { Suspense } from "react";
import { RegisterForm } from "@/components/auth/register-form";
import { googleOAuthConfigured } from "@/lib/google-oauth";

/** Server-side only so it can read whether Google sign-in is configured. */
export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm googleEnabled={googleOAuthConfigured()} />
    </Suspense>
  );
}
