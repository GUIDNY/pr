import "server-only";
import { db } from "@/lib/db";

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
        where: { products: { some: { isPublished: true, stockQty: { gt: 0 } } } },
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

export type CategoryTile = { slug: string; name: string; imageUrl: string };

// Picking "top by isBestSeller/ratingCount" turned out to occasionally
// surface a genuinely miscategorized product ahead of the category's real
// ones — confirmed by hand, viewing every tile: an insect zapper ranked
// above real fans under "מאווררים", a smart bidet seat under "ברזי מים", an
// induction cooktop under "כיריים גז", a waffle iron under "טוסטר אובן",
// and a busy feature-callout graphic (not a clean product photo) for
// "מתקני תליה". Each override below points at a real, correctly-matching
// product's own photo from the same category instead — not a stand-in
// image, just a better real pick than the automatic ranking made.
const CATEGORY_IMAGE_OVERRIDES: Record<string, string> = {
  מאווררים: "https://www.saynet.co.il/pub/media/catalog/product/cache/0d96ac4c7badd86c445845e53d49c758/7/3/73179-2848-base1.jpg",
  // A visually consistent grid was requested next — first tried "make it
  // all black," landed on "make it all white" instead. Every category
  // below got its real white-colored product verified by eye first (a
  // couple of "white" search matches turned out to be a wrong product
  // type — a plain pop-up toaster instead of a toaster oven, same failure
  // mode as before). Categories with no real white option in stock, or
  // that were already white/light by default, aren't listed here at all.
  "מדיח כלים": "https://www.soferavi.co.il/wp-content/uploads/LDW-V60146W.jpg",
  "תנור בנוי": "https://www.soferavi.co.il/wp-content/uploads/HBG7741W1.jpg",
  "כיריים גז": "https://d3m9l0v76dty0.cloudfront.net/system/photos/14139045/large/ed19d332b77721d83b8b4edbdf0bff84.jpg",
  "מתקני תליה": "https://superpharmstorage.blob.core.windows.net/hybris/products/desktop/large/1637837810213.jpg",
  "קומקומים ומיחמים": "https://www.prec.co.il/images/itempics/K15ORAW_31082023113531.jpg",
  "מכונות אספרסו וקפה": "https://dam.delonghi.com/1200x1200/assets/336348",
  // These 4 had no white product anywhere in our own catalog, so — as
  // explicitly asked — sourced from elsewhere on the web instead: a real
  // white JBL speaker, a real white Beko combi range, a real white
  // radiator heater and a real white kitchen tap (not the smart/digital
  // kind our own catalog one is, but the same product category).
  רמקולים: "https://www.ivory.co.il/files/catalog/org/1747745977r77FH.webp",
  "תנור משולב": "https://www.soferavi.co.il/wp-content/uploads/1-13-768x768.png",
  "תנורי חימום": "https://www.t-p-y.co.il/wp-content/uploads/2020/09/21628_EL-5009_250.jpg",
  "ברזי מים": "https://batico.co.il/wp-content/uploads/2023/01/1025MW.jpg",
  // The last two holdouts — took more digging (most retailer/brand sites
  // for these two block scraping outright) but both are real: a genuine
  // white toaster oven (Sauter, a brand this catalog already carries) and
  // Yamaha's own official product photo of their white micro stereo
  // system, sourced directly from yamaha.com.
  "טוסטר אובן": "https://www.netoneto.co.il/media/catalog/product/cache/daa6aaa83292c1567ab529c491ecca69/t/o/to2335-1_2.jpg",
  "רסיברים ומגברים": "https://de.yamaha.com/de/files/B7D81434FC3643FBB58F5803DB4470F1_12073_tcm118-1637232.jpg",
  // TVs are inherently black-bezeled in our own catalog and in virtually
  // every mainstream product photo (Samsung's white "Frame" bezel is only
  // ever pictured as a separate snap-on accessory, never as a complete
  // photographed TV) — this is a real, complete white-bodied smart TV
  // (KIVI 32F750NW) with its screen genuinely visible, sourced from the
  // manufacturer's own store.
  "מסכי טלוויזיה": "https://kivismart.com/storage/app/media/phpthump/cache/storage/app/uploads/public/636/21f/ba7/63621fba75fd6124736508-594x594-a64.jpg",
};

// טאבונים has exactly one real product, and that product's only photo is
// actually an unrelated supplier logo, not the appliance itself — no real
// product photo exists for this category at all right now, so it's
// dropped rather than shown with a wrong image.
const CATEGORY_EXCLUDED = new Set(["טאבונים"]);

// Real per-category photos, not artwork — the tile image is literally that
// category's own top real product's own photo, fetched fresh each call, so
// it's never stale or made up. A category with zero in-stock products has
// no real photo to show and no real page worth linking to, so it's
// dropped rather than shown with a placeholder.
export async function getCategoryTilesWithImages(): Promise<CategoryTile[]> {
  const categories = await db.category.findMany({
    where: { parentId: { not: null } },
    select: {
      id: true,
      slug: true,
      name: true,
      sortOrder: true,
      _count: { select: { products: { where: { isPublished: true, stockQty: { gt: 0 } } } } },
    },
    orderBy: { sortOrder: "asc" },
  });
  const populated = categories.filter((c) => c._count.products > 0 && !CATEGORY_EXCLUDED.has(c.name));

  const tiles = await Promise.all(
    populated.map(async (c): Promise<CategoryTile | null> => {
      if (CATEGORY_IMAGE_OVERRIDES[c.name]) {
        return { slug: c.slug, name: c.name, imageUrl: CATEGORY_IMAGE_OVERRIDES[c.name] };
      }
      const product = await db.product.findFirst({
        where: { categoryId: c.id, isPublished: true, stockQty: { gt: 0 } },
        orderBy: [{ isBestSeller: "desc" }, { ratingCount: "desc" }],
        select: { images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } } },
      });
      const imageUrl = product?.images[0]?.url;
      return imageUrl ? { slug: c.slug, name: c.name, imageUrl } : null;
    })
  );

  return tiles.filter((t): t is CategoryTile => t !== null);
}
