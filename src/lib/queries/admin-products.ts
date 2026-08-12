import "server-only";
import { db } from "@/lib/db";

export async function getAdminProducts(filters: {
  search?: string;
  categorySlug?: string;
  stockStatus?: string;
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

  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 25;

  const [products, total] = await Promise.all([
    db.product.findMany({
      where,
      include: { brand: true, category: true },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.product.count({ where }),
  ]);

  return { products, total };
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
