import "server-only";
import { db } from "@/lib/db";
import { PUBLIC_PRODUCT_WHERE } from "@/lib/queries/products";
import { isBlockedImageHost } from "@/lib/inventory/blocked-image-hosts";

export type NavigableCategory = { slug: string; name: string };
export type NavigableDepartment = NavigableCategory & { children: NavigableCategory[] };

// Drives every category-facing nav on the site (mega menu, mobile menu,
// homepage tiles, footer) — a department only appears once it actually has
// at least one sub-category with real, in-stock, published products, and
// only those qualifying sub-categories are listed under it. No manual step
// needed when a new category gets imported: the next request just picks it
// up, and a department with nothing in stock quietly disappears again
// rather than linking to an empty page.
export async function getNavigableCategoryTree(): Promise<NavigableDepartment[]> {
  const departments = await db.category.findMany({
    where: { parentId: null },
    select: {
      slug: true,
      name: true,
      sortOrder: true,
      children: {
        where: { products: { some: PUBLIC_PRODUCT_WHERE } },
        select: { slug: true, name: true },
        orderBy: { name: "asc" },
      },
    },
    orderBy: { sortOrder: "asc" },
  });

  return departments
    .filter((d) => d.children.length > 0)
    .map((d) => ({ slug: d.slug, name: d.name, children: d.children }));
}

export type DepartmentCount = { slug: string; name: string; count: number };

/**
 * Every department with something to sell, with its live product count,
 * in catalogue order — the homepage's vertical department menu. Counted
 * through the public predicate so the number beside "מקררים" is the
 * number of fridges a visitor can actually open.
 */
export async function getDepartmentCounts(): Promise<DepartmentCount[]> {
  const departments = await db.category.findMany({
    where: { parentId: null },
    select: { id: true, slug: true, name: true, sortOrder: true, children: { select: { id: true } } },
    orderBy: { sortOrder: "asc" },
  });
  const counted = await Promise.all(
    departments.map(async (d) => ({
      slug: d.slug,
      name: d.name,
      count: await db.product.count({
        where: { ...PUBLIC_PRODUCT_WHERE, categoryId: { in: [d.id, ...d.children.map((c) => c.id)] } },
      }),
    })),
  );
  return counted.filter((d) => d.count > 0);
}

export type CategoryTile = { slug: string; name: string; imageUrl: string };

/**
 * The category grid's images, and why none of them is a URL any more.
 *
 * This used to be a map of category name to an image address, and most of
 * those addresses pointed at other Israeli retailers' servers — soferavi,
 * saynet, netoneto, ivory, superpharm, batico. Four of them are on the very
 * list in blocked-image-hosts.ts that exists to keep exactly those hosts out
 * of the catalog, so the rule the sync enforces on every product image was
 * being broken on the homepage, where it is most visible.
 *
 * It was not malice, it was drift: the tiles were asked to look consistent
 * ("make them all white"), our own catalog had no white product for some
 * categories, and the nearest real photo of the right thing was on somebody
 * else's site. The cost is not hypothetical — those are competitors serving
 * the images on our front page, they can change or withdraw them at any
 * moment, and every one of them is a hotlink we have no right to.
 *
 * So an override is now a SKU in our own catalog instead. It cannot point
 * off-site, its image follows the product if the photo is ever replaced, and
 * the fallback below covers it going out of stock.
 *
 * Only the categories whose automatic pick is genuinely the wrong thing are
 * listed. The ones that were overridden purely to be white are gone: the
 * automatic pick was already a correct photo of the right product, and a
 * consistent palette is not worth a hotlink.
 */
const CATEGORY_IMAGE_PICKS: Record<string, string> = {
  // Ranked top by isBestSeller/ratingCount and genuinely miscategorised: an
  // insect zapper sits above every real fan. This is the same Westinghouse
  // Talia (73179) the old override showed, taken from the brand importer's
  // site via our own product instead of from saynet's.
  מאווררים: "490043",
  // The old pick was a contact grill, not a toaster oven. Same Sauter
  // TO-2335 the override pointed at on netoneto — ours, and still white.
  "טוסטר אובן": "722335",
  // A milk frother ranked above every coffee machine.
  "מכונות אספרסו וקפה": "778702",
  // The automatic pick is a feature-callout graphic rather than a photo of
  // the mount itself.
  "מתקני תליה": "270006",
  // These three are corrections of kind, not of type: an integrated
  // dishwasher standing in for the freestanding category, a soundbar for
  // bookshelf speakers, a black glass hob where the category reads better
  // in white. All three replacements are our own products.
  "מדיח כלים": "143021",
  רמקולים: "500301",
  "כיריים גז": "0351",
};

// טאבונים has exactly one real product, and that product's only photo is
// actually an unrelated supplier logo, not the appliance itself — no real
// product photo exists for this category at all right now, so it's
// dropped rather than shown with a wrong image.
const CATEGORY_EXCLUDED = new Set(["טאבונים"]);

/**
 * Real per-category photos, and never a placeholder.
 *
 * The tile is that category's own product's own photo, read fresh on each
 * call, so it cannot go stale or be invented. A category with nothing in
 * stock has no real photo to show and no page worth linking to, so it is
 * dropped rather than filled in.
 *
 * Candidates are taken several deep and the first one on an allowed host
 * wins. That is not belt-and-braces: sarig.com and cdn.shopify.com are on
 * the blocked list and still sit on ~180 product images that predate it, so
 * "the top product in this category" can land on one at any time. Filtering
 * here means the homepage cannot serve a competitor's image even by
 * accident.
 */
export async function getCategoryTilesWithImages(): Promise<CategoryTile[]> {
  const categories = await db.category.findMany({
    where: { parentId: { not: null } },
    select: {
      id: true,
      slug: true,
      name: true,
      sortOrder: true,
      _count: { select: { products: { where: PUBLIC_PRODUCT_WHERE } } },
    },
    orderBy: { sortOrder: "asc" },
  });
  const populated = categories.filter((c) => c._count.products > 0 && !CATEGORY_EXCLUDED.has(c.name));

  const tiles = await Promise.all(
    populated.map(async (c): Promise<CategoryTile | null> => {
      const picked = CATEGORY_IMAGE_PICKS[c.name];
      if (picked) {
        const override = await db.product.findFirst({
          where: { sku: picked, ...PUBLIC_PRODUCT_WHERE },
          select: { images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } } },
        });
        const url = override?.images[0]?.url;
        // A sold-out or de-listed override falls through to the automatic
        // pick rather than blanking the tile. The wrong-but-real photo the
        // override was correcting is better than a hole in the grid.
        if (url && !isBlockedImageHost(url)) return { slug: c.slug, name: c.name, imageUrl: url };
      }

      const products = await db.product.findMany({
        where: { categoryId: c.id, ...PUBLIC_PRODUCT_WHERE },
        orderBy: [{ isBestSeller: "desc" }, { ratingCount: "desc" }],
        take: 8,
        select: { images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } } },
      });
      const imageUrl = products
        .map((p) => p.images[0]?.url)
        .find((url): url is string => Boolean(url) && !isBlockedImageHost(url!));

      return imageUrl ? { slug: c.slug, name: c.name, imageUrl } : null;
    })
  );

  return tiles.filter((t): t is CategoryTile => t !== null);
}
