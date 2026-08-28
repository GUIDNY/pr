// The supplier's price sheets carry an image column, and a large share of
// what sits in it is hotlinked straight from competing Israeli retailers'
// servers — soferavi.co.il alone accounted for 705 of the 1,428 such images
// found in the catalog. Those were deleted, but deleting them only touched
// the database: the URLs are still in the sheets, so the sync would write
// every one of them back on its next run.
//
// This is the list that was classified by hand at the time. prec.co.il is
// deliberately absent — those images are ours to use.
const BLOCKED_HOSTS = [
  "soferavi",
  "lior-electric",
  "100-100",
  "cwc.co.il",
  "lastprice",
  "kreizman",
  "sarig.com",
  "shukhashmal",
  "savoy",
  "saynet",
  "superpharmstorage",
  "citydeal",
  "zabilo",
  "topstore",
  "hidurit",
  "meytal.me",
  "omegador",
  "davopro",
  "avivi-e",
  "mandarin-e",
  "isfar",
  "fratelli",
  "electricland",
  "orsale",
  "newpro",
  "hye.co.il",
  "i0.wp.com",
  "cdn.shopify.com",
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
