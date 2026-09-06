"use client";

import { useEffect, useState } from "react";
import { DISPLAY_NAME_COOKIE } from "@/lib/auth-cookie-name";

/**
 * "התחברות", or the signed-in visitor's first name.
 *
 * The header used to get this from the server, and that one read of the
 * session cookie made every page in the shop impossible to cache: the server
 * could not prepare a page in advance without knowing who would ask for it.
 * A crawler, which always arrives to a cold server, paid 2.4 seconds for it.
 *
 * So the page ships the same for everyone and this fills itself in. Reading
 * a cookie is synchronous and local — no request, nothing to wait for — so a
 * signed-in visitor sees their name a frame after hydration rather than after
 * a round trip to Australia.
 *
 * Rendered from an effect rather than from the initial state on purpose: the
 * server has no cookie to read, so seeding state from one would make the
 * first client render disagree with the HTML and React would discard it.
 */
export function AccountLabel() {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    const match = document.cookie.match(new RegExp(`(?:^|; )${DISPLAY_NAME_COOKIE}=([^;]*)`));
    if (!match) return;
    try {
      const decoded = decodeURIComponent(match[1]).trim();
      if (decoded) setName(decoded.split(" ")[0]);
    } catch {
      // A malformed cookie is not worth breaking the header over.
    }
  }, []);

  return <>{name ?? "התחברות"}</>;
}
