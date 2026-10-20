// The supplier's price sheets carry an image column, and a large share of
// what sits in it is hotlinked straight from competing Israeli retailers'
// servers — soferavi.co.il alone accounted for 705 of the 1,428 such images
// found in the catalog. Those were deleted, but deleting them only touched
// the database: the URLs are still in the sheets, so the sync would write
// every one of them back on its next run.
//
// This is the list that was classified by hand at the time. prec.co.il is
// deliberately absent — those images are ours to use.
//
// Re-checked host by host on 01/10/2026, because the list had six importers
// and one manufacturer in it, filed as shops. Their photographs are the
// manufacturer's assets, distributed by the importer, which is the same
// standing as sel, semicom and hidurgroup — hosts this codebase has always
// treated as legitimate. Taken out, with what each site says it is:
//   sarig.com      שריג אלקטריק — official importer of Morphy Richards, Shark,
//                  Ninja, Russell Hobbs, Remington, Dimplex
//   omegador       אומגה דור — importer of Italian kitchen brands
//   saynet         סאיינט לקת — "מייבאת ומשווקת באופן בלעדי"
//   isfar          ישפאר — official importer of Sony, Lenco, Elica
//   fratelli       the brand's own site
//   hidurit        the manufacturer's own site
// Still here, verified as retail: 100-100, kreizman, cwc. cdn.shopify.com
// stays: it serves everyone, and a third of what we have from it is
// Electra's benefits shop.
//
// hye (קבוצת ח.י) was in that sentence too, read as a chain because it
// sells. It is the importer of Hisense and Gorenje, and the thing that
// settles it is cheaper than reading an about page: count the brands.
// A shop photographs whatever it stocks, an importer photographs its own
// portfolio, and the catalogue holds 28 products from hye carrying
// exactly two brands — Gorenje and Hisense. Every host whose answer was
// already known agrees: omegador 2, isfar 2, saynet 3, sarig 6 and all
// six of them one brand portfolio, against cdn.shopify.com's 11,
// 100-100's 5 and cwc's 5. Taken out on 20/10/2026 on the owner's
// decision; 22 live products, ₪67,400, had no other photograph.
//
// The test needs about ten products to mean anything — lastprice shows
// two brands across four products and is a discount retailer.
const BLOCKED_HOSTS = [
  "soferavi",
  "lior-electric",
  "100-100",
  "cwc.co.il",
  "lastprice",
  "kreizman",
  "shukhashmal",
  "savoy",
  "superpharmstorage",
  "citydeal",
  "zabilo",
  "topstore",
  "meytal.me",
  "davopro",
  "avivi-e",
  "mandarin-e",
  "electricland",
  "orsale",
  "newpro",
  "i0.wp.com",
  "cdn.shopify.com",
  // Found still hotlinked on 30/09/2026, all retail shops, all answering 403
  // to us anyway. Listed so the sync never writes them back and the
  // migration never copies them.
  "avc.co.il",
  "yarid-b",
  "electricshop",
  "payngo",
  "shekem-electric",
  "technovision",
  // Found on 20/10/2026 by the enrichment agent, and the reason it took this
  // long is the one below: all 43 of its images had already been copied to
  // our own server, so every host test in this codebase answered "no" for
  // every one of them. 26 different brands on 43 products — a price
  // comparison site, which is the opposite of the importer test applied on
  // 01/10, and 28 of those products are live.
  "zap.co.il",
];

// Matches on the host alone, never the whole URL: a competitor's name
// appearing in a path or query string ("?ref=savoy") is not the same as
// the image being served from their box, and blocking on a substring of
// the full URL would reject legitimate images for mentioning a word.
export function isBlockedImageHost(url: string): boolean {
  const host = url
    .replace(/^https?:\/\//i, "")
    .split("/")[0]
    .split(":")[0]
    .toLowerCase();
  if (!host) return false;
  return BLOCKED_HOSTS.some((blocked) => host.includes(blocked));
}

/* Asks the question of the image rather than of its URL.
 *
 * An image copied to our own CDN keeps its origin nowhere but
 * `sourceDomain` / `sourceImageUrl`: `url` becomes
 * buytoday.co.il/img/..., so `isBlockedImageHost(image.url)` answers "no"
 * for every migrated image, whatever it is a photograph of. That agreed
 * with the truth for as long as every blocked host was on the list before
 * its images moved — the migration refuses a blocked host before copying,
 * so it cannot create the disagreement itself.
 *
 * zap.co.il broke the assumption by being found late: 43 images, every
 * single one already on our server, and the admin report that exists to
 * list competitors' photographs showed 11 of them, all on products that
 * were not live. The 28 live ones were invisible, and the readiness
 * counter below filed them under "already ours — ready for Google".
 *
 * So: "should I fetch this URL" is a question about the URL and keeps
 * using isBlockedImageHost. "Is this somebody else's photograph" is a
 * question about where the file came from, and has to be asked of all
 * three fields — `sourceDomain` and `sourceImageUrl` are each written by a
 * different path and 25 rows carry one without the other.
 *
 * `sourceDomain` holds a bare host ("zabilo.com"), which isBlockedImageHost
 * accepts unchanged: it strips a scheme and a path if there is one.
 */
export function imageIsFromBlockedHost(image: {
  url: string;
  sourceDomain?: string | null;
  sourceImageUrl?: string | null;
}): boolean {
  if (isBlockedImageHost(image.url)) return true;
  if (image.sourceDomain && isBlockedImageHost(image.sourceDomain)) return true;
  if (image.sourceImageUrl && isBlockedImageHost(image.sourceImageUrl)) return true;
  return false;
}

export const BLOCKED_IMAGE_HOST_COUNT = BLOCKED_HOSTS.length;
