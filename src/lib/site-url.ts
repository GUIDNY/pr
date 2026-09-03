// The one place that knows what this shop's address is.
//
// It was written out three times — layout.tsx for metadataBase and the Open
// Graph tags, sitemap.ts for every URL in it, robots.ts for the sitemap
// line. Three copies of a constant that has to change on the day a real
// domain is pointed at the site, and the failure when one is missed is the
// quiet kind: the pages still render, the sitemap still validates, and
// every canonical URL, every Open Graph link a customer shares on WhatsApp,
// and every address handed to Google points at a domain that is no longer
// the shop's.
//
// So it is a setting. Changing the address is now an environment variable
// in Vercel and a redeploy, with nothing to grep for and nothing to miss.
//
// The fallback is the vercel.app address the site has always been at, which
// keeps a deployment with no variable set working exactly as before.
//
// NEXT_PUBLIC_ so the value is identical on the server and in the browser:
// a canonical tag rendered on the server and a link built on the client have
// to agree, and a plain server-only variable would leave the client with
// undefined.

const FALLBACK = "https://pr-ayam.vercel.app";

function normalise(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  // A bare domain typed into a dashboard field is the likely mistake, and
  // it would otherwise produce "example.co.il/product/x" as a supposedly
  // absolute URL — accepted by new URL() nowhere and by crawlers as a
  // relative path.
  if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

export const SITE_URL: string = (() => {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (!configured || !configured.trim()) return FALLBACK;
  try {
    const url = normalise(configured);
    new URL(url); // throws on nonsense, and a broken address must not ship
    return url;
  } catch {
    return FALLBACK;
  }
})();

/** An absolute URL for a path on this site. `path` may start with a slash. */
export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
