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
// Still here, verified as retail: hye (קבוצת ח.י, a chain), 100-100,
// kreizman, cwc. cdn.shopify.com stays: it serves everyone, and a third of
// what we have from it is Electra's benefits shop.
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
  "hye.co.il",
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

export const BLOCKED_IMAGE_HOST_COUNT = BLOCKED_HOSTS.length;
