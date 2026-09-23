/**
 * Product photographs, served from this shop's own domain.
 *
 * THE HEADER THAT MADE THIS NECESSARY. Supabase Storage answers every
 * public object with `X-Robots-Tag: none`, on both the object endpoint and
 * the render/image one — measured, not assumed, and there is no setting for
 * it. `none` means noindex,nofollow. So the migration that moves a
 * photograph off a third-party host and onto our storage was handing Google
 * an explicit instruction not to index it: worse for Google Images than the
 * hotlink it replaced, and a documented Merchant Center disapproval reason
 * for an image_link.
 *
 * It also answers `Cache-Control: no-cache`, so every crawl and every
 * visitor re-fetched the bytes in full.
 *
 * Both are fixed by putting the image on an address we control. That is
 * worth having for its own sake: Google Images credits the domain serving
 * the picture, which is the entire point of moving them here.
 *
 * NOT under /api. robots.ts disallows /api for every crawler, and an image
 * a crawler is forbidden to fetch is the problem this file exists to solve.
 * /img is allowed by the same wildcard rule that allows the product pages.
 *
 * The upstream URL is rebuilt from the path rather than taken from the
 * request, so this cannot be pointed at an arbitrary host: the only thing a
 * caller controls is a path inside our own public bucket.
 */

const SUPABASE_URL = process.env.SUPABASE_URL;

/* Immutable because the path carries the ProductImage id and a new
   photograph is a new row with a new id. A migrated image's bytes never
   change under the same address, so there is nothing for a revalidation
   round trip to discover. */
const CACHE = "public, max-age=31536000, s-maxage=31536000, immutable";

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;

  if (!SUPABASE_URL) return new Response("storage not configured", { status: 500 });

  /* A path segment is a bucket name, a cuid or a filename — never a
     traversal. Rejecting rather than sanitising, because a legitimate
     caller never produces one and a silent rewrite hides whatever did. */
  if (path.length === 0 || path.some((p) => p.includes("..") || p.startsWith("."))) {
    return new Response("not found", { status: 404 });
  }

  const upstream = `${SUPABASE_URL}/storage/v1/object/public/${path.map(encodeURIComponent).join("/")}`;

  let res: Response;
  try {
    res = await fetch(upstream, { signal: AbortSignal.timeout(10_000) });
  } catch {
    return new Response("upstream unavailable", { status: 502 });
  }

  if (!res.ok || !res.body) {
    return new Response("not found", { status: res.status === 404 ? 404 : 502 });
  }

  /* Only the headers that describe the bytes are carried over. Everything
     else upstream sends — X-Robots-Tag above all — is dropped on purpose,
     which is the whole reason a request passes through here. */
  const headers = new Headers({
    "Content-Type": res.headers.get("content-type") ?? "application/octet-stream",
    "Cache-Control": CACHE,
  });
  const length = res.headers.get("content-length");
  if (length) headers.set("Content-Length", length);

  return new Response(res.body, { status: 200, headers });
}
