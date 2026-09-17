import "dotenv/config";
import { RECYCLING_GROUPS, CATEGORY_RECYCLING_MAP, seedSql } from "./recycling-seed-data";

/**
 * Filling in the removal mapping, and reporting what is still blank.
 *
 *   npm run check:recycling   reports coverage and writes nothing
 *   npm run fix:recycling     applies exactly what the check printed
 *   npm run sql:recycling     prints the same thing as SQL, for a session
 *                             that has the Supabase console but no DATABASE_URL
 *
 * The lists it applies are in recycling-seed-data.ts, and the reasoning for
 * what is deliberately left unmapped is written there.
 *
 * WHY IT ONLY EVER FILLS BLANKS. The database is the source of truth from the
 * moment this has run once: /admin/recycling edits those rows, and a rerun
 * must not undo somebody's decision. So it creates groups that do not exist
 * and maps categories that are unmapped, and never re-points a category that
 * already has an answer.
 */

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--sql")) {
    console.log(seedSql());
    return;
  }

  const write = args.includes("--write");
  const { db } = await import("../src/lib/db");

  // ---- groups ----
  const existing = await db.recyclingCategory.findMany({ select: { key: true } });
  const have = new Set(existing.map((g) => g.key));
  const missing = RECYCLING_GROUPS.filter((g) => !have.has(g.key));

  console.log(`קבוצות פינוי: ${have.size} קיימות, ${missing.length} חסרות`);
  for (const g of missing) console.log(`  + ${g.key} — ${g.oldLabel}`);

  if (write && missing.length > 0) {
    for (const g of missing) {
      // The same id the SQL path writes, so a database seeded either way
      // looks identical afterwards.
      await db.recyclingCategory.create({ data: { id: `rc_${g.key}`, ...g, isEnabled: true } });
    }
  }

  // ---- mapping ----
  const groups = await db.recyclingCategory.findMany({ select: { id: true, key: true } });
  const byKey = new Map(groups.map((g) => [g.key, g.id]));

  const categories = await db.category.findMany({
    select: {
      slug: true,
      name: true,
      recyclingCategoryId: true,
      parent: { select: { slug: true } },
      _count: { select: { products: true } },
    },
    orderBy: { slug: "asc" },
  });

  let mapped = 0;
  const toMap: { slug: string; key: string }[] = [];
  const unmapped: typeof categories = [];

  for (const c of categories) {
    if (c.recyclingCategoryId) {
      mapped++;
      continue;
    }
    const key = CATEGORY_RECYCLING_MAP[c.slug];
    if (key && byKey.has(key)) toMap.push({ slug: c.slug, key });
    else unmapped.push(c);
  }

  console.log(`\nקטגוריות: ${mapped} כבר ממופות, ${toMap.length} למיפוי, ${unmapped.length} ללא מיפוי`);
  for (const m of toMap) console.log(`  → ${m.slug} = ${m.key}`);

  if (write) {
    for (const m of toMap) {
      await db.category.update({
        where: { slug: m.slug },
        data: { recyclingCategoryId: byKey.get(m.key)! },
      });
    }
  }

  /* The part worth reading. A category with products and no group offers no
     removal at all, which for an electrical appliance is a legal duty the
     shop is not meeting — so it is printed loudest, sorted by how many
     products are behind it. A category with no products and no group is
     simply a decision nobody has needed to make yet. */
  const blanksWithStock = unmapped
    .filter((c) => c._count.products > 0)
    .sort((a, b) => b._count.products - a._count.products);

  if (blanksWithStock.length > 0) {
    console.log(`\nללא קטגוריית פינוי ויש בהן מוצרים — להחליט באדמין:`);
    for (const c of blanksWithStock) {
      console.log(`  ${String(c._count.products).padStart(4)}  ${c.slug} (${c.name})`);
    }
  }

  const products = await db.product.count();
  const covered = await db.product.count({
    where: {
      recyclingOptOut: false,
      OR: [{ recyclingCategoryId: { not: null } }, { category: { recyclingCategoryId: { not: null } } }],
    },
  });
  console.log(`\nכיסוי: ${covered} מתוך ${products} מוצרים (${Math.round((covered / products) * 100)}%)`);

  if (!write && (missing.length > 0 || toMap.length > 0)) {
    console.log(`\nלא נכתב כלום. להחלה: npm run fix:recycling`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
