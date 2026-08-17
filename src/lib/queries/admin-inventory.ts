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

// Groups open alerts by their actual reason (not a single generic "needs
// review" bucket) so the admin sees exactly what's wrong and how many —
// clicking a group filters the table straight to those products.
export async function getAttentionGroups() {
  const groups = await db.inventoryAlert.groupBy({
    by: ["type"],
    _count: true,
    where: { isResolved: false },
    orderBy: { _count: { type: "desc" } },
  });
  return groups.map((g) => ({ type: g.type, count: g._count }));
}

export type InventoryTableFilters = {
  search?: string;
  categorySlug?: string;
  brandId?: string;
  status?: StockStatus | "ALL";
  sourceId?: string;
  sourceSheet?: string;
  publishStatus?: "PUBLISHED" | "UNPUBLISHED" | "ALL";
  alertType?: string;
  hasAnyAlert?: boolean;
  view?: "ALL" | "NEEDS_ATTENTION" | "LOW_STOCK" | "READY_TO_PUBLISH" | "PUBLISHED" | "UNPUBLISHED";
  changedSince?: Date;
  sort?: "updated" | "price_desc" | "price_asc" | "stock_desc" | "stock" | "title" | "synced" | "brand" | "model" | "category";
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
    alertType,
    hasAnyAlert,
    view,
    changedSince,
    sort = "updated",
    page = 1,
    pageSize = 25,
  } = filters;

  const where: Record<string, unknown> = { sourceId: { not: null } };

  if (alertType) where.alerts = { some: { type: alertType, isResolved: false } };
  else if (hasAnyAlert) where.alerts = { some: { isResolved: false } };

  switch (view) {
    case "NEEDS_ATTENTION":
      where.alerts = { some: { isResolved: false } };
      break;
    case "LOW_STOCK":
      where.stockStatus = "LOW_STOCK";
      break;
    case "READY_TO_PUBLISH":
      where.isPublished = false;
      where.stockQty = { gt: 0 };
      where.price = { gt: 0 };
      where.alerts = { none: { isResolved: false } };
      break;
    case "PUBLISHED":
      where.isPublished = true;
      break;
    case "UNPUBLISHED":
      where.isPublished = false;
      break;
    default:
      break;
  }

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
      ? { stockQty: "asc" }
      : sort === "stock_desc"
        ? { stockQty: "desc" }
        : sort === "price_asc"
          ? { price: "asc" }
          : sort === "price_desc"
            ? { price: "desc" }
            : sort === "brand"
              ? { brand: { name: "asc" } }
              : sort === "model"
                ? { model: "asc" }
                : sort === "title"
                  ? { title: "asc" }
                  : sort === "category"
                    ? { category: { name: "asc" } }
                    : sort === "synced"
                      ? { createdAt: "desc" }
                      : { updatedAt: "desc" };

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
        _count: { select: { alerts: { where: { isResolved: false } } } },
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
