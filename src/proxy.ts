import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { jwtVerify } from "jose";
import {
  LEGACY_PRODUCT_SLUGS,
  LEGACY_BRAND_SLUGS,
} from "@/generated/legacy-slugs";
import { MALL_PASS_COOKIE, verifyMallPass } from "@/lib/mall-access";
import { pageViewFromRequest } from "@/lib/pageview/capture";
import { resolveSid, serializeSid, SID_COOKIE, SID_IDLE_SECONDS } from "@/lib/pageview/sid";

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

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const response = await route(request);
  logPageView(request, response, event);
  return response;
}

/**
 * The first-party path log — see lib/pageview for what is and is not kept.
 *
 * Here, and not in the page, because this is the one place that sees both a
 * full load and an App Router navigation (which is an RSC fetch that passes
 * through the proxy). It costs one cookie refresh and one fire-and-forget
 * POST per page view; the page never waits for it, and a failed log is a
 * failed log, never a failed page. Redirects are not logged — the request
 * that follows them is. The visit cookie is set on every logged response so
 * the 30-minute idle clock restarts with each page.
 */
function logPageView(request: NextRequest, response: NextResponse, event: NextFetchEvent) {
  if (response.status >= 300) return;
  const view = pageViewFromRequest({
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    headers: request.headers,
  });
  if (!view) return;

  const sid = resolveSid(request.cookies.get(SID_COOKIE)?.value);
  response.cookies.set(SID_COOKIE, serializeSid(sid), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SID_IDLE_SECONDS,
  });

  const secret = process.env.PV_SECRET || process.env.INTERNAL_API_KEY;
  if (!secret) return;
  event.waitUntil(
    fetch(new URL("/api/internal/pv", request.url), {
      method: "POST",
      headers: { "content-type": "application/json", "x-pv-secret": secret },
      body: JSON.stringify({ sid: sid.id, ...view }),
    }).catch(() => {}),
  );
}

async function route(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // The 3D mall at /mall (the iOS app's address for it) is private while the
  // patent is pending: only a visitor holding a pass from /api/game/pass gets
  // it, fetched from the game's host with the pass alongside. Anyone else is
  // sent to the home page. See lib/mall-access.ts.
  if (pathname === "/mall" || pathname.startsWith("/mall/")) {
    const pass = request.cookies.get(MALL_PASS_COOKIE)?.value;
    if (!pass || !(await verifyMallPass(pass)))
      return NextResponse.redirect(new URL("/", request.url), 303);
    const target = new URL(
      pathname.replace(/^\/mall\/?/, "/") + request.nextUrl.search,
      "https://play.buytoday.co.il",
    );
    const headers = new Headers(request.headers);
    headers.set("x-bt-mall-pass", pass);
    return NextResponse.rewrite(target, { request: { headers } });
  }

  // A category request that carries a filter, a sort or a page number goes to
  // the twin that reads them. The bare address — every crawler's request, and
  // most visitors' — falls through to the cached page. See
  // category/[slug]/page.tsx for why reading them at all is what costs.
  if (pathname.startsWith("/category/") && hasCategoryFilter(request)) {
    return rewriteSegment(
      request,
      pathname,
      "/category/",
      "/category-filtered",
    );
  }

  // An address something was renamed away from is answered here, before any
  // cache is consulted, and that placement is the whole point. The lookup
  // also lives in the page as a fallback, but a page cannot be relied on
  // alone: /product/[slug] is an ISR route, its `notFound()` is stored per
  // path, and a 404 stored against a path is served for months while the
  // redirect the page would now return never reaches anyone. Measured, not
  // assumed — see lib/generated/legacy-slugs.ts and the commit that added it.
  //
  // These were next.config redirects until the catalogue's addresses were
  // straightened out. Vercel caps a deployment at 1,024 redirect rules and
  // there are 2,044, so the table moved here, where there is no such cap and
  // the lookup is one hash probe.
  const renamed = legacyRedirect(request, pathname);
  if (renamed) return renamed;

  // A brand request that chose a sort goes to the twin that reads it. The
  // bare address falls through to the cached page.
  if (
    pathname.startsWith("/brand/") &&
    request.nextUrl.searchParams.has("sort")
  ) {
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

/* The roles the twin route actually shows something extra to. Deliberately
   the same answer as canManageCatalog() in permissions.ts, and not a
   superset of it: SELLER was in here, so a seller's every product request
   was rewritten to the uncached, `private, no-store` route — where
   product-admin/page.tsx asks canManageCatalog(), gets false, and renders
   the identical public page. A full origin render in Sydney, and a
   `noindex` in the markup, to show them exactly what the CDN was already
   holding. Keep the two lists in step: a role that cannot manage the
   catalog has no reason to leave the cached page. */
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
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret),
    );
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

/**
 * Was this address renamed away from? If so, send the visitor to the current
 * one — in a single hop, because the table maps every old address to the slug
 * in use now rather than to whatever replaced it at the time.
 */
function legacyRedirect(request: NextRequest, pathname: string) {
  const table = pathname.startsWith("/product/")
    ? LEGACY_PRODUCT_SLUGS
    : pathname.startsWith("/brand/")
      ? LEGACY_BRAND_SLUGS
      : null;
  if (!table) return null;

  const prefix = pathname.startsWith("/product/") ? "/product/" : "/brand/";
  const slug = pathname.slice(prefix.length);
  if (!slug || slug.includes("/")) return null;

  const current = Object.prototype.hasOwnProperty.call(table, slug)
    ? table[slug]
    : undefined;
  if (!current || current === slug) return null;

  const url = request.nextUrl.clone();
  url.pathname = `${prefix}${current}`;
  return NextResponse.redirect(url, 308);
}

function rewriteSegment(
  request: NextRequest,
  pathname: string,
  prefix: string,
  destination: string,
) {
  const slug = pathname.slice(prefix.length);
  // Nothing nested lives under either prefix, and rewriting a path with a
  // slash still in it would send "/category/a/b" somewhere that does not exist.
  if (!slug || slug.includes("/")) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = `${destination}/${slug}`;
  return NextResponse.rewrite(url);
}

/* Every page, so the path log sees every page. Assets, the data routes, the
   feeds, the image route and the back office are excluded here — before the
   function runs at all — and lib/pageview/capture.ts refuses the same set
   again for anything that slips through (a path with no extension under a
   new prefix, say). The routing above still keys on its own prefixes, so a
   request this matcher newly admits falls straight through to
   NextResponse.next() with nothing but the log. */
export const config = {
  matcher: [
    "/((?!api/|_next/|feeds/|img/|admin|favicon|\\.well-known/|.*\\.(?:ico|png|jpe?g|gif|webp|avif|svg|css|js|mjs|map|txt|xml|json|webmanifest|woff2?|ttf|otf|mp4|webm|pdf)$).*)",
  ],
};
