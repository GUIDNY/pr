// Brings the Category rows' display names, icons and order back in line with
// src/lib/category-tree.ts.
//
// The tree is the source of truth for all three — there is no admin screen
// that edits a category name, so nothing else can have set them — but it is
// only ever read by prisma/seed.ts, which runs on a full reset. So renaming a
// category in the tree changed nothing on the live site, and the rename had
// to be typed into the database by hand. This is that step, done from the
// tree instead of from memory.
//
// Renames only. The slug is never touched: it is public in the category URL
// and in every link already shared. A category in the database that the tree
// does not know about is reported and left alone — deleting one would take
// its products' categoryId with it.
//
//   npm run fix:category-names              # dry run
//   npm run fix:category-names -- --apply
import "dotenv/config";
import { db } from "../src/lib/db";
import { CATEGORY_TREE } from "../src/lib/category-tree";

const APPLY = process.argv.includes("--apply");

type Want = { slug: string; name: string; icon: string | null; sortOrder: number; parentSlug: string | null };

async function main() {
  const want: Want[] = [];
  CATEGORY_TREE.forEach((dept, deptOrder) => {
    want.push({ slug: dept.slug, name: dept.name, icon: dept.icon, sortOrder: deptOrder, parentSlug: null });
    dept.children.forEach((child, childOrder) => {
      want.push({ slug: child.slug, name: child.name, icon: null, sortOrder: childOrder, parentSlug: dept.slug });
    });
  });

  const rows = await db.category.findMany({ select: { id: true, slug: true, name: true, icon: true, sortOrder: true } });
  const bySlug = new Map(rows.map((r) => [r.slug, r]));

  const changes: { slug: string; field: string; from: string; to: string; id: string }[] = [];
  const missing: string[] = [];

  for (const w of want) {
    const row = bySlug.get(w.slug);
    if (!row) {
      missing.push(w.slug);
      continue;
    }
    if (row.name !== w.name) changes.push({ slug: w.slug, field: "name", from: row.name, to: w.name, id: row.id });
    // icon is only set on departments; a leaf's null in the tree means "the
    // tree does not say", not "clear whatever is there".
    if (w.icon !== null && row.icon !== w.icon) changes.push({ slug: w.slug, field: "icon", from: row.icon ?? "", to: w.icon, id: row.id });
    if (row.sortOrder !== w.sortOrder) changes.push({ slug: w.slug, field: "sortOrder", from: String(row.sortOrder), to: String(w.sortOrder), id: row.id });
  }

  const knownSlugs = new Set(want.map((w) => w.slug));
  const extra = rows.filter((r) => !knownSlugs.has(r.slug));

  console.log(`categories in the tree      ${want.length}`);
  console.log(`  matched in the database   ${want.length - missing.length}`);
  console.log(`  missing from the database ${missing.length}${missing.length ? " — " + missing.join(", ") : ""}`);
  console.log(`in the database only        ${extra.length}${extra.length ? " — " + extra.map((e) => e.slug).join(", ") + "  (left alone)" : ""}`);
  console.log(`\nfields that differ          ${changes.length}`);
  for (const c of changes) {
    console.log(`  ${c.slug.padEnd(28)} ${c.field.padEnd(9)} ${c.from}  ->  ${c.to}`);
  }

  if (changes.length === 0) {
    console.log("\nnothing to do.");
    return;
  }
  if (!APPLY) {
    console.log(`\n(dry run — nothing written. re-run with --apply to write all ${changes.length}.)`);
    return;
  }

  const byId = new Map<string, Record<string, string | number>>();
  for (const c of changes) {
    const data = byId.get(c.id) ?? {};
    data[c.field] = c.field === "sortOrder" ? Number(c.to) : c.to;
    byId.set(c.id, data);
  }
  for (const [id, data] of byId) {
    await db.category.update({ where: { id }, data });
  }
  console.log(`\nupdated ${byId.size} categories. name, icon and sortOrder only — no slug, no product.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
