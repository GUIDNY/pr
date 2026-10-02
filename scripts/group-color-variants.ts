import "dotenv/config";
import { createHash } from "node:crypto";
import { db } from "../src/lib/db";
import { colorInTitle, titleWithoutColor } from "../src/lib/catalog/variant-colors";

/**
 * Tying the colour variants of one appliance together.
 *
 * `npm run check:variants` proposes and writes nothing. `npm run fix:variants`
 * applies exactly what the check printed.
 *
 * THE RULE THAT MAKES THIS SAFE. A group needs two or more DISTINCT colours.
 * Rows that collapse to the same title and name the same colour are not
 * variants — they are the same product entered twice, and there are far more
 * of those: 51 such groups against 18 real ones when this was written. They
 * are reported and never grouped. Offering a shopper a "second colour" that
 * is the identical appliance would be worse than offering nothing, and the
 * place it would appear is the page where a wrong click becomes a wrong
 * order.
 *
 * The group id is a hash of what defines the group — brand, category and the
 * de-coloured title — so a second run reproduces the same ids instead of
 * reshuffling every product into fresh ones. That also means a product whose
 * title is edited leaves its group, which is the honest behaviour: the title
 * is the evidence the grouping rests on.
 *
 * Published-ness and stock are deliberately NOT part of the rule. A finish
 * that is out of stock today is still a finish of this appliance, and it
 * will be back; the product page decides what to show, and it is the only
 * place that should, because that is where PUBLIC_PRODUCT_WHERE lives.
 */

const WRITE = process.argv.includes("--write");

/** Short titles collapse into each other — "כבל HDMI" would gather a dozen
    unrelated cables once their lengths and colours were stripped. */
const MIN_BASE_LENGTH = 12;

/* md5 rather than sha1 for one reason: Postgres has md5() built in and
   needs no extension, so the first grouping can be applied as SQL from a
   session with no DATABASE_URL and still produce the ids this script will
   reproduce on its next run. Not a security boundary — an id for rows that
   belong together. */
function groupIdFor(brandId: string, categoryId: string, base: string): string {
  return "vg_" + createHash("md5").update(`${brandId}|${categoryId}|${base}`).digest("hex").slice(0, 16);
}

type Row = {
  id: string;
  sku: string;
  title: string;
  brandId: string;
  categoryId: string;
  variantGroupId: string | null;
  images: { url: string }[];
};

async function main() {
  const products: Row[] = await db.product.findMany({
    select: {
      id: true,
      sku: true,
      title: true,
      brandId: true,
      categoryId: true,
      variantGroupId: true,
      images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
    },
  });

  const buckets = new Map<string, { brandId: string; categoryId: string; base: string; rows: Row[] }>();
  for (const p of products) {
    const base = titleWithoutColor(p.title);
    if (base.length < MIN_BASE_LENGTH) continue;
    const key = `${p.brandId}|${p.categoryId}|${base}`;
    const bucket = buckets.get(key) ?? { brandId: p.brandId, categoryId: p.categoryId, base, rows: [] };
    bucket.rows.push(p);
    buckets.set(key, bucket);
  }

  const groups: { id: string; base: string; rows: Row[] }[] = [];
  const duplicates: { base: string; rows: Row[] }[] = [];

  for (const b of buckets.values()) {
    if (b.rows.length < 2) continue;
    const colors = new Set(b.rows.map((r) => colorInTitle(r.title) ?? "~"));
    if (colors.size < 2) {
      duplicates.push({ base: b.base, rows: b.rows });
      continue;
    }
    groups.push({ id: groupIdFor(b.brandId, b.categoryId, b.base), base: b.base, rows: b.rows });
  }

  console.log(`\n=== ${groups.length} variant groups (${groups.reduce((n, g) => n + g.rows.length, 0)} products) ===\n`);
  for (const g of groups) {
    console.log(`${g.base.slice(0, 64)}`);
    for (const r of g.rows) console.log(`   ${r.sku.padEnd(9)} ${colorInTitle(r.title) ?? "—"}`);
  }

  /* Reported, never written. These are a data problem with a different
     answer — one of the two rows should probably not exist — and that is
     the shop owner's call, not a script's. */
  console.log(
    `\n=== ${duplicates.length} same-colour groups (${duplicates.reduce((n, d) => n + d.rows.length, 0)} products) — NOT grouped ===`
  );
  console.log("Same title, same colour: duplicate rows rather than variants.\n");
  for (const d of duplicates) {
    console.log(`${d.base.slice(0, 64)}`);
    console.log(`   ${d.rows.map((r) => r.sku).join("  ")}`);
  }

  /* Colours that share one photograph.
    
     A real group whose members were given the same picture — the sheet
     supplied one image for the pair and nobody has photographed the second
     finish. The grouping is still right and stays; what is wrong is that
     the white product's page shows the black one, which was true before
     any of this existed. The picker refuses to repeat the picture under a
     second colour name (see getColorVariants), so the shop never states in
     a photograph that a finish looks like something it does not — but the
     product page still does, and only a photograph fixes that.
    
     Printed here because it is the list of photographs worth taking, in
     the order they would pay off: these are live products a shopper can
     reach today. */
  const sharedPhoto = groups
    .map((g) => {
      const withImages = g.rows.filter((r) => r.images[0]?.url);
      const distinct = new Set(withImages.map((r) => r.images[0].url));
      return { g, withImages, distinct: distinct.size };
    })
    .filter((x) => x.withImages.length > 1 && x.distinct < x.withImages.length);

  if (sharedPhoto.length > 0) {
    console.log(`\n=== ${sharedPhoto.length} groups where colours share one photograph — needs a photo, not a fix here ===\n`);
    for (const { g, withImages } of sharedPhoto) {
      console.log(`${g.base.slice(0, 64)}`);
      for (const r of withImages) console.log(`   ${r.sku.padEnd(9)} ${colorInTitle(r.title) ?? "—"}`);
    }
  }

  /* A product that was grouped and no longer qualifies — its title was
     edited, or its only sibling was deleted — has to be released, or the
     page goes on offering a colour picker with one colour in it. */
  const shouldBeSet = new Map<string, string>();
  for (const g of groups) for (const r of g.rows) shouldBeSet.set(r.id, g.id);
  const toClear = products.filter((p) => p.variantGroupId && shouldBeSet.get(p.id) !== p.variantGroupId);
  const toSet = [...shouldBeSet.entries()].filter(
    ([id, gid]) => products.find((p) => p.id === id)?.variantGroupId !== gid
  );

  console.log(`\nchanges: ${toSet.length} to set, ${toClear.length} to clear`);

  if (!WRITE) {
    console.log("\nDry run. `npm run fix:variants` applies exactly this.\n");
    process.exit(0);
  }

  for (const p of toClear) {
    await db.product.update({ where: { id: p.id }, data: { variantGroupId: null } });
  }
  for (const [id, gid] of toSet) {
    await db.product.update({ where: { id }, data: { variantGroupId: gid } });
  }
  console.log(`\nwrote ${toSet.length}, cleared ${toClear.length}\n`);
  process.exit(0);
}

main();
