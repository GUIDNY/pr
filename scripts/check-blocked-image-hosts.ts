// Guards the two rules that keep the supplier sheet from undoing image work.
//
// The sheet's image column is full of hotlinks to competing retailers —
// 1,428 of them were deleted from the catalog, and every URL is still in
// the source files. The sync would write them all back on its next run,
// and its old "sheet wins" rule would also overwrite whatever photo the
// enrichment agent had found in the meantime.
//
// Run: npx tsx scripts/check-blocked-image-hosts.ts
import { isBlockedImageHost } from "../src/lib/inventory/blocked-image-hosts";

// Real hosts, taken from the backup written when those images were deleted.
const MUST_BLOCK = [
  "https://www.soferavi.co.il/pictures/big/1234.jpg",
  "http://www.lior-electric.co.il/img/x.png",
  "https://100-100.co.il/media/p.jpg",
  "https://i0.wp.com/example.com/wp-content/a.jpg",
  "https://www.cwc.co.il/images/a.jpg",
  "https://sarig.com/img/a.jpg",
  "https://kreizman.co.il/a.jpg",
  "https://shukhashmal.co.il/a.jpg",
  "https://cdn.shopify.com/s/files/1/a.jpg",
  "https://www.lastprice.co.il/a.jpg",
  "https://www.savoy.co.il/wp-content/uploads/a.jpg",
  "https://www.saynet.co.il/a.jpg",
  "https://superpharmstorage.blob.core.windows.net/a.jpg",
  "https://zabilo.com/44519-product_page_img/470803.jpg",
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
  // The host is what matters, not the path: a competitor's name in a query
  // string or filename is not the same as the image living on their box.
  "https://images.electra.co.il/a.jpg?ref=savoy",
  "https://cdn.electra.co.il/soferavi-comparison-chart.jpg",
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

const total = MUST_BLOCK.length + MUST_ALLOW.length;
console.log(`${total - failed}/${total} passed  (${MUST_BLOCK.length} blocked, ${MUST_ALLOW.length} allowed)`);
process.exit(failed === 0 ? 0 : 1);
