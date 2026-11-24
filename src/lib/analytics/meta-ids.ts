import { consentGranted } from "@/lib/consent";

/* The browser half of the Meta Conversions API report — client-safe (no
   node:crypto), so the checkout can import it. See meta-capi.ts. */

const FBP = /^fb\.\d\.\d{10,15}\.\d{1,20}$/;
const FBC = /^fb\.\d\.\d{10,15}\.[A-Za-z0-9_-]{1,200}$/;

/** _fbp / _fbc out of document.cookie, only when they have Meta's own shape. */
export function parseMetaIds(cookie: string): { fbp: string | null; fbc: string | null } {
  const jar = new Map<string, string>();
  for (const part of cookie.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0) jar.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
  }
  const fbp = jar.get("_fbp");
  const fbc = jar.get("_fbc");
  return { fbp: fbp && FBP.test(fbp) ? fbp : null, fbc: fbc && FBC.test(fbc) ? fbc : null };
}

/** What the order carries for Meta: the banner's answer, and the ids only if
    it was yes. Without consent nothing is read from the cookie jar at all. */
export function metaIdsForOrder(): { metaConsent: boolean; metaFbp: string | null; metaFbc: string | null } {
  if (typeof document === "undefined" || !consentGranted()) return { metaConsent: false, metaFbp: null, metaFbc: null };
  const { fbp, fbc } = parseMetaIds(document.cookie);
  return { metaConsent: true, metaFbp: fbp, metaFbc: fbc };
}
