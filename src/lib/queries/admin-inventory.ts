import "server-only";
import { db } from "@/lib/db";
import type { StockStatus } from "@/lib/enums";

export async function getInventorySummary() {
  const latestRun = await db.inventorySyncRun.findFirst({
    where: { status: { in: ["SUCCESS", "NO_CHANGES"] } },
    orderBy: { startedAt: "desc" },
  });

  const [
    totalProducts,
    inStock,
    outOfStock,
    lowStock,
    supplierStock,
    displayOnly,
    needsReview,
    changedToday,
    unresolvedAlerts,
  ] = await Promise.all([
    db.product.count({ where: { sourceId: { not: null } } }),
    db.product.count({ where: { sourceId: { not: null }, stockStatus: "IN_STOCK" } }),
    db.product.count({ where: { sourceId: { not: null }, stockStatus: "OUT_OF_STOCK" } }),
    db.product.count({ where: { sourceId: { not: null }, stockStatus: "LOW_STOCK" } }),
    db.product.count({ where: { sourceId: { not: null }, stockStatus: "SUPPLIER_STOCK" } }),
    db.product.count({ where: { sourceId: { not: null }, stockStatus: "DISPLAY_ONLY" } }),
    db.product.count({ where: { sourceId: { not: null }, stockStatus: "NEEDS_REVIEW" } }),
    db.inventoryChangeEvent.count({ where: { createdAt: { gte: new Date(Date.now() - 86400000) } } }),
    db.inventoryAlert.count({ where: { isResolved: false } }),
  ]);

  return {
    totalProducts,
    inStock,
    outOfStock,
    lowStock,
    supplierStock,
    displayOnly,
    needsReview,
    changedToday,
    unresolvedAlerts,
    latestRun,
    productsAddedLastSync: latestRun?.productsAdded ?? 0,
    productsMissingLastSync: latestRun?.productsMissing ?? 0,
  };
}

export type InventoryTableFilters = {
  search?: string;
  categorySlug?: string;
  brandId?: string;
  status?: StockStatus | "ALL";
  sourceId?: string;
  sourceSheet?: string;
  publishStatus?: "PUBLISHED" | "UNPUBLISHED" | "ALL";
  changedSince?: Date;
  sort?: "stock" | "price" | "brand" | "model" | "title" | "updated" | "synced" | "category";
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

export async function getInventoryProducts(filters: InventoryTableFilters) {
  const {
    search,
    categorySlug,
    brandId,
    status,
    sourceId,
    sourceSheet,
    publishStatus,
    changedSince,
    sort = "updated",
    sortDir = "desc",
    page = 1,
    pageSize = 25,
  } = filters;

  const where: Record<string, unknown> = { sourceId: { not: null } };

  if (search) {
    where.OR = [
      { sku: { contains: search, mode: "insensitive" } },
      { model: { contains: search, mode: "insensitive" } },
      { title: { contains: search, mode: "insensitive" } },
      { brand: { name: { contains: search, mode: "insensitive" } } },
    ];
  }
  if (categorySlug) where.category = { slug: categorySlug };
  if (brandId) where.brandId = brandId;
  if (status && status !== "ALL") where.stockStatus = status;
  if (sourceId) where.sourceId = sourceId;
  if (sourceSheet) where.sourceSheet = sourceSheet;
  if (publishStatus === "PUBLISHED") where.isPublished = true;
  if (publishStatus === "UNPUBLISHED") where.isPublished = false;
  if (changedSince) where.lastExcelSyncAt = { gte: changedSince };

  const orderBy: Record<string, unknown> =
    sort === "stock"
      ? { stockQty: sortDir }
      : sort === "price"
        ? { price: sortDir }
        : sort === "brand"
          ? { brand: { name: sortDir } }
          : sort === "model"
            ? { model: sortDir }
            : sort === "title"
              ? { title: sortDir }
              : sort === "category"
                ? { category: { name: sortDir } }
                : sort === "synced"
                  ? { lastExcelSyncAt: sortDir }
                  : { updatedAt: sortDir };

  const [products, total] = await Promise.all([
    db.product.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        brand: { select: { name: true } },
        category: { select: { name: true, slug: true } },
        source: { select: { filename: true, key: true } },
        images: { take: 1, orderBy: { sortOrder: "asc" } },
      },
    }),
    db.product.count({ where }),
  ]);

  return { products, total };
}

export async function getInventoryFilterOptions() {
  const [brands, sources, categories] = await Promise.all([
    db.brand.findMany({
      where: { products: { some: { sourceId: { not: null } } } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.inventorySource.findMany({ orderBy: { filename: "asc" } }),
    db.category.findMany({
      where: { products: { some: { sourceId: { not: null } } } },
      select: { slug: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return { brands, sources, categories };
}

export async function getRecentChanges(opts: { sourceId?: string; changeType?: string; page?: number; pageSize?: number }) {
  const { sourceId, changeType, page = 1, pageSize = 40 } = opts;
  const where: Record<string, unknown> = {};
  if (sourceId) where.sourceId = sourceId;
  if (changeType) where.changeType = changeType;

  const [events, total] = await Promise.all([
    db.inventoryChangeEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        product: { select: { id: true, title: true, model: true, sku: true } },
        source: { select: { filename: true } },
      },
    }),
    db.inventoryChangeEvent.count({ where }),
  ]);
  return { events, total };
}

export async function getSyncHistory(page = 1, pageSize = 20) {
  const [runs, total] = await Promise.all([
    db.inventorySyncRun.findMany({
      orderBy: { startedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { triggeredBy: { select: { name: true } } },
    }),
    db.inventorySyncRun.count(),
  ]);
  return { runs, total };
}

export async function getInventoryAlerts(opts: { resolved?: boolean; type?: string; page?: number; pageSize?: number }) {
  const { resolved = false, type, page = 1, pageSize = 40 } = opts;
  const where: Record<string, unknown> = { isResolved: resolved };
  if (type) where.type = type;

  const [alerts, total] = await Promise.all([
    db.inventoryAlert.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        product: { select: { id: true, title: true, sku: true } },
        source: { select: { filename: true } },
      },
    }),
    db.inventoryAlert.count({ where }),
  ]);
  return { alerts, total };
}

export async function getInventoryProductDetail(id: string) {
  return db.product.findUnique({
    where: { id },
    include: {
      brand: true,
      category: true,
      source: true,
      images: { orderBy: { sortOrder: "asc" } },
      changeEvents: { orderBy: { createdAt: "desc" }, take: 20 },
      alerts: { where: { isResolved: false }, orderBy: { createdAt: "desc" } },
    },
  });
}
