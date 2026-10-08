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
};

export type PriceListFilter = "ALL" | "PUBLISHED" | "NO_COST" | "BELOW_COST";

export async function getPriceList(opts: {
  search?: string;
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
  if (opts.filter === "PUBLISHED") where.isPublished = true;
  if (opts.filter === "NO_COST") where.supplierCost = null;
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
  }));

  return { rows, total, page, pageSize };
}

/** The products sold for less than they cost. The one filter that pays for
    the screen on its own, so it is a column comparison in SQL rather than
    an approximation in TypeScript. */
async function belowCostIds(): Promise<string[]> {
  const found = await db.$queryRaw<{ id: string }[]>`
    select id from "Product" where "supplierCost" is not null and price < "supplierCost"
  `;
  return found.map((r) => r.id);
}

export async function getBelowCostCount(): Promise<number> {
  return (await belowCostIds()).length;
}
