"use client";

import { useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";

/**
 * "המשך עם Apple", inside the app.
 *
 * Its web counterpart is a link: the browser leaves for appleid.apple.com and
 * the session cookie is set on the way back. That cannot work in a WebView,
 * which either refuses the navigation or hands it to Safari, where the cookie
 * lands in a browser the app cannot see. So this one never leaves the page.
 * iOS draws the sign-in sheet, the page posts what it returns to
 * /api/auth/apple/native, and the cookie is set exactly where it is needed.
 *
 * The plugin is reached through window.Capacitor.Plugins and is deliberately
 * not imported. @capacitor-community/apple-sign-in is installed on the machine
 * that assembles the app and has no business in the web build — importing it
 * would make every Vercel deploy depend on a package only Xcode needs, and
 * break the build the first time somebody clones without it. Capacitor
 * registers native plugins on that global at runtime, so the bundle stays
 * free of them and this component is inert in a browser.
 */

type AppleAuthorizeResponse = {
  response?: {
    identityToken?: string;
    givenName?: string | null;
    familyName?: string | null;
  };
};

type ApplePlugin = {
  authorize(options: {
    clientId: string;
    redirectURI: string;
    scopes: string;
    nonce: string;
  }): Promise<AppleAuthorizeResponse>;
};

function applePlugin(): ApplePlugin | null {
  if (typeof window === "undefined") return null;
  const plugins = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } })
    .Capacitor?.Plugins;
  const plugin = plugins?.SignInWithApple;
  return plugin ? (plugin as ApplePlugin) : null;
}

/* Nothing ever changes this within a session: the plugin is registered before
   the first page loads, or the build does not contain it. */
function subscribe() {
  return () => {};
}

/**
 * Whether this build can actually run the sheet.
 *
 * Being inside the app is not the same question, and treating it as the same
 * put a dead button in front of a reviewer: the button's visibility ships with
 * the web page and reaches every install immediately, while the plugin only
 * arrives in a build made after it was installed. Every TestFlight copy older
 * than that would have shown the button and answered "not available here".
 *
 * Asking the bridge instead makes it self-correcting — the button appears the
 * moment a build that can honour it is running, and never before.
 */
export function useAppleNativeAvailable(): boolean {
  return useSyncExternalStore(subscribe, () => applePlugin() !== null, () => false);
}

export function AppleNativeButton() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/account";
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setError(null);
    const plugin = applePlugin();
    if (!plugin) {
      setError("ההתחברות עם Apple אינה זמינה כאן");
      return;
    }

    setBusy(true);
    try {
      /* The nonce is minted by the server and kept in an httpOnly cookie. It
         travels through the sheet and comes back inside the signed token,
         which is what makes a captured token useless a second time. */
      const minted = await fetch("/api/auth/apple/native", { cache: "no-store" });
      if (!minted.ok) throw new Error("nonce");
      const { nonce } = (await minted.json()) as { nonce: string };

      /* clientId and redirectURI are required by the plugin's signature and
         used only by its web and Android paths. On iOS the sheet identifies
         the app by its bundle id, which is also the audience the server
         checks. */
      const result = await plugin.authorize({
        clientId: "il.co.buytoday.app",
        redirectURI: "https://buytoday.co.il/api/auth/apple/callback",
        scopes: "name email",
        nonce,
      });

      const identityToken = result.response?.identityToken;
      if (!identityToken) throw new Error("token");

      /* Apple sends a name on the first authorisation and never again, so it
         is forwarded at the only moment it exists. */
      const name = [result.response?.givenName, result.response?.familyName]
        .filter(Boolean)
        .join(" ")
        .trim();

      const res = await fetch("/api/auth/apple/native", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identityToken, name: name || undefined }),
      });

      if (!res.ok) throw new Error("signin");

      /* A full navigation and not router.push: the session cookie was just
         set, and every piece of client state — the header, the cart badge,
         the saved list — was built for somebody who was not signed in. */
      window.location.assign(redirect);
    } catch {
      /* Cancelling the sheet lands here too, which is why the message is
         about trying again rather than about something going wrong. */
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
        className="flex h-12 w-full items-center justify-center gap-3 rounded-lg bg-black text-base font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="size-5" aria-hidden>
          <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
        </svg>
        {busy ? "מתחבר…" : "המשך עם Apple"}
      </button>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}
