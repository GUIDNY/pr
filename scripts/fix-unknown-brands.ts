// Repairs the brand rows the derivation got wrong, from the products
// already in the catalog. Read src/lib/inventory/brand-extractor.ts for the
// rules; this only applies them.
//
// Two problems, one pass:
//
//   1. 93 products carry the placeholder "לא ידוע". They came from the
//      accessory tabs — cables, mounts, extractor hoods — which have no
//      BRAND column and no yellow dividers, so extractBrand had nothing to
//      read and correctly returned null instead of guessing. But a good
//      share of them write the manufacturer plainly in their own title.
//   2. Model codes and sizes are filed as manufacturers: DS82, R8SW,
//      PRO16RW, R100SW, R120SWI have brand rows of their own, and one real
//      brand — לקסוס — is split four ways by the measurement printed after
//      it. cleanBrandCell now rejects those at import; this merges the ones
//      already written.
//
// Nothing is invented. A brand is only assigned when the product's own
// title contains a name this catalog already uses, so the worst case is
// that a product keeps the placeholder it already had. Everything it
// cannot name is printed with its title, because that list is the real
// answer to "why are there so many unknowns" — see the summary at the end.
//
//   npm run fix:brand-unknowns              # dry run
//   npm run fix:brand-unknowns -- --apply   # writes, after a CSV backup
import "dotenv/config";
import { writeFileSync } from "fs";
import { db } from "../src/lib/db";
import { cleanBrandCell, brandFromTitle } from "../src/lib/inventory/brand-extractor";

const APPLY = process.argv.includes("--apply");
const PLACEHOLDER = "לא ידוע";

type Move = { sku: string; title: string; productId: string; from: string; to: string; why: string; live: boolean };

async function main() {
  const brands = await db.brand.findMany({ select: { id: true, name: true } });
  const byName = new Map(brands.map((b) => [b.name.trim(), b]));

  // A brand row is "junk" when cleaning its own name does not give the name
  // back: DS82 cleans to nothing, "לקסוס 3 מ'" cleans to לקסוס.
  const junk = brands
    .filter((b) => b.name.trim() !== PLACEHOLDER)
    .map((b) => ({ ...b, cleaned: cleanBrandCell(b.name) }))
    .filter((b) => b.cleaned !== b.name.trim());

  // The vocabulary a title may be matched against: every brand that is not
  // the placeholder and not one of the junk rows — and, for names shorter
  // than three characters, only those the catalog leans on. LG carries 40
  // products and is worth finding in a title; "PL" carries 4 and is a
  // connector type printed in cable names ("כבל מאריך PL ל - PL"), "DS"
  // carries 1. A two-character string is too small to be evidence on its
  // own, so the catalog's own use of it is the evidence instead.
  const SHORT_NAME_MIN_PRODUCTS = 5;
  const counts = new Map(
    (await db.product.groupBy({ by: ["brandId"], _count: { _all: true } })).map((g) => [g.brandId, g._count._all]),
  );
  const junkIds = new Set(junk.map((b) => b.id));
  const vocabulary = brands
    .filter((b) => b.id !== byName.get(PLACEHOLDER)?.id && !junkIds.has(b.id))
    .filter((b) => b.name.trim().length >= 3 || (counts.get(b.id) ?? 0) >= SHORT_NAME_MIN_PRODUCTS)
    .map((b) => b.name);

  const products = await db.product.findMany({
    where: { OR: [{ brand: { name: PLACEHOLDER } }, { brandId: { in: [...junkIds] } }] },
    select: {
      id: true, sku: true, title: true, isPublished: true, stockQty: true,
      brand: { select: { id: true, name: true } },
      images: { select: { id: true }, take: 1 },
      category: { select: { name: true } },
    },
  });

  const existingNames = brands.map((b) => b.name.trim()).filter((n) => n !== PLACEHOLDER);
  const mergeTarget = (name: string): string | null => {
    const candidates = existingNames
      .filter((n) => n.length >= 3 && n.length < name.length && name.startsWith(`${n} `))
      .sort((a, b) => b.length - a.length);
    return candidates[0] ?? null;
  };

  const moves: Move[] = [];
  const stuck: { sku: string; title: string; category: string; live: boolean }[] = [];
  const cleanedName = new Map(junk.map((b) => [b.id, b.cleaned]));

  for (const p of products) {
    const live = p.isPublished && p.stockQty > 0 && p.images.length > 0;
    // A junk brand row that still holds a real name inside it — "כרומקס
    // CHS8000" -> כרומקס — resolves without reading the title at all.
    // A cleaned name that still starts with a shorter brand the catalog
    // already has belongs to that one: "גורניה  י.שלום" is Gorenje plus its
    // importer, and giving it a row of its own would split the brand rather
    // than repair it.
    const rawCell = cleanedName.get(p.brand.id) ?? null;
    const fromCell = rawCell ? (mergeTarget(rawCell) ?? rawCell) : null;
    const fromTitle = brandFromTitle(p.title, vocabulary);
    // A product left on a junk brand row is worse off than one on the
    // placeholder: "DS82" reads as a manufacturer on the brands page and is
    // not one, while "לא ידוע" is at least true. So a row nothing can name
    // falls back to the placeholder rather than keeping the model code.
    const to = fromCell ?? fromTitle ?? (p.brand.name.trim() === PLACEHOLDER ? null : PLACEHOLDER);
    if (!to || to === p.brand.name.trim()) {
      stuck.push({ sku: p.sku, title: p.title, category: p.category.name, live });
      continue;
    }
    moves.push({
      sku: p.sku,
      title: p.title,
      productId: p.id,
      from: p.brand.name,
      to,
      why: fromCell
        ? "the brand cell held a real name plus a model code or a size"
        : fromTitle
          ? "the product's own title names a brand this catalog already uses"
          : "its brand row was a model code, and nothing in the row names a manufacturer",
      live,
    });
  }

  console.log(`brand rows that are not brand names   ${junk.length}`);
  for (const b of junk) console.log(`   ${JSON.stringify(b.name).padEnd(32)} -> ${b.cleaned === null ? "(nothing — no brand in it)" : JSON.stringify(b.cleaned)}`);
  console.log(`\nproducts on "${PLACEHOLDER}" or a junk brand   ${products.length}`);
  console.log(`  would be given a real brand                ${moves.length}  (${moves.filter((m) => m.live).length} of them live on the site)`);
  console.log(`  nothing in the row names a manufacturer     ${stuck.length}  (${stuck.filter((s) => s.live).length} live)`);

  const byBrand = new Map<string, number>();
  for (const m of moves) byBrand.set(m.to, (byBrand.get(m.to) ?? 0) + 1);
  console.log("\nrecovered, by brand:");
  for (const [b, n] of [...byBrand].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${String(n).padStart(4)}  ${b}${byName.has(b) ? "" : "   (new brand row)"}`);
  }

  const stuckByCat = new Map<string, number>();
  for (const s of stuck) stuckByCat.set(s.category, (stuckByCat.get(s.category) ?? 0) + 1);
  console.log("\nstill unknown, by category — these rows name no manufacturer anywhere:");
  for (const [c, n] of [...stuckByCat].sort((a, b) => b[1] - a[1])) console.log(`   ${String(n).padStart(4)}  ${c}`);

  if (moves.length === 0) {
    console.log("\nnothing to do.");
    return;
  }
  console.log("\nfirst 20 changes:");
  for (const m of moves.slice(0, 20)) {
    console.log(`   ${m.sku.padEnd(9)} ${JSON.stringify(m.from).padEnd(22)} -> ${m.to.padEnd(14)} ${m.title.slice(0, 44)}`);
  }

  if (!APPLY) {
    console.log(`\n(dry run — nothing written. re-run with --apply to write all ${moves.length}.)`);
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = `brand-unknown-backfill-${stamp}.csv`;
  writeFileSync(
    backup,
    ["productId,sku,fromBrand,toBrand,why,live,title"]
      .concat(moves.map((m) => [m.productId, m.sku, m.from, m.to, m.why, m.live, m.title].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")))
      .join("\n"),
    "utf8",
  );
  console.log(`\nbackup written: ${backup}`);

  // Resolve every target name to a brand id, creating the row only for a
  // name a product's own title actually carries.
  const idFor = new Map<string, string>();
  for (const name of new Set(moves.map((m) => m.to))) {
    const existing = byName.get(name);
    if (existing) {
      idFor.set(name, existing.id);
      continue;
    }
    const slug = name.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase();
    const created = await db.brand.create({ data: { name, slug: `${slug || "brand"}-${Date.now().toString(36)}` } });
    idFor.set(name, created.id);
    console.log(`created brand row: ${name}`);
  }

  for (const m of moves) {
    const brandId = idFor.get(m.to);
    if (brandId) await db.product.update({ where: { id: m.productId }, data: { brandId } });
  }
  console.log(`updated ${moves.length} products. brandId only — no other field was touched.`);

  // A junk brand row with nothing left pointing at it is noise on the
  // brands page. Deleted only when empty, and only when it is one of the
  // rows this run identified as not being a brand name.
  let removed = 0;
  for (const b of junk) {
    const left = await db.product.count({ where: { brandId: b.id } });
    if (left === 0) {
      await db.brand.delete({ where: { id: b.id } });
      removed++;
    }
  }
  console.log(`removed ${removed} empty brand rows that were not brand names.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
