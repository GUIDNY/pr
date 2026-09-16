import "server-only";
import sharp from "sharp";
import { db } from "@/lib/db";
import { uploadProductImage, isProductImageStorageConfigured } from "@/lib/product-image-storage";
import { isBlockedImageHost } from "@/lib/inventory/blocked-image-hosts";

/**
 * Moving product photographs onto our own storage.
 *
 * 3,361 of the catalogue's 3,362 images are hotlinks, spread over 176 hosts.
 * That is a problem in four directions at once: the URLs belong to other
 * companies and break without notice, Merchant Center has to fetch every one
 * of them from a server nobody here controls, Google Images cannot credit a
 * picture served from someone else's domain, and the single largest host is
 * prec.co.il — the company's own previous site — which holds the only
 * photograph of 214 products. The day that site is switched off, 214
 * products leave this shop, because PUBLIC_PRODUCT_WHERE needs a picture.
 *
 * Supabase Storage, not a new provider. The bucket already exists and the
 * admin's own image uploads have been going through it; adding Vercel Blob
 * would mean a second storage system, a second environment variable and a
 * second bill for a job the first one already does.
 *
 * TWO RULES THIS FILE WILL NOT BREAK.
 *
 * It never migrates a blocked host. Copying a competitor's photograph onto
 * our own server is worse than hotlinking it, not better — a hotlink is
 * arguably their bandwidth and their choice to stop; a copy is a copy. Those
 * images have their own screen, where the owner decides.
 *
 * It never deletes the original URL on failure. A product with a hotlinked
 * photo is on the shop; a product whose image row was emptied by a failed
 * fetch is not. Anything that cannot be fetched, decoded or uploaded is
 * reported and left exactly as it was.
 */

/** Google rejects anything under 250x250 and this catalogue has images at
    350x238 — under the limit on one axis while looking fine on the page. */
const CANVAS = 800;
const WEBP_QUALITY = 82;

/* A photograph is padded onto a white square, never cropped and never
   stretched — a cropped appliance loses the handle, a stretched one is the
   wrong shape, and both are worse than white space.

   withoutEnlargement matters more than it looks. Without it a 350x238
   source is interpolated up to fill 800x800: measurably blurrier and,
   measured on a real catalogue image, 26KB against 13KB. The product keeps
   its own pixels and the canvas does the rest. */
export async function normalizeProductImage(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .resize(CANVAS, CANVAS, {
      fit: "contain",
      withoutEnlargement: true,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    // A transparent PNG on a white canvas still carries an alpha channel,
    // and Google treats transparency as a placeholder tell.
    .flatten({ background: "#ffffff" })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
}

/** Already ours: a second run must not re-download and re-upload the lot. */
export function isSelfHosted(url: string): boolean {
  return /supabase\.co|buytoday\.co\.il/i.test(url);
}

/**
 * Hosts that answer our requests with a refusal.
 *
 * prec.co.il — the shop's own former site — sits behind Cloudflare, which
 * returns 403 to a datacenter address and keeps returning it however long
 * the wait. Nothing here can fix that; the fix is a rule on that account.
 *
 * NOT the blocked list, and the difference matters. A blocked host is one
 * whose images we must never copy, however well it serves them. This is a
 * host that will not serve them at all — an obstacle, not a rule — so it is
 * listed separately and removing it needs no argument, just for the block
 * on that side to be lifted.
 *
 * Excluded from the "everything" run so a known refusal does not spend four
 * requests and twenty seconds of every batch, and does not fill the failure
 * list with 356 rows that all say the same thing. The dedicated
 * prec.co.il button still tries, which is how you find out it has been
 * lifted.
 */
export const HOSTS_THAT_REFUSE_US = ["prec.co.il"];

export type MigrationCandidate = {
  id: string;
  url: string;
  productId: string;
  /** Whatever provenance the row already carries. Read so the migration
      can record where a picture came from without overwriting an answer
      the enrichment agent already gave. */
  sourceImageUrl: string | null;
};

/**
 * What is left to move.
 *
 * `hosts` is a substring match against the host, so "prec.co.il" takes the
 * old company site and nothing else. Omitted, it takes everything that is
 * not already ours — minus the blocked hosts, which are excluded here
 * rather than at the call site so no caller can opt out of that rule.
 */
export async function findImagesToMigrate(opts: {
  hosts?: string[];
  /** Hosts to leave out. Not the same as the blocked list: those are
      competitors and must never be copied. These are hosts that will not
      serve us, which is a fact about them rather than a rule of ours. */
  excludeHosts?: string[];
  /** Images already tried and failed in this run.
      Without this the whole thing deadlocks, and it did: candidates come
      back ordered by id, a failure changes nothing in the database, so the
      next batch is the same four images and the run makes no progress
      forever. The client's only defence was to stop as soon as a batch
      migrated nothing — which turns four unlucky images at the front of the
      queue into "0 migrated" for the entire catalogue. The first four by id
      are img.zap.co.il, miele.co.il, bettershop and c100; a price
      comparison site and a competitor are exactly the hosts that refuse a
      robot, and they were standing in front of three thousand images that
      would have worked. */
  skipIds?: string[];
  take: number;
}): Promise<MigrationCandidate[]> {
  /* Both filters belong in the query, not in a loop over the first page.
     Taking N rows by id and filtering them in JS looks fine on the first
     batch and then quietly stops: once the early ids are migrated, that
     page comes back entirely self-hosted, the filter empties it, and the
     caller reads an empty batch as "finished" with two thousand images
     still to go. Excluding the migrated ones in SQL means the set shrinks
     as the work progresses, which is what makes the loop terminate for the
     right reason.

     The host filter goes in for the same reason in the other direction:
     with hosts=["prec.co.il"], a JS-side filter would scan a page of
     images from other hosts and return nothing while prec images sat
     further down the table. */
  const rows = await db.productImage.findMany({
    where: {
      // Spelled out as two negated conditions rather than NOT: [a, b],
      // whose meaning depends on knowing how Prisma combines a list there.
      AND: [
        { url: { not: { contains: "supabase.co" } } },
        { url: { not: { contains: "buytoday.co.il" } } },
      ],
      ...(opts.skipIds?.length ? { id: { notIn: opts.skipIds } } : {}),
      ...(opts.hosts?.length
        ? { OR: opts.hosts.map((h) => ({ url: { contains: h, mode: "insensitive" as const } })) }
        : {}),
    },
    select: { id: true, url: true, productId: true, sourceImageUrl: true },
    orderBy: { id: "asc" },
    // Still wider than `take`: the blocked hosts are the one filter left in
    // JS, and a run of them should not return a short batch.
    take: opts.take * 10,
  });

  const out: MigrationCandidate[] = [];
  for (const row of rows) {
    if (out.length >= opts.take) break;
    // `contains` matches anywhere in the URL, so a host filter can still
    // catch a path; check the host itself.
    if (isSelfHosted(row.url)) continue;
    if (isBlockedImageHost(row.url)) continue;
    const host = row.url.replace(/^https?:\/\//i, "").split("/")[0].toLowerCase();
    if (opts.excludeHosts?.some((h) => host.includes(h.toLowerCase()))) continue;
    if (opts.hosts?.length && !opts.hosts.some((h) => host.includes(h.toLowerCase()))) continue;
    out.push(row);
  }
  return out;
}

export async function countImagesToMigrate(hosts?: string[], excludeHosts?: string[]): Promise<number> {
  const rows = await db.productImage.findMany({ select: { url: true } });
  const wanted = hosts?.map((h) => h.toLowerCase());
  const unwanted = excludeHosts?.map((h) => h.toLowerCase());
  return rows.filter((r) => {
    if (isSelfHosted(r.url) || isBlockedImageHost(r.url)) return false;
    const host = r.url.replace(/^https?:\/\//i, "").split("/")[0].toLowerCase();
    if (unwanted?.some((h) => host.includes(h))) return false;
    if (!wanted) return true;
    return wanted.some((h) => host.includes(h));
  }).length;
}

export type MigrationOutcome =
  | { id: string; ok: true; from: string; to: string; bytes: number }
  | { id: string; ok: false; from: string; reason: string };

/* Some of these hosts are slow — prec.co.il asks crawlers for a seven-second
   delay — and a batch that hangs on one image burns the whole request. */
const FETCH_TIMEOUT_MS = 15_000;
const MAX_SOURCE_BYTES = 16 * 1024 * 1024;

/* The first real run returned HTTP 403 on all eight images from
   prec.co.il, and the cause was this file, not the host.

   Eight requests went out back to back with no gap between them. Fetching
   the same URLs by hand returns 200 — and returns 429 the moment they are
   requested quickly, which is the site saying "too fast" in as many words.
   A WAF that escalates a repeated 429 to a 403 is the ordinary shape of
   what came back. prec.co.il's own robots.txt asks for seven seconds
   between requests; we asked for eight files in about as many seconds.

   So requests to one host are spaced, and a 403 or 429 is retried once
   after a longer pause rather than recorded as a dead image. Per host
   rather than globally: a batch spanning six hosts should not crawl
   because one of them is slow. */
const HOST_MIN_GAP_MS = 1_500;
const RETRY_AFTER_MS = 8_000;
const lastHitAt = new Map<string, number>();

/* A host that refuses us twice is not going to relent inside this run.
   prec.co.il sits behind Cloudflare, which answers a datacenter address
   with 403 and keeps answering 403 however long the wait — the slow retry
   above is the right response to a 429 and useless against a bot rule.
   Without this, every batch spends four requests and twenty seconds
   rediscovering the same refusal, and the screen fills with identical
   rows that say nothing new.

   Per invocation, which is all a serverless function has and all this
   needs: the next run gets to find out whether the block is still there. */
const refusedThisRun = new Set<string>();

function hostOf(url: string): string {
  return url.replace(/^https?:\/\//i, "").split("/")[0].toLowerCase();
}

async function politeDelay(host: string): Promise<void> {
  const last = lastHitAt.get(host);
  if (last !== undefined) {
    const wait = HOST_MIN_GAP_MS - (Date.now() - last);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }
  lastHitAt.set(host, Date.now());
}

/* Enough of a browser's headers to get past the checks that reject a bare
   programmatic request. The Referer is the image's own site: hotlink
   protection is common on these hosts and is exactly what it inspects.
   Nothing here is pretending to be a person — the UA still says what this
   is — it is the request a normal client would send. */
function fetchHeaders(url: string): Record<string, string> {
  const origin = url.match(/^https?:\/\/[^/]+/)?.[0] ?? "";
  return {
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/126.0.0.0 Safari/537.36 BuyTodayBot/1.0 (+https://buytoday.co.il)",
    accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    "accept-language": "he-IL,he;q=0.9,en;q=0.8",
    ...(origin ? { referer: `${origin}/` } : {}),
  };
}

export async function migrateOneImage(image: MigrationCandidate): Promise<MigrationOutcome> {
  if (isBlockedImageHost(image.url)) {
    return { id: image.id, ok: false, from: image.url, reason: "מארח חסום — לא מועתק" };
  }

  const host = hostOf(image.url);
  if (refusedThisRun.has(host)) {
    return { id: image.id, ok: false, from: image.url, reason: `${host} חוסם את הבקשות שלנו` };
  }

  let input: Buffer;
  try {
    await politeDelay(host);
    let res = await fetch(image.url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: fetchHeaders(image.url),
    });
    // Throttled or blocked: wait longer and ask once more. If the host is
    // rate-limiting, this is what it wanted; if it is genuinely refusing
    // us, the second answer says so and the image is left alone.
    if (res.status === 403 || res.status === 429) {
      await new Promise((r) => setTimeout(r, RETRY_AFTER_MS));
      lastHitAt.set(host, Date.now());
      res = await fetch(image.url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: fetchHeaders(image.url),
      });
    }
    if (res.status === 403) {
      // Said plainly, because "HTTP 403" on 356 rows reads as our bug and
      // this one is not: the host is refusing the request, and the fix is
      // on its side rather than in another retry here.
      refusedThisRun.add(host);
      return {
        id: image.id,
        ok: false,
        from: image.url,
        reason: `${host} חוסם את הבקשות שלנו (403) — נדרש אישור בצד שלהם`,
      };
    }
    if (!res.ok) return { id: image.id, ok: false, from: image.url, reason: `HTTP ${res.status}` };
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength === 0) return { id: image.id, ok: false, from: image.url, reason: "קובץ ריק" };
    if (bytes.byteLength > MAX_SOURCE_BYTES) {
      return { id: image.id, ok: false, from: image.url, reason: "גדול מ-16MB" };
    }
    input = Buffer.from(bytes);
  } catch (e) {
    return { id: image.id, ok: false, from: image.url, reason: e instanceof Error ? e.message : "שגיאת רשת" };
  }

  let output: Buffer;
  try {
    output = await normalizeProductImage(input);
  } catch {
    // A 404 page served as HTML with a 200 lands here rather than above.
    return { id: image.id, ok: false, from: image.url, reason: "לא תמונה תקינה" };
  }

  try {
    const url = await uploadProductImage(`migrated/${image.productId}/${image.id}.webp`, output, "image/webp");
    /* Written last, and only after the upload returned a URL: the row keeps
       pointing at the working hotlink until there is something better to
       point at.

       The old address goes into sourceImageUrl on the way past, which is
       the difference between a migration and a one-way door. Every other
       failure in this file leaves the row untouched, but the one thing
       that cannot be caught here is a host answering 200 with a picture
       that is not the product — a watermark, a placeholder, a "no image"
       graphic. sharp decodes those perfectly happily, so the row is
       updated and, without this, the only record of what the photograph
       used to be is gone. With it, putting one back is an UPDATE.

       Never over an answer that is already there: sourceImageUrl on an
       enriched image records the page a real photograph was found on, and
       that is worth more than this. */
    await db.productImage.update({
      where: { id: image.id },
      data: {
        url,
        ...(image.sourceImageUrl ? {} : { sourceImageUrl: image.url, sourceDomain: host }),
      },
    });
    return { id: image.id, ok: true, from: image.url, to: url, bytes: output.length };
  } catch (e) {
    return { id: image.id, ok: false, from: image.url, reason: e instanceof Error ? e.message : "שגיאת העלאה" };
  }
}

export type BatchResult = {
  attempted: number;
  migrated: number;
  failed: MigrationOutcome[];
  /** Every id this batch touched, whether it worked or not. The caller
      feeds these back as skipIds so the queue moves forward: a failure
      leaves the row unchanged, so without this the next batch is the same
      images again. */
  attemptedIds: string[];
  remaining: number;
  configured: boolean;
};

/**
 * One batch. The caller loops.
 *
 * Batched because no route here sets maxDuration, so a request is capped at
 * the platform default and 2,607 images is not a request — it is an
 * afternoon. Sequential rather than parallel on purpose: these are other
 * people's servers, several of them small Israeli importer sites, and
 * twenty concurrent fetches at one of them is indistinguishable from an
 * attack.
 */
export async function migrateImageBatch(opts: {
  hosts?: string[];
  excludeHosts?: string[];
  /** Ids already tried and failed in this run — see findImagesToMigrate. */
  skipIds?: string[];
  size: number;
}): Promise<BatchResult> {
  if (!isProductImageStorageConfigured()) {
    return { attempted: 0, migrated: 0, failed: [], attemptedIds: [], remaining: 0, configured: false };
  }

  const batch = await findImagesToMigrate({
    hosts: opts.hosts,
    excludeHosts: opts.excludeHosts,
    skipIds: opts.skipIds,
    take: opts.size,
  });
  const failed: MigrationOutcome[] = [];
  let migrated = 0;

  for (const image of batch) {
    const result = await migrateOneImage(image);
    if (result.ok) migrated++;
    else failed.push(result);
  }

  return {
    attempted: batch.length,
    migrated,
    failed,
    attemptedIds: batch.map((b) => b.id),
    remaining: await countImagesToMigrate(opts.hosts, opts.excludeHosts),
    configured: true,
  };
}
