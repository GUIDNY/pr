"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { logoutAction } from "@/actions/auth";

/**
 * Signing out, in a way the page actually notices.
 *
 * The action cleared the session cookie and redirected home, and the header
 * went on showing the signed-in badge until somebody pressed reload. That
 * was not a stale cookie — the cookie was gone. A server action's redirect
 * is a client-side navigation, so the React tree survives it, and
 * SessionSummaryProvider had already asked who was looking and kept the
 * answer. Nothing told it to ask again.
 *
 * The header was the visible half. The half nobody reported is worse: the
 * cart badge and the filled hearts live in the same client state, so after
 * signing out the page still showed the previous person's basket count and
 * which products they had saved. On a shared computer that is somebody
 * else's shopping on screen after they have signed out — which is the exact
 * moment they were entitled to assume it had gone.
 *
 * So the navigation is a real one. window.location rebuilds every piece of
 * client state from the server instead of trying to remember which pieces
 * needed clearing — and the list of things that would need clearing is
 * exactly the list that grows without anyone noticing. Signing out happens
 * rarely enough that a full load costs nothing worth protecting.
 */
export function LogoutButton({ className }: { className?: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await logoutAction();
          // Absolute, and not router.push: a soft navigation is precisely
          // what left the last session on screen. The lint rule that
          // prefers the router assumes the React tree should survive the
          // navigation, which is the assumption this is here to break.
          window.location.assign(new URL("/", window.location.origin).toString());
        })
      }
      className={className}
    >
      <LogOut className="size-4" />
      {isPending ? "מתנתק…" : "התנתקות"}
    </button>
  );
}
