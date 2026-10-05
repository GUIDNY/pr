import "dotenv/config";
import { db } from "../src/lib/db";
import { classifyProduct } from "../src/lib/inventory/category-rules";

/**
 * Products sitting in the WRONG leaf — the gap classify-categories.ts leaves
 * open on purpose.
 *
 *   npm run check:leaf-categories
 *
 * That script only looks at products parked on a department node, and says
 * why: anything already in a leaf was put there by a person or the
 * enrichment agent, and re-deriving it is how a catalog gets rewritten out
 * from under the people maintaining it. Sound rule, one blind spot — a
 * product in the wrong leaf is in a leaf, so nothing ever looked at it
 * again.
 *
 * That blind spot cost the shop a shelf. 29 mixers sat in מעבדי מזון
 * וקוצצים and /category/mixers showed one product; 27 pop-up toasters sat
 * in טוסטר אובן and טוסטר קופץ ומצנם showed none. Five categories were
 * empty pages with stock behind them.
 *
 * So this reports and does not write. A category is effectively permanent
 * once set, the rules have false positives of their own (an accessory is
 * named after the thing it fits), and moving a product also means
 * re-pointing its spec values at the destination's attributes — none of
 * which belongs behind an --apply flag that a tired person runs at 6pm.
 */

type Row = { current: string; suggested: string; live: number; dead: number; examples: string[] };

async function main() {
  const leaves = await db.category.findMany({
    where: { parentId: { not: null } },
    select: { id: true, slug: true, name: true, parentId: true },
  });
  const byId = new Map(leaves.map((c) => [c.id, c]));

  const departments = await db.category.findMany({
    where: { parentId: null },
    select: { id: true, slug: true },
  });
  const deptById = new Map(departments.map((d) => [d.id, d.slug]));

  /** Walk up to the department, so a leaf nested two deep still resolves. */
  function departmentOf(categoryId: string): string | null {
    let node = byId.get(categoryId);
    let guard = 0;
    while (node && guard++ < 10) {
      if (!node.parentId) return null;
      const dept = deptById.get(node.parentId);
      if (dept) return dept;
      node = byId.get(node.parentId);
    }
    return null;
  }

  const products = await db.product.findMany({
    where: { categoryId: { in: leaves.map((c) => c.id) } },
    select: {
      title: true,
      isPublished: true,
      stockQty: true,
      categoryId: true,
      description: true,
      images: { select: { id: true }, take: 1 },
    },
  });

  const groups = new Map<string, Row>();

  for (const p of products) {
    if (!p.categoryId) continue;
    const dept = departmentOf(p.categoryId);
    if (!dept) continue;

    /* Title only. The description fallback is right for a product with no
       type in its name, and wrong here: a mixer's description mentions the
       food processor it replaces, and that is not a reason to move it. */
    const verdict = classifyProduct(dept, p.title, "");
    if (!verdict.slug) continue;

    const current = byId.get(p.categoryId)!;
    if (verdict.slug === current.slug) continue;

    const key = `${current.slug} → ${verdict.slug}`;
    const row = groups.get(key) ?? { current: current.name, suggested: verdict.slug, live: 0, dead: 0, examples: [] };
    if (p.isPublished && p.stockQty > 0 && p.images.length > 0) row.live++;
    else row.dead++;
    if (row.examples.length < 3) row.examples.push(p.title.slice(0, 70));
    groups.set(key, row);
  }

  const sorted = [...groups.entries()].sort((a, b) => b[1].live + b[1].dead - (a[1].live + a[1].dead));

  if (sorted.length === 0) {
    console.log("No product's title names a leaf other than the one it is in.");
  } else {
    const total = sorted.reduce((n, [, r]) => n + r.live + r.dead, 0);
    console.log(`${total} products whose title names a different leaf, in ${sorted.length} groups:\n`);
    for (const [key, row] of sorted) {
      console.log(`${row.live + row.dead}  (${row.live} live)  ${key}`);
      for (const ex of row.examples) console.log(`      ${ex}`);
    }
    console.log("\nRead before moving: an accessory is named after the thing it fits.");
  }

  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
