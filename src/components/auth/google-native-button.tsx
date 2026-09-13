"use client";

import { useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";

/**
 * "המשך עם Google", inside the app.
 *
 * Its web counterpart is a link to accounts.google.com, and that is the one
 * that can never work here: Google refuses OAuth from an embedded WebView as
 * a matter of policy, so that the page asking for a password is never one the
 * host app could have drawn. The refusal is correct and nothing on this side
 * should try to get round it.
 *
 * What replaces it is not a page this app draws either. iOS presents Google's
 * own sheet, hands back a signed id_token, and the page posts that to
 * /api/auth/google/native from inside the WebView — so the session cookie is
 * set where the app can see it, which is what the redirect flow could not do
 * even when Safari let it through.
 *
 * The plugin is reached through window.Capacitor.Plugins and deliberately not
 * imported, for the same reason as the Apple button: it is installed on the
 * machine that assembles the app and has no business in the web build.
 */

type SocialLoginPlugin = {
  initialize(options: { google?: { iOSClientId?: string } }): Promise<void>;
  login(options: {
    provider: "google";
    options: { scopes?: string[] };
  }): Promise<{ result?: { idToken?: string } }>;
};

function socialPlugin(): SocialLoginPlugin | null {
  if (typeof window === "undefined") return null;
  const plugins = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } })
    .Capacitor?.Plugins;
  const plugin = plugins?.SocialLogin;
  return plugin ? (plugin as SocialLoginPlugin) : null;
}

/* The plugin is registered before the first page loads, or the build does not
   contain it. Nothing changes it within a session. */
function subscribe() {
  return () => {};
}

/**
 * Whether this build can run the sheet.
 *
 * Asked of the bridge rather than inferred from being in the app, because the
 * two answers diverge: this page reaches every install on the next load, the
 * plugin only the builds made since it was added. Inferring would put a
 * button in front of somebody whose copy cannot honour it.
 */
export function useGoogleNativeAvailable(): boolean {
  return useSyncExternalStore(subscribe, () => socialPlugin() !== null, () => false);
}

export function GoogleNativeButton() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/account";
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setError(null);
    const plugin = socialPlugin();
    /* Trimmed, and that is not tidiness.
     *
     * The server decides whether to render this button by reading the same
     * variable through a trim, so a value that arrived with a trailing
     * newline — what a paste into a dashboard field leaves behind — reads as
     * configured there and is a different string here. Google derives its
     * callback scheme by reversing this around the dots, so one invisible
     * character produces a scheme the app never registered, and the SDK
     * answers that by raising an NSException: a native crash on the button
     * press rather than a sign-in that fails.
     *
     * That is not hypothetical. It is what this cost a TestFlight round to
     * find, and the asymmetry between the two reads is what hid it. */
    const iOSClientId = process.env.NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
    if (!plugin || !iOSClientId) {
      setError("ההתחברות עם Google אינה זמינה כאן");
      return;
    }

    setBusy(true);
    try {
      /* Idempotent, and cheap enough to do on every press rather than track
         whether it has happened — a sign-in that fails because an init was
         missed is far more expensive than a redundant call. */
      await plugin.initialize({ google: { iOSClientId } });

      const result = await plugin.login({
        provider: "google",
        options: { scopes: ["email", "profile"] },
      });

      const idToken = result.result?.idToken;
      if (!idToken) throw new Error("token");

      const res = await fetch("/api/auth/google/native", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      if (!res.ok) throw new Error("signin");

      /* A real navigation: the cookie was just set, and the header, the cart
         badge and the saved list were all built for somebody signed out. */
      window.location.assign(redirect);
    } catch {
      /* Cancelling the sheet lands here too, which is why this says try again
         rather than something went wrong. */
      setError("ההתחברות לא הושלמה. אפשר לנסות שוב.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={signIn}
        disabled={busy}
        className="border-border hover:bg-muted flex h-12 w-full items-center justify-center gap-3 rounded-lg border bg-white text-base font-semibold text-[#1f1f1f] transition-colors disabled:opacity-60"
      >
        <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
        </svg>
        {busy ? "מתחבר…" : "המשך עם Google"}
      </button>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}
