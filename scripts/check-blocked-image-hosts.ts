// Guards the two rules that keep the supplier sheet from undoing image work.
//
// The sheet's image column is full of hotlinks to competing retailers —
// 1,428 of them were deleted from the catalog, and every URL is still in
// the source files. The sync would write them all back on its next run,
// and its old "sheet wins" rule would also overwrite whatever photo the
// enrichment agent had found in the meantime.
//
// Run: npx tsx scripts/check-blocked-image-hosts.ts
import {
  imageIsFromBlockedHost,
  isBlockedImageHost,
} from "../src/lib/inventory/blocked-image-hosts";

// Real hosts, taken from the backup written when those images were deleted.
const MUST_BLOCK = [
  "https://www.soferavi.co.il/pictures/big/1234.jpg",
  "http://www.lior-electric.co.il/img/x.png",
  "https://100-100.co.il/media/p.jpg",
  "https://i0.wp.com/example.com/wp-content/a.jpg",
  "https://www.cwc.co.il/images/a.jpg",
  "https://kreizman.co.il/a.jpg",
  "https://shukhashmal.co.il/a.jpg",
  "https://cdn.shopify.com/s/files/1/a.jpg",
  "https://www.lastprice.co.il/a.jpg",
  "https://www.savoy.co.il/wp-content/uploads/a.jpg",
  "https://www.hye.co.il/media/catalog/product/a.jpg",
  "https://superpharmstorage.blob.core.windows.net/a.jpg",
  "https://zabilo.com/44519-product_page_img/470803.jpg",
  "https://www.payngo.co.il/media/catalog/product/n/w/nw2927f-1.png",
  "https://www.shekem-electric.co.il/media/ADIZT/371006-1.png",
  "https://www.technovision.co.il/images/itempics/EZ33500_1.jpg",
  "https://www.electricshop.co.il/images/itempics/TAF2023IX_1.jpg",
  "https://www.avc.co.il/images/itempics/EZ4K500_1.jpg",
  "https://yarid-b.co.il/wp-content/uploads/2026/07/a.jpeg",
  "https://www.zap.co.il/pics/114/1234567.jpg",
];

// prec.co.il is ours. Manufacturer and importer sites must pass, http://
// included — plenty of Israeli importer sites still serve plain http.
const MUST_ALLOW = [
  "https://www.prec.co.il/images/product/1.jpg",
  "https://prec.co.il/img/a.jpg",
  "http://www.electra.co.il/media/fridge.jpg",
  "https://images.samsung.com/is/image/samsung/x.jpg",
  "https://www.lg.com/content/dam/a.jpg",
  "https://media3.bosch-home.com/Product_Shots/a.png",
  // Importers, re-checked 01/10/2026 — see blocked-image-hosts.ts. sarig and
  // saynet used to sit in the list above; they were classified as shops by
  // mistake.
  "https://sarig.com/app/uploads/2023/07/EG203_HEB_3.png",
  "https://www.saynet.co.il/pub/media/catalog/product/m/x/mx-pisa-fan-ow.jpg",
  "https://omegador.co.il/wp-content/uploads/2025/07/a.jpg",
  "https://www.isfar.co.il/media/a.jpg",
  // The host is what matters, not the path: a competitor's name in a query
  // string or filename is not the same as the image living on their box.
  "https://images.electra.co.il/a.jpg?ref=savoy",
  "https://cdn.electra.co.il/soferavi-comparison-chart.jpg",
];

/* The provenance cases.
 *
 * An image copied to our CDN keeps its origin only in sourceDomain /
 * sourceImageUrl, so a test against `url` alone answers "no" for every
 * migrated image. Real rows, taken from the catalogue on 20/10/2026: zap
 * had 43 images and every one of them was already on our server. */
type ImageRow = { url: string; sourceDomain?: string | null; sourceImageUrl?: string | null };

const OURS = "https://buytoday.co.il/img/product-images/migrated/v2/p/i.webp";

const IMAGE_MUST_BLOCK: [string, ImageRow][] = [
  ["zap, already migrated — sourceDomain is the only tell", { url: OURS, sourceDomain: "zap.co.il" }],
  [
    "zabilo, already migrated (SKU 730242, live)",
    { url: OURS, sourceDomain: "zabilo.com", sourceImageUrl: "https://zabilo.com/27936/a.jpg" },
  ],
  [
    "sourceImageUrl set, sourceDomain not — 25 rows are in this state",
    { url: OURS, sourceDomain: null, sourceImageUrl: "https://www.soferavi.co.il/pictures/big/1.jpg" },
  ],
  ["still hotlinked, no provenance at all", { url: "https://www.payngo.co.il/media/a.png" }],
];

const IMAGE_MUST_ALLOW: [string, ImageRow][] = [
  [
    "sarig — importer, taken off the list 01/10, 124 images on our CDN",
    { url: OURS, sourceDomain: "sarig.com", sourceImageUrl: "https://sarig.com/app/uploads/a.png" },
  ],
  ["omegador — importer, 43 on our CDN", { url: OURS, sourceDomain: "omegador.co.il" }],
  ["the manufacturer, migrated", { url: OURS, sourceDomain: "media3.bsh-group.com" }],
  ["prec — ours to use", { url: OURS, sourceDomain: "www.prec.co.il" }],
  ["an admin upload with no provenance", { url: OURS, sourceDomain: null, sourceImageUrl: null }],
  [
    "a competitor's name in the path, the host is the manufacturer's",
    { url: "https://cdn.electra.co.il/soferavi-comparison-chart.jpg", sourceDomain: "cdn.electra.co.il" },
  ],
];

let failed = 0;
for (const url of MUST_BLOCK) {
  if (!isBlockedImageHost(url)) {
    console.log(`FAIL  should be blocked but is not: ${url}`);
    failed++;
  }
}
for (const url of MUST_ALLOW) {
  if (isBlockedImageHost(url)) {
    console.log(`FAIL  should be allowed but is blocked: ${url}`);
    failed++;
  }
}

for (const [label, image] of IMAGE_MUST_BLOCK) {
  if (!imageIsFromBlockedHost(image)) {
    console.log(`FAIL  image should be blocked but is not: ${label}`);
    failed++;
  }
}
for (const [label, image] of IMAGE_MUST_ALLOW) {
  if (imageIsFromBlockedHost(image)) {
    console.log(`FAIL  image should be allowed but is blocked: ${label}`);
    failed++;
  }
}

const total =
  MUST_BLOCK.length + MUST_ALLOW.length + IMAGE_MUST_BLOCK.length + IMAGE_MUST_ALLOW.length;
console.log(
  `${total - failed}/${total} passed  (${MUST_BLOCK.length} urls blocked, ${MUST_ALLOW.length} urls allowed, ` +
    `${IMAGE_MUST_BLOCK.length} images blocked, ${IMAGE_MUST_ALLOW.length} images allowed)`,
);
process.exit(failed === 0 ? 0 : 1);
