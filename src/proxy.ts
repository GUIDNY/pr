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
  const { pathname, search } = request.nextUrl;

  // A category request that carries a filter, a sort or a page number goes to
  // the twin that reads them. The bare address — every crawler's request, and
  // most visitors' — falls through to the cached page. See
  // category/[slug]/page.tsx for why reading them at all is what costs.
  if (pathname.startsWith("/category/") && search) {
    return rewriteSegment(request, pathname, "/category/", "/category-filtered");
  }

  // A product request from a signed-in browser goes to the twin that can show
  // the admin's inline editors. Everyone else gets the cached page.
  if (pathname.startsWith("/product/") && request.cookies.has(SESSION_COOKIE)) {
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
