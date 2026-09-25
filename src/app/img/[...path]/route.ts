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

import { db } from "@/lib/db";
import { isBlockedImageHost } from "@/lib/inventory/blocked-image-hosts";

const SUPABASE_URL = process.env.SUPABASE_URL;

/* Immutable because the path carries the ProductImage id and a new
   photograph is a new row with a new id. A migrated image's bytes never
   change under the same address, so there is nothing for a revalidation
   round trip to discover.

   Three headers saying the same year, because three different caches read
   three different names and each prefers the most specific one it
   understands: the browser reads Cache-Control, a generic CDN reads
   CDN-Cache-Control, and Vercel's edge reads Vercel-CDN-Cache-Control.
   s-maxage in Cache-Control already reaches Vercel, so this is belt and
   braces rather than a fix — but the cost is two header lines and the
   failure it guards against is a silent one. */
const CACHE = "public, max-age=31536000, s-maxage=31536000, immutable";

/* And the opposite rule for a failure. A 502 currently carries no
   Cache-Control at all, so every broken image is re-fetched from upstream
   on every single request — which is exactly the wrong behaviour while
   upstream is the thing that is unwell. A minute is long enough to stop a
   crawler hammering a dead object and short enough that the picture
   returns a minute after storage does, with no deployment in between.

   Never the year. A failure cached for a year is a photograph that stays
   broken long after everything around it is fixed, and nothing in the
   shop would ever tell us. */
const FAILURE_CACHE = "public, max-age=60";

/**
 * The photograph this address used to be, when storage cannot answer.
 *
 * Every migrated row keeps its original hotlink in `sourceImageUrl` — the
 * migration writes it on the way past precisely so that moving a picture
 * here is not a one-way door. This is the door being used: while Supabase
 * Storage is restricted and answering 402, all 869 affected products have
 * a working address on record, and sending a visitor there is the
 * difference between a catalogue and a page of empty frames.
 *
 * Temporary in every sense that matters:
 *
 *   307, never 301. Nothing about this says the picture has moved. The
 *   moment storage answers again the upstream fetch succeeds and this code
 *   is not reached at all — no deployment, no data change, no cleanup.
 *
 *   Sixty seconds of cache, from the caller of this function. Long enough
 *   that a crawler does not re-ask for every image, short enough that the
 *   real photograph returns within the minute.
 *
 * A blocked host is never offered. Those are the competing Israeli
 * retailers whose images were deleted from this catalogue on purpose, and
 * an outage is not a reason to start hotlinking them again — a broken
 * frame is better than that.
 */
async function originalImageUrl(path: string[]): Promise<string | null> {
  /* Storage keys are `<bucket>/migrated/<productId>/<imageId>.webp`, so the
     last segment names the row. Anything else — an admin upload under a
     different shape — simply finds nothing and falls through. */
  const file = path[path.length - 1];
  const id = file.replace(/\.[^.]+$/, "");
  if (!id) return null;

  try {
    const row = await db.productImage.findUnique({
      where: { id },
      select: { sourceImageUrl: true },
    });
    const source = row?.sourceImageUrl;
    if (!source || isBlockedImageHost(source)) return null;
    return source;
  } catch {
    /* The database being unreachable too is not this route's problem to
       report. Fall through to the plain failure. */
    return null;
  }
}

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
    const original = await originalImageUrl(path);
    if (original) {
      return new Response(null, {
        status: 307,
        headers: { Location: original, "Cache-Control": FAILURE_CACHE },
      });
    }
    return new Response("upstream unavailable", {
      status: 502,
      headers: { "Cache-Control": FAILURE_CACHE },
    });
  }

  if (!res.ok || !res.body) {
    const original = await originalImageUrl(path);
    if (original) {
      return new Response(null, {
        status: 307,
        headers: { Location: original, "Cache-Control": FAILURE_CACHE },
      });
    }
    return new Response("not found", {
      status: res.status === 404 ? 404 : 502,
      headers: { "Cache-Control": FAILURE_CACHE },
    });
  }

  /* Only the headers that describe the bytes are carried over. Everything
     else upstream sends — X-Robots-Tag above all — is dropped on purpose,
     which is the whole reason a request passes through here. */
  const headers = new Headers({
    "Content-Type": res.headers.get("content-type") ?? "image/webp",
    "Cache-Control": CACHE,
    "CDN-Cache-Control": CACHE,
    "Vercel-CDN-Cache-Control": CACHE,
  });
  const length = res.headers.get("content-length");
  if (length) headers.set("Content-Length", length);

  return new Response(res.body, { status: 200, headers });
}
