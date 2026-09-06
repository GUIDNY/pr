import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// The one thing that runs before the cache.
//
// Two pages in this shop are cacheable only because they refuse to look at
// the one thing that would personalise them, and both need a way to serve the
// minority of requests that really do need it. So the decision is made here,
// before the cache, instead of inside the page:
//
//   - a product request carrying a session cookie is rewritten to
//     /product-admin/[slug], which can read the session and show an admin
//     their inline editors;
//   - a category request carrying any query string is rewritten to
//     /category-filtered/[slug], which reads the filters.
//
// Everything else — every crawler, and nearly every visitor — falls through
// untouched to a page the CDN already holds.
//
// Deliberately only a presence check on the cookie. Verifying the token here
// would mean the signing key and a crypto call on the hot path of every
// product request, to answer a question the destination page answers properly
// anyway — it re-reads the session and bounces anyone who is not staff. The
// worst this can be wrong about is sending a signed-in customer to a route
// that redirects them back.
//
// Keep this file cheap. Anything added here is paid on every matched request,
// including the ones that were about to be a cache hit.
const SESSION_COOKIE = "prec_session";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // A category request that carries a filter, a sort or a page number goes to
  // the twin that reads them. The bare address — every crawler's request, and
  // most visitors' — falls through to the cached page. See
  // category/[slug]/page.tsx for why reading them at all is what costs.
  if (pathname.startsWith("/category/") && hasCategoryFilter(request)) {
    return rewriteSegment(request, pathname, "/category/", "/category-filtered");
  }

  // A product request from someone who is actually staff goes to the twin
  // that can show the inline editors. Everyone else — including a signed-in
  // customer — gets the cached page.
  if (pathname.startsWith("/product/") && looksLikeStaff(request)) {
    return rewriteSegment(request, pathname, "/product/", "/product-admin");
  }

  // A signed-out visitor asking for an account page is sent to sign in, and
  // told where they were going. account/layout.tsx has always done this, but
  // from inside the layout there is no way to know which account page was
  // asked for, so it sent everyone to /account afterwards — someone following
  // a link to a specific order lost the order. Here the path is simply known.
  //
  // This does not replace the layout's own check, which is the real guard: a
  // cookie that is present but expired or forged gets past this and is caught
  // there, where the token is actually verified.
  if (pathname.startsWith("/account") && !request.cookies.has(SESSION_COOKIE)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?redirect=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

const STAFF_ROLES = new Set(["ADMIN", "STAFF"]);

/**
 * Is this request carrying what looks like a live staff session?
 *
 * Reads the role out of the session token WITHOUT verifying its signature,
 * which is deliberate and safe: this decides which of two routes renders, and
 * the staff route calls getSession() and verifies properly before it shows an
 * admin anything. A forged "role":"ADMIN" buys a visitor nothing but the
 * uncached copy of a page they can already read.
 *
 * Presence of the cookie is not enough, and that distinction is the whole
 * point. Every signed-in customer carries one, and routing on presence sent
 * all of them to a route Next serves `private, no-store` — the shop's own
 * account holders would have been the only visitors never getting the fast
 * page. An expired token is treated the same way, since the staff route would
 * only render the public view for it anyway.
 *
 * Anything unreadable means "not staff", so the failure direction is the
 * cached page. An admin whose token this cannot parse still has /admin.
 */
function looksLikeStaff(request: NextRequest): boolean {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return false;

  const payload = token.split(".")[1];
  if (!payload) return false;

  try {
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const claims = JSON.parse(json) as { role?: unknown; exp?: unknown };
    if (typeof claims.exp === "number" && claims.exp * 1000 < Date.now()) return false;
    return typeof claims.role === "string" && STAFF_ROLES.has(claims.role);
  } catch {
    return false;
  }
}

// The parameters the category page actually reads — see CategoryPageView,
// which uses exactly these and ignores everything else.
//
// Deliberately a list and not "any query string at all". A shopper arriving
// from an ad or a shared Facebook link carries ?utm_source=, ?gclid= or
// ?fbclid=, and treating those as filters would send every ad click and every
// link posted anywhere to the uncached route — the visits the shop pays for
// would be the slow ones. They change nothing about the page, so they are
// nothing to route on.
const FILTER_PARAMS = new Set(["sort", "page", "view", "brand", "min", "max"]);

function hasCategoryFilter(request: NextRequest): boolean {
  for (const key of request.nextUrl.searchParams.keys()) {
    if (FILTER_PARAMS.has(key) || key.startsWith("attr_")) return true;
  }
  return false;
}

function rewriteSegment(request: NextRequest, pathname: string, prefix: string, destination: string) {
  const slug = pathname.slice(prefix.length);
  // Nothing nested lives under either prefix, and rewriting a path with a
  // slash still in it would send "/category/a/b" somewhere that does not exist.
  if (!slug || slug.includes("/")) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = `${destination}/${slug}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/product/:slug", "/category/:slug", "/account/:path*"],
};
