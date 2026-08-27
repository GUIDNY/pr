import "dotenv/config";
import { db } from "../src/lib/db";
import { generateProductSlug } from "../src/lib/integrations/product-enrich-shared";

async function fixSpinRpmDuplicate() {
  const category = await db.category.findUnique({ where: { slug: "washing-machines" } });
  if (!category) return console.log("SKIP spin_rpm dedup (no washing-machines category)");
  const [canonical, dup] = await Promise.all([
    db.categoryAttribute.findUnique({ where: { categoryId_key: { categoryId: category.id, key: "spin_rpm" } } }),
    db.categoryAttribute.findUnique({ where: { categoryId_key: { categoryId: category.id, key: "spin_speed_rpm" } } }),
  ]);
  if (!canonical || !dup) return console.log("SKIP spin_rpm dedup (one of the two keys missing)", { canonical: !!canonical, dup: !!dup });

  const dupValues = await db.productAttributeValue.findMany({ where: { attributeId: dup.id } });
  let migrated = 0;
  let discarded = 0;
  for (const v of dupValues) {
    const existing = await db.productAttributeValue.findUnique({
      where: { productId_attributeId: { productId: v.productId, attributeId: canonical.id } },
    });
    if (existing) {
      discarded++;
      continue;
    }
    await db.productAttributeValue.create({ data: { productId: v.productId, attributeId: canonical.id, value: v.value } });
    migrated++;
  }
  await db.categoryAttribute.delete({ where: { id: dup.id } });
  console.log(`spin_speed_rpm -> spin_rpm: migrated ${migrated}, discarded ${discarded}, old attribute deleted`);
}

// The 9 SKUs reported as mislabeled — genuinely LG (verified against
// Brimag, LG's official Israeli importer), not the "האייר"/Haier brand
// they're currently filed under. Direct DB fix, since product-enrich's
// API only ever fills an empty brand and this one is already (wrongly)
// set. Title text is fixed alongside the brand so the two don't
// contradict each other on the product page.
const LG_MISLABELED: { sku: string; correctedTitle: string }[] = [
  { sku: "121913", correctedTitle: "LG WFS9014WW" },
  { sku: "123213", correctedTitle: "LG WF10114WBW" },
  { sku: "121073", correctedTitle: "LG F16107WDE" },
  { sku: "121331", correctedTitle: "LG WF13314WBC" },
  { sku: "123111", correctedTitle: "LG WF11114WBW" },
  { sku: "0650", correctedTitle: "LG WF13314GBC" },
  { sku: "0649", correctedTitle: "LG WF10014WBW" },
  { sku: "0441", correctedTitle: "LG WFS9014GBB" },
  { sku: "121915", correctedTitle: "LG WFS9014WB" },
];

async function fixLgMislabeledAsHaier() {
  const lgBrand = await db.brand.findUnique({ where: { name: "LG" } });
  if (!lgBrand) return console.log("SKIP LG relabel (no LG brand row found)");

  let fixed = 0;
  for (const { sku, correctedTitle } of LG_MISLABELED) {
    const product = await db.product.findUnique({ where: { sku }, select: { id: true, brandId: true, title: true } });
    if (!product) {
      console.log("SKIP (sku not found)", sku);
      continue;
    }
    if (product.brandId === lgBrand.id) {
      console.log("already LG, skipping", sku);
      continue;
    }
    await db.product.update({ where: { id: product.id }, data: { brandId: lgBrand.id, title: correctedTitle } });
    fixed++;
    console.log("FIXED brand+title", sku, ":", product.title, "->", correctedTitle, "(LG)");
  }
  console.log(`LG relabel: ${fixed} products fixed`);
  console.log(
    "NOTE: brand is normally re-derived from the source Excel on every inventory sync — if the upstream sheet still lists these under a Haier-labeled section/column, a future sync could silently revert this fix. Root-cause (why these 9 rows extract as Haier) was not investigated here."
  );
}

// JBL/Philips headphones filed under speakers ("רמקולים") instead of
// headphones — direct DB category move (categoryId is sync-protected via
// the API, not via a direct script).
const MISCATEGORIZED_TO_HEADPHONES = [
  "371501", "370102", "370103", "370502", "371100", "0598",
  "283075", "283076", "283077", "284805",
];

async function fixMiscategorizedHeadphones() {
  const headphones = await db.category.findUnique({ where: { slug: "headphones" } });
  if (!headphones) return console.log("SKIP headphones recategorize (no headphones category)");
  const result = await db.product.updateMany({
    where: { sku: { in: MISCATEGORIZED_TO_HEADPHONES } },
    data: { categoryId: headphones.id },
  });
  console.log(`recategorized ${result.count} products to headphones`);
}

// A literal ";;" SKU is not a real supplier SKU — no way to recover the
// true one without the source Excel, so this just gives it a clearly-
// synthetic, guaranteed-unique replacement so it stops colliding with
// anything and is honestly labeled as not a real SKU.
async function fixSemicolonSku() {
  const product = await db.product.findFirst({ where: { sku: ";;" }, select: { id: true, sku: true } });
  if (!product) return console.log("SKIP ';;' sku fix (not found — already fixed?)");
  const newSku = `SYN-${product.id.slice(-10)}`;
  await db.product.update({ where: { id: product.id }, data: { sku: newSku, isTemporarySku: true } });
  console.log(`';;' sku -> ${newSku} (marked isTemporarySku)`);
}

// 0552's slug is a leftover from a previous title ("9630BS...") and no
// longer matches its current (correct) title — regenerated to match.
// Scoped to this one specifically-reported case, not a catalog-wide
// slug/title resync (that's a bigger, separate SEO-sensitive task).
async function fixSlugMismatch() {
  const product = await db.product.findUnique({ where: { sku: "0552" }, select: { id: true, title: true, slug: true } });
  if (!product) return console.log("SKIP 0552 slug fix (not found)");
  const newSlug = generateProductSlug(product.title, "0552");
  if (product.slug === newSlug) return console.log("0552 slug already matches, skipping");
  await db.product.update({ where: { id: product.id }, data: { slug: newSlug } });
  console.log(`0552 slug: ${product.slug} -> ${newSlug}`);
}

async function main() {
  await fixSpinRpmDuplicate();
  await fixLgMislabeledAsHaier();
  await fixMiscategorizedHeadphones();
  await fixSemicolonSku();
  await fixSlugMismatch();
  process.exit(0);
}

main();
