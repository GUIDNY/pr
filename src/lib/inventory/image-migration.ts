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

export type MigrationCandidate = { id: string; url: string; productId: string };

/**
 * What is left to move.
 *
 * `hosts` is a substring match against the host, so "prec.co.il" takes the
 * old company site and nothing else. Omitted, it takes everything that is
 * not already ours — minus the blocked hosts, which are excluded here
 * rather than at the call site so no caller can opt out of that rule.
 */
export async function findImagesToMigrate(opts: { hosts?: string[]; take: number }): Promise<MigrationCandidate[]> {
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
      NOT: [{ url: { contains: "supabase.co" } }, { url: { contains: "buytoday.co.il" } }],
      ...(opts.hosts?.length
        ? { OR: opts.hosts.map((h) => ({ url: { contains: h, mode: "insensitive" as const } })) }
        : {}),
    },
    select: { id: true, url: true, productId: true },
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
    if (opts.hosts?.length) {
      const host = row.url.replace(/^https?:\/\//i, "").split("/")[0].toLowerCase();
      if (!opts.hosts.some((h) => host.includes(h.toLowerCase()))) continue;
    }
    out.push(row);
  }
  return out;
}

export async function countImagesToMigrate(hosts?: string[]): Promise<number> {
  const rows = await db.productImage.findMany({ select: { url: true } });
  const wanted = hosts?.map((h) => h.toLowerCase());
  return rows.filter((r) => {
    if (isSelfHosted(r.url) || isBlockedImageHost(r.url)) return false;
    if (!wanted) return true;
    const host = r.url.replace(/^https?:\/\//i, "").split("/")[0].toLowerCase();
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

export async function migrateOneImage(image: MigrationCandidate): Promise<MigrationOutcome> {
  if (isBlockedImageHost(image.url)) {
    return { id: image.id, ok: false, from: image.url, reason: "מארח חסום — לא מועתק" };
  }

  let input: Buffer;
  try {
    const res = await fetch(image.url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      // Some importer sites serve a placeholder to unknown agents.
      headers: { "user-agent": "Mozilla/5.0 (compatible; BuyTodayBot/1.0; +https://buytoday.co.il)" },
    });
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
    // Written last, and only after the upload returned a URL: the row keeps
    // pointing at the working hotlink until there is something better to
    // point at.
    await db.productImage.update({ where: { id: image.id }, data: { url } });
    return { id: image.id, ok: true, from: image.url, to: url, bytes: output.length };
  } catch (e) {
    return { id: image.id, ok: false, from: image.url, reason: e instanceof Error ? e.message : "שגיאת העלאה" };
  }
}

export type BatchResult = {
  attempted: number;
  migrated: number;
  failed: MigrationOutcome[];
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
export async function migrateImageBatch(opts: { hosts?: string[]; size: number }): Promise<BatchResult> {
  if (!isProductImageStorageConfigured()) {
    return { attempted: 0, migrated: 0, failed: [], remaining: 0, configured: false };
  }

  const batch = await findImagesToMigrate({ hosts: opts.hosts, take: opts.size });
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
    remaining: await countImagesToMigrate(opts.hosts),
    configured: true,
  };
}
