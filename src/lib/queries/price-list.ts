import "server-only";
import { db } from "@/lib/db";

/**
 * The price sheet: what a product costs us and what it sells for.
 *
 * A `select` and not an `include`, and the columns are counted. The last
 * time a screen in this admin pulled whole Product rows it cost four days
 * of Supabase storage egress — see the note in CLAUDE.md. A row here is
 * nine fields.
 *
 * supplierCost is null on 81 of the 2,189 products: those came in before
 * the column existed or through a sheet that did not carry one. Null is
 * shown as an absence rather than as zero, because a zero cost reads as
 * "free" and would make the margin column a lie.
 */
export type PriceRow = {
  id: string;
  slug: string;
  sku: string;
  title: string;
  price: number;
  supplierCost: number | null;
  stockQty: number;
  isPublished: boolean;
  brand: string;
  category: string;
};

export type PriceListFilter = "ALL" | "PUBLISHED" | "NO_PRICE" | "NO_COST" | "BELOW_COST";

export async function getPriceList(opts: {
  search?: string;
  categorySlug?: string;
  filter?: PriceListFilter;
  page?: number;
  pageSize?: number;
}): Promise<{ rows: PriceRow[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(200, Math.max(10, opts.pageSize ?? 50));

  const where: Record<string, unknown> = {};
  const search = opts.search?.trim();
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { sku: { contains: search, mode: "insensitive" } },
      { model: { contains: search, mode: "insensitive" } },
    ];
  }
  if (opts.categorySlug) where.category = { slug: opts.categorySlug };
  if (opts.filter === "PUBLISHED") where.isPublished = true;
  if (opts.filter === "NO_COST") where.supplierCost = null;
  /* A product with no price at all. Its own filter because it is its own
     problem: 94 of them, none published, and they were being counted as
     "sold below cost" when the truth is that nobody has priced them. */
  if (opts.filter === "NO_PRICE") where.price = { lte: 0 };
  /* Sold for less than it cost. Prisma cannot compare two columns in a
     `where`, and filtering the page after the fact would make the count at
     the top mean "however many happen to be on page one" — so the ids come
     from the database and the page is taken from them. */
  if (opts.filter === "BELOW_COST") {
    where.id = { in: await belowCostIds() };
  }

  const [found, total] = await Promise.all([
    db.product.findMany({
      where,
      select: {
        id: true,
        slug: true,
        sku: true,
        title: true,
        price: true,
        supplierCost: true,
        stockQty: true,
        isPublished: true,
        brand: { select: { name: true } },
        category: { select: { name: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.product.count({ where }),
  ]);

  const rows = found.map((p) => ({
    id: p.id,
    slug: p.slug,
    sku: p.sku,
    title: p.title,
    price: p.price,
    supplierCost: p.supplierCost,
    stockQty: p.stockQty,
    isPublished: p.isPublished,
    brand: p.brand?.name ?? "",
    category: p.category?.name ?? "",
  }));

  return { rows, total, page, pageSize };
}

/**
 * The products sold for less than they cost.
 *
 * `price > 0` is the whole correction. Without it this counted 48, and 37
 * of those were products with no price at all — a zero is cheaper than any
 * cost, so every unpriced row looked like a loss. The real number is 11,
 * and the other 37 belong under NO_PRICE, which is a different thing to do
 * something about.
 *
 * A column comparison in SQL rather than an approximation in TypeScript,
 * because Prisma cannot compare two columns in a `where`.
 */
async function belowCostIds(): Promise<string[]> {
  const found = await db.$queryRaw<{ id: string }[]>`
    select id from "Product"
    where "supplierCost" is not null and price > 0 and price < "supplierCost"
  `;
  return found.map((r) => r.id);
}

/** The categories that have products, for the picker. */
export async function getPriceListCategories(): Promise<{ slug: string; name: string; count: number }[]> {
  const categories = await db.category.findMany({
    select: { slug: true, name: true, _count: { select: { products: true } } },
    orderBy: { name: "asc" },
  });
  return categories
    .filter((c) => c._count.products > 0)
    .map((c) => ({ slug: c.slug, name: c.name, count: c._count.products }));
}

export async function getBelowCostCount(): Promise<number> {
  return (await belowCostIds()).length;
}
