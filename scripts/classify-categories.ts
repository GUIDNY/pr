// Moves products that are sitting on a department node into the leaf
// category their own text names, across every department. See
// src/lib/inventory/category-rules.ts for the rules and why they are
// ordered the way they are.
//
//   npm run fix:categories                          # dry run, whole site
//   npm run fix:categories -- --department=laundry  # dry run, one department
//   npm run fix:categories -- --apply               # writes, after a backup
//
// Only products currently on a department are considered. Anything already
// in a leaf is left alone: a person or the enrichment agent put it there,
// and re-deriving it is how a catalog gets rewritten out from under the
// people maintaining it.
//
// A category is effectively permanent once set — the sync stops re-deriving
// title and category for an ENRICHED product — so this prints what it would
// do and changes nothing until --apply, and --apply writes a CSV of every
// move first.
import "dotenv/config";
import { writeFileSync } from "fs";
import { db } from "../src/lib/db";
import { classifyProduct, CATEGORY_RULES } from "../src/lib/inventory/category-rules";

const APPLY = process.argv.includes("--apply");
const ONLY = process.argv.find((a) => a.startsWith("--department="))?.split("=")[1];
const SHOW = process.argv.includes("--show");

type Move = {
  productId: string;
  sku: string;
  title: string;
  department: string;
  to: string;
  from: "title" | "description";
  alsoMatched: string;
  live: boolean;
};

async function main() {
  const departments = await db.category.findMany({
    where: { parentId: null, ...(ONLY ? { slug: ONLY } : {}) },
    select: { id: true, slug: true, name: true, children: { select: { id: true, slug: true } } },
  });

  const moves: Move[] = [];
  const unmatched: { department: string; sku: string; title: string }[] = [];
  let considered = 0;

  for (const dept of departments) {
    const leafIdBySlug = new Map(dept.children.map((c) => [c.slug, c.id]));
    const parked = await db.product.findMany({
      where: { categoryId: dept.id },
      select: {
        id: true, sku: true, title: true, description: true, isPublished: true, stockQty: true,
        images: { select: { id: true }, take: 1 },
      },
    });
    if (parked.length === 0) continue;
    considered += parked.length;

    for (const p of parked) {
      const result = classifyProduct(dept.slug, p.title ?? "", p.description ?? "");
      // A rule can only name a leaf that exists under this department.
      if (!result.slug || !leafIdBySlug.has(result.slug)) {
        unmatched.push({ department: dept.slug, sku: p.sku, title: p.title ?? "" });
        continue;
      }
      moves.push({
        productId: p.id,
        sku: p.sku,
        title: p.title ?? "",
        department: dept.slug,
        to: result.slug,
        from: result.from!,
        alsoMatched: result.alsoMatched.join("|"),
        live: p.isPublished && p.stockQty > 0 && p.images.length > 0,
      });
    }
  }

  const byDept = new Map<string, Move[]>();
  for (const m of moves) byDept.set(m.department, [...(byDept.get(m.department) ?? []), m]);

  console.log(`products sitting on a department   ${considered}`);
  console.log(`  would move into a leaf           ${moves.length}`);
  console.log(`  no type in title or description  ${unmatched.length}`);
  console.log(`  departments with no rules yet    ${departments.filter((d) => !CATEGORY_RULES[d.slug]).map((d) => d.slug).join(", ") || "none"}`);

  for (const [dept, list] of [...byDept].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n${dept}  (${list.length})`);
    const counts = new Map<string, { n: number; fromDesc: number; live: number }>();
    for (const m of list) {
      const c = counts.get(m.to) ?? { n: 0, fromDesc: 0, live: 0 };
      counts.set(m.to, {
        n: c.n + 1,
        fromDesc: c.fromDesc + (m.from === "description" ? 1 : 0),
        live: c.live + (m.live ? 1 : 0),
      });
    }
    for (const [slug, c] of [...counts].sort((a, b) => b[1].n - a[1].n)) {
      console.log(`  ${slug.padEnd(28)} ${String(c.n).padStart(4)}   (${c.fromDesc} from description, ${c.live} live)`);
    }
    // Where more than one rule matched, the order decided it. Those are the
    // rows worth reading before applying.
    const overlapping = list.filter((m) => m.alsoMatched);
    if (overlapping.length > 0) {
      console.log(`  ${overlapping.length} matched more than one rule — order decided:`);
      for (const m of overlapping.slice(0, 8)) {
        console.log(`    ${m.sku.padEnd(9)} -> ${m.to.padEnd(24)} (also: ${m.alsoMatched})  ${m.title.slice(0, 40)}`);
      }
    }
  }

  if (SHOW && unmatched.length > 0) {
    console.log(`\nno type found (${unmatched.length}):`);
    for (const u of unmatched.slice(0, 60)) console.log(`  ${u.department.padEnd(24)} ${u.sku.padEnd(9)} ${u.title.slice(0, 50)}`);
  }

  if (!APPLY) {
    console.log(`\n(dry run — nothing written. re-run with --apply to move all ${moves.length}.)`);
    return;
  }
  if (moves.length === 0) return;

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = `category-backfill-backup-${stamp}.csv`;
  writeFileSync(
    backup,
    ["productId,sku,fromDepartment,toCategory,decidedBy,alsoMatched,title"]
      .concat(
        moves.map((m) =>
          [m.productId, m.sku, m.department, m.to, m.from, m.alsoMatched, m.title]
            .map((v) => `"${String(v).replace(/"/g, '""')}"`)
            .join(","),
        ),
      )
      .join("\n"),
    "utf8",
  );
  console.log(`\nbackup written: ${backup}`);

  const leafIds = new Map<string, string>();
  for (const dept of departments) for (const c of dept.children) leafIds.set(`${dept.slug}/${c.slug}`, c.id);

  let written = 0;
  for (const m of moves) {
    const categoryId = leafIds.get(`${m.department}/${m.to}`);
    if (!categoryId) continue;
    await db.product.update({ where: { id: m.productId }, data: { categoryId } });
    written++;
  }
  console.log(`moved ${written} products. categoryId only — no other field was touched.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
