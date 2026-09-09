"use client";

import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { useBackOfficeHome } from "@/components/layout/session-summary-provider";

/**
 * The way back to work, on the shop itself.
 *
 * A salesperson browsing the site is the same person who has to open the
 * orders queue, and until this existed the only route there was typing
 * /admin into the address bar — which is fine for the developer who wrote it
 * and not for anyone else.
 *
 * Renders nothing at all for the overwhelming majority of visitors, and that
 * is the whole design constraint. The header is served from the CDN without
 * knowing who is looking (see Header), so this cannot be decided on the
 * server: it arrives with the rest of the session summary, after the page is
 * already on screen. Appearing late is fine here in a way it would not be
 * for a price — nothing moves when it appears, because it is at the end of
 * its row and the row was not full.
 *
 * The link is a convenience, never a permission: /admin checks the session
 * itself, and a customer who forged this into their DOM would get the login
 * page like anyone else.
 */
export function BackOfficeLink({ compact = false }: { compact?: boolean }) {
  const href = useBackOfficeHome();
  if (!href) return null;

  return (
    <Link
      href={href}
      className="bg-brand/10 text-brand hover:bg-brand/20 flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-colors"
    >
      <ClipboardList className="size-3.5" />
      {compact ? "טיפול בהזמנות" : "כניסה לממשק טיפול בהזמנות"}
    </Link>
  );
}
