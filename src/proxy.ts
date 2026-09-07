import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

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

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // A category request that carries a filter, a sort or a page number goes to
  // the twin that reads them. The bare address — every crawler's request, and
  // most visitors' — falls through to the cached page. See
  // category/[slug]/page.tsx for why reading them at all is what costs.
  if (pathname.startsWith("/category/") && hasCategoryFilter(request)) {
    return rewriteSegment(request, pathname, "/category/", "/category-filtered");
  }

  // A brand request that chose a sort goes to the twin that reads it. The
  // bare address falls through to the cached page.
  if (pathname.startsWith("/brand/") && request.nextUrl.searchParams.has("sort")) {
    return rewriteSegment(request, pathname, "/brand/", "/brand-sorted");
  }

  // A product request from someone who is actually staff goes to the twin
  // that can show the inline editors. Everyone else — including a signed-in
  // customer — gets the cached page.
  if (pathname.startsWith("/product/") && (await isStaff(request))) {
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
 * Is this request carrying a real, signed staff session?
 *
 * The signature is verified here, and that is not about secrecy — the staff
 * route re-checks the session properly before showing an admin anything, so a
 * forged role reveals nothing. It is about load. The staff route is
 * `private, no-store` by design, so anyone who could forge a role could put
 * every request past the CDN and onto the origin at will, which is a way to
 * take the shop down without ever seeing a page they should not.
 *
 * Only requests that actually carry the cookie get here, so the ordinary
 * visitor — and every crawler — pays nothing for it.
 *
 * Presence of the cookie is not enough on its own either: every signed-in
 * customer has one, and routing on presence sent all of them to the uncached
 * route, making the shop's own account holders the only visitors who never
 * got the fast page. An expired token is not staff, and jwtVerify rejects it
 * for us. Anything unreadable means "not staff", so every failure lands on
 * the cached page — an admin whose token cannot be read still has /admin.
 */
async function isStaff(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return false;

  const secret = process.env.AUTH_SECRET;
  if (!secret) return false;

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    return typeof payload.role === "string" && STAFF_ROLES.has(payload.role);
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
  matcher: ["/product/:slug", "/category/:slug", "/brand/:slug", "/account/:path*"],
};
