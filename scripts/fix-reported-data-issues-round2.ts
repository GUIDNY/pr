import "dotenv/config";
import { db } from "../src/lib/db";

async function findOrCreateBrand(name: string): Promise<string> {
  const existing = await db.brand.findFirst({ where: { name } });
  if (existing) return existing.id;
  const slug = name
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();
  const created = await db.brand.create({ data: { name, slug: `${slug || "brand"}-${Date.now().toString(36)}` } });
  return created.id;
}

// Explicit per-SKU brand corrections — verified by cross-referencing real
// retailers/importers (prec.co.il, Savoy, NewPan, שוק החשמל, sauter.co.il).
// Each SKU listed individually rather than by a "current brand X -> Y"
// bulk rule, because some current-brand values (e.g. "בקו") map to
// DIFFERENT correct brands depending on the specific model (120240 ->
// Bosch, but 101519/101619 -> Gorenje) — a blind bulk rule on the wrong
// brand would misfire here.
const BRAND_FIXES: { sku: string; correctBrand: string }[] = [
  // round "0ב"
  { sku: "100048", correctBrand: "Bosch" },
  { sku: "100963", correctBrand: "Bosch" },
  { sku: "101036", correctBrand: "Siemens" },
  { sku: "101519", correctBrand: "Gorenje" },
  { sku: "101619", correctBrand: "Gorenje" },
  { sku: "120240", correctBrand: "Bosch" },
  { sku: "100072", correctBrand: "Hisense" },
  { sku: "103607", correctBrand: "Electrolux" },
  // round "0ב2"
  { sku: "100316", correctBrand: "KONKA" },
  { sku: "100426", correctBrand: "KONKA" },
  { sku: "100344", correctBrand: "LG" },
  { sku: "150625", correctBrand: "Electrolux" },
  // round "0ב3"
  { sku: "103863", correctBrand: "Bosch" },
  { sku: "146100", correctBrand: "Siemens" },
  { sku: "150650", correctBrand: "AEG" },
  { sku: "150651", correctBrand: "AEG" },
  { sku: "150763", correctBrand: "Sauter" },
  { sku: "0398", correctBrand: "Sauter" },
  { sku: "0614", correctBrand: "Lofra" },
  { sku: "0502", correctBrand: "Sauter" },
];

async function applyExplicitBrandFixes() {
  let fixed = 0;
  for (const { sku, correctBrand } of BRAND_FIXES) {
    const product = await db.product.findUnique({ where: { sku }, select: { id: true, brand: { select: { name: true } } } });
    if (!product) {
      console.log("SKIP (sku not found)", sku);
      continue;
    }
    if (product.brand.name === correctBrand) {
      console.log("already correct, skipping", sku);
      continue;
    }
    const brandId = await findOrCreateBrand(correctBrand);
    await db.product.update({ where: { id: product.id }, data: { brandId } });
    fixed++;
    console.log("FIXED brand", sku, ":", product.brand.name, "->", correctBrand);
  }
  console.log(`explicit brand fixes: ${fixed} products`);
}

// Verified clean bulk patterns — checked against the full catalog first:
// EVERY product currently branded "CANDY" (10/10) has a DLR-prefixed
// model and is actually DeLonghi; every TCL product with a CB/CN-prefixed
// model (7 found, 3 more than the SKUs the report named) is actually
// Liebherr. Safe to apply as a pattern rather than an explicit SKU list.
async function applyBulkBrandPatterns() {
  const delonghiId = await findOrCreateBrand("DeLonghi");
  const candyProducts = await db.product.findMany({ where: { brand: { name: "CANDY" } }, select: { id: true, sku: true } });
  for (const p of candyProducts) {
    await db.product.update({ where: { id: p.id }, data: { brandId: delonghiId } });
    console.log("FIXED brand (bulk CANDY->DeLonghi)", p.sku);
  }
  console.log(`bulk CANDY->DeLonghi: ${candyProducts.length} products`);

  const liebherrId = await findOrCreateBrand("Liebherr");
  const tclSuspects = await db.product.findMany({
    where: {
      brand: { name: "TCL" },
      OR: [{ model: { startsWith: "CB", mode: "insensitive" } }, { model: { startsWith: "CN", mode: "insensitive" } }],
    },
    select: { id: true, sku: true },
  });
  for (const p of tclSuspects) {
    await db.product.update({ where: { id: p.id }, data: { brandId: liebherrId } });
    console.log("FIXED brand (bulk TCL->Liebherr)", p.sku);
  }
  console.log(`bulk TCL->Liebherr: ${tclSuspects.length} products`);
}

// Category corrections — the product's own category is wrong for its
// actual type (an HDMI cable isn't a wall mount; a milk frother isn't a
// coffee machine), independent of any brand issue.
const CATEGORY_FIXES: { sku: string; correctCategorySlug: string }[] = [
  { sku: "0180", correctCategorySlug: "cables" },
  { sku: "0181", correctCategorySlug: "cables" },
  { sku: "0182", correctCategorySlug: "cables" },
  { sku: "0183", correctCategorySlug: "cables" },
  { sku: "0184", correctCategorySlug: "cables" },
  { sku: "0185", correctCategorySlug: "cables" },
  { sku: "0186", correctCategorySlug: "cables" },
  { sku: "0187", correctCategorySlug: "cables" },
  { sku: "0188", correctCategorySlug: "cables" },
  { sku: "0138", correctCategorySlug: "tv-stands" }, // shelf, not a wall mount
  { sku: "150625", correctCategorySlug: "microwaves" }, // built-in microwave+grill combo, not an oven
  { sku: "770025", correctCategorySlug: "milk-frothers" },
  { sku: "778001", correctCategorySlug: "small-kitchen-appliances" }, // ice cream/slush maker — no dedicated category exists
  { sku: "0398", correctCategorySlug: "induction-cooktops" }, // was under gas-cooktops
];

async function applyCategoryFixes() {
  let fixed = 0;
  for (const { sku, correctCategorySlug } of CATEGORY_FIXES) {
    const [product, category] = await Promise.all([
      db.product.findUnique({ where: { sku }, select: { id: true, category: { select: { slug: true } } } }),
      db.category.findUnique({ where: { slug: correctCategorySlug }, select: { id: true } }),
    ]);
    if (!product) {
      console.log("SKIP (sku not found)", sku);
      continue;
    }
    if (!category) {
      console.log("SKIP (target category not found)", correctCategorySlug);
      continue;
    }
    if (product.category.slug === correctCategorySlug) {
      console.log("already correct, skipping", sku);
      continue;
    }
    await db.product.update({ where: { id: product.id }, data: { categoryId: category.id } });
    fixed++;
    console.log("FIXED category", sku, ":", product.category.slug, "->", correctCategorySlug);
  }
  console.log(`category fixes: ${fixed} products`);
}

async function main() {
  await applyExplicitBrandFixes();
  await applyBulkBrandPatterns();
  await applyCategoryFixes();
  console.log(
    "SKIPPED on purpose (per report's own guidance): SKU 901125 (brand+category both wrong, no fitting category exists — needs a human decision on where it belongs), the 2 data conflicts under '0ד' (25L vs 34L; 10-touch vs 12 programs — needs a human call), and the hedged 'probably' RQ/Hisense SKUs (100097/100098/103211/109321 — not independently re-verified)."
  );
  process.exit(0);
}

main();
