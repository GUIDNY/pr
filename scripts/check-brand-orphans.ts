import "dotenv/config";
import { db } from "@/lib/db";
import { findBrandId, resolveBrandId } from "@/lib/inventory/brand-resolver";
import { findExistingProduct } from "@/lib/inventory/sync";

// A sync run once created 178 Brand rows with no product between them —
// half the brand table in a single run: model codes (EC9155.GR, IQ700),
// spec fragments (240Hz, 50W RMS), product types (מיקרוגל), a spreadsheet
// summary line (סה"כ), "Invalid Date".
//
// None of those rows became products. applyOneRow called resolveBrandId as
// its first statement, before the two early returns that drop a row — a
// zero-stock row for a product we have never seen, and a sheet tab with no
// matching category. The row went nowhere; the brand was already committed,
// permanently, with a public /brand/<slug> page and a line in the admin's
// brand picker.
//
// So the matching path must look brands up without creating them. This
// check holds that line from both sides: the lookup never writes, and the
// write path still does.

let failures = 0;
function check(label: string, pass: boolean, detail = "") {
  if (pass) console.log(`  ok    ${label}`);
  else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  const junk = `__CHECK_BRAND_ORPHANS_${Date.now()}`;
  const before = await db.brand.count();

  // 1. Looking up a name nothing uses reports "no row" and writes nothing.
  const looked = await findBrandId(junk);
  check("findBrandId returns null for an unknown name", looked === null, String(looked));
  check("findBrandId created no Brand row", (await db.brand.count()) === before);

  // 2. The matching path, given no brand, still answers — it does not throw
  //    and does not reach for a brand it would have to create first.
  const row = {
    sku: "__check__", skuIsSynthetic: true, sheetName: "__check__",
    rowIndex: 987654, brandName: junk, model: "M", title: "T",
  } as never;
  const match = await findExistingProduct("__no_such_source__", row, looked);
  check("findExistingProduct matches nothing for an unknown brand", match === null);
  check("findExistingProduct created no Brand row", (await db.brand.count()) === before);

  // 3. A row that really becomes a product still gets its brand.
  const created = await resolveBrandId(junk);
  check("resolveBrandId creates the brand on the write path", (await db.brand.count()) === before + 1);
  check("resolveBrandId is idempotent", (await resolveBrandId(junk)) === created);
  await db.brand.delete({ where: { id: created } });

  // 4. And the catalog as it stands: report orphans rather than assert a
  //    number, since a person may legitimately add a brand before its first
  //    product arrives. A jump here after a sync is the bug returning.
  const orphans = await db.brand.count({ where: { products: { none: {} } } });
  const total = await db.brand.count();
  console.log(`\n  brands: ${total}, of them with no product: ${orphans}`);

  console.log(failures === 0 ? `\n${6 - failures}/6 checks passed` : `\n${failures} of 6 checks FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
