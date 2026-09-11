"use client";

import { useSearchParams } from "next/navigation";

/**
 * "המשך עם Apple".
 *
 * A link and not a fetch, like its Google counterpart: the whole flow is
 * redirects, and the session cookie is set on the way back in
 * /api/auth/apple/callback. Nothing to await on this side.
 *
 * Black with a white mark, drawn inline. Apple's guidelines fix the button's
 * colours and forbid altering the logo, and a sign-in page is the last place
 * to add a request to somebody else's CDN.
 */
export function AppleButton() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect");
  const href = redirect ? `/api/auth/apple?redirect=${encodeURIComponent(redirect)}` : "/api/auth/apple";

  return (
    <a
      href={href}
      className="flex h-12 w-full items-center justify-center gap-3 rounded-lg bg-black text-base font-semibold text-white transition-opacity hover:opacity-90"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="size-5" aria-hidden>
        <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
      </svg>
      המשך עם Apple
    </a>
  );
}
