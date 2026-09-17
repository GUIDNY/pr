import "server-only";
import { db } from "@/lib/db";

/**
 * What the removal settings screen reads.
 *
 * Three questions, in the order somebody actually asks them: which equipment
 * groups exist, which shop categories point at them, and which products are
 * still getting no offer at all. The third is the one that matters — an
 * electrical appliance with no group is a legal duty the shop is not meeting,
 * and it is invisible everywhere else in the back office.
 */

export async function getRecyclingGroups() {
  return db.recyclingCategory.findMany({
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    include: { _count: { select: { categories: true, products: true } } },
  });
}

export async function getCategoryRecyclingMapping() {
  const categories = await db.category.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      recyclingCategoryId: true,
      parent: { select: { name: true } },
      _count: { select: { products: true } },
    },
    orderBy: [{ parent: { sortOrder: "asc" } }, { sortOrder: "asc" }, { name: "asc" }],
  });

  /* Unmapped categories that actually hold products first, biggest first.
     Everything else keeps the tree's own order. A screen sorted purely by
     the tree buries the twenty-four products nobody has decided about
     between forty rows that are already settled. */
  return categories.sort((a, b) => {
    const aOpen = !a.recyclingCategoryId && a._count.products > 0;
    const bOpen = !b.recyclingCategoryId && b._count.products > 0;
    if (aOpen !== bOpen) return aOpen ? -1 : 1;
    if (aOpen && bOpen) return b._count.products - a._count.products;
    return 0;
  });
}

/**
 * Live products that would be offered no removal, because neither they nor
 * their category names an equipment group.
 *
 * Live only — published, in stock, with a photograph — because that is what a
 * customer can actually reach and therefore what the duty attaches to. The
 * two thousand rows behind PUBLIC_PRODUCT_WHERE are a different, larger list
 * and would bury this one.
 *
 * Capped. This is a screen for working through a backlog, not a report; if it
 * ever runs long the answer is to map the category, which fixes them in one
 * action rather than eighty.
 */
export async function getProductsWithoutRemoval(take = 100) {
  return db.product.findMany({
    where: {
      isPublished: true,
      stockQty: { gt: 0 },
      recyclingOptOut: false,
      recyclingCategoryId: null,
      category: { recyclingCategoryId: null },
    },
    select: {
      id: true,
      title: true,
      sku: true,
      slug: true,
      category: { select: { name: true, slug: true } },
    },
    orderBy: [{ categoryId: "asc" }, { title: "asc" }],
    take,
  });
}

/** Products somebody has already decided about by hand — an override or an
    opt-out. Listed so a decision can be seen and undone, which is the half
    that is usually missing from a screen like this. */
export async function getProductRemovalOverrides() {
  return db.product.findMany({
    where: { OR: [{ recyclingCategoryId: { not: null } }, { recyclingOptOut: true }] },
    select: {
      id: true,
      title: true,
      sku: true,
      slug: true,
      recyclingOptOut: true,
      recyclingCategoryId: true,
      recyclingCategory: { select: { label: true } },
      category: { select: { name: true } },
    },
    orderBy: { title: "asc" },
    take: 200,
  });
}

/** How much of the live catalogue currently carries an offer. The one number
    that says whether this feature is doing its job. */
export async function getRemovalCoverage() {
  const live = { isPublished: true, stockQty: { gt: 0 } } as const;
  const [total, covered] = await Promise.all([
    db.product.count({ where: live }),
    db.product.count({
      where: {
        ...live,
        recyclingOptOut: false,
        OR: [{ recyclingCategoryId: { not: null } }, { category: { recyclingCategoryId: { not: null } } }],
      },
    }),
  ]);
  return { total, covered };
}
