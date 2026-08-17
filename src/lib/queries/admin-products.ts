import "server-only";
import { db } from "@/lib/db";

export async function getAdminProducts(filters: {
  search?: string;
  categorySlug?: string;
  stockStatus?: string;
  availability?: "IN_STOCK" | "OUT_OF_STOCK"; // coarser than stockStatus — groups LOW_STOCK/SUPPLIER_STOCK etc. in with "has stock"
  sort?: "updated" | "stock_asc" | "stock_desc";
  page?: number;
  pageSize?: number;
}) {
  const where: Record<string, unknown> = {};
  if (filters.search) {
    const s = filters.search.trim();
    where.OR = [{ title: { contains: s } }, { sku: { contains: s } }, { model: { contains: s } }];
  }
  if (filters.categorySlug) where.category = { slug: filters.categorySlug };
  if (filters.stockStatus && filters.stockStatus !== "ALL") where.stockStatus = filters.stockStatus;
  if (filters.availability === "IN_STOCK") where.stockQty = { gt: 0 };
  if (filters.availability === "OUT_OF_STOCK") where.stockQty = { lte: 0 };

  const orderBy =
    filters.sort === "stock_asc"
      ? { stockQty: "asc" as const }
      : filters.sort === "stock_desc"
        ? { stockQty: "desc" as const }
        : { updatedAt: "desc" as const };

  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 25;

  const [products, total] = await Promise.all([
    db.product.findMany({
      where,
      include: { brand: true, category: true },
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.product.count({ where }),
  ]);

  return { products, total };
}

export async function getStockSummary() {
  const [total, inStock, outOfStock, unitsInStockAgg] = await Promise.all([
    db.product.count(),
    db.product.count({ where: { stockQty: { gt: 0 } } }),
    db.product.count({ where: { stockQty: { lte: 0 } } }),
    db.product.aggregate({ _sum: { stockQty: true }, where: { stockQty: { gt: 0 } } }),
  ]);
  return { total, inStock, outOfStock, totalUnits: unitsInStockAgg._sum.stockQty ?? 0 };
}

export async function getFormOptions() {
  const [brands, categories, suppliers] = await Promise.all([
    db.brand.findMany({ orderBy: { name: "asc" } }),
    db.category.findMany({ where: { parentId: { not: null } }, orderBy: { name: "asc" } }),
    db.supplier.findMany({ orderBy: { name: "asc" } }),
  ]);
  return { brands, categories, suppliers };
}

export async function getAdminProductById(id: string) {
  return db.product.findUnique({ where: { id } });
}
