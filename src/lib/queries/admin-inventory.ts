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
    missingSku,
    changedToday,
    unresolvedAlerts,
  ] = await Promise.all([
    // "Total products" means what it says on the inventory page's summary
    // bar: real, currently-in-stock products — not every row ever imported.
    db.product.count({ where: { sourceId: { not: null }, stockQty: { gt: 0 } } }),
    db.product.count({ where: { sourceId: { not: null }, stockStatus: "IN_STOCK" } }),
    db.product.count({ where: { sourceId: { not: null }, stockStatus: "OUT_OF_STOCK" } }),
    db.product.count({ where: { sourceId: { not: null }, stockStatus: "LOW_STOCK" } }),
    db.product.count({ where: { sourceId: { not: null }, stockStatus: "SUPPLIER_STOCK" } }),
    db.product.count({ where: { sourceId: { not: null }, stockStatus: "DISPLAY_ONLY" } }),
    db.product.count({ where: { sourceId: { not: null }, stockStatus: "NEEDS_REVIEW" } }),
    db.product.count({ where: { sourceId: { not: null }, stockQty: { gt: 0 }, isTemporarySku: true } }),
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
    missingSku,
    changedToday,
    unresolvedAlerts,
    latestRun,
    productsAddedLastSync: latestRun?.productsAdded ?? 0,
    productsMissingLastSync: latestRun?.productsMissing ?? 0,
  };
}

// One card per sheet/tab that has imported products — this is the "which
// tab in the source file" level (e.g. "רמקולים בידוריות ואוזניות", "מוצרי
// תלייה וכבלים"), one level below the file/source itself. Scoped to a
// source when one's selected; omitted, covers every sheet across every
// connected file.
export async function getSheetSummaryCards(sourceId?: string) {
  const scope = sourceId ? { sourceId, stockQty: { gt: 0 } } : { sourceId: { not: null }, stockQty: { gt: 0 } };
  const rows = await db.product.groupBy({
    by: ["sourceSheet"],
    where: { ...scope, sourceSheet: { not: null } },
    _count: true,
    orderBy: { sourceSheet: "asc" },
  });
  return rows.map((r) => ({ sourceSheet: r.sourceSheet as string, count: r._count }));
}

// One card per category that has imported products — architecture supports
// many categories even though only a couple are populated today. Each card
// gives an employee the "seconds to understand" summary the spec asks for:
// what category, how much is active, how much is missing a real SKU, how
// many units total. Optionally scoped to a single source and/or a single
// sheet within it — omitted, this covers every category combined.
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
  hasTemporarySku?: boolean;
  view?: "ALL" | "NEEDS_ATTENTION" | "LOW_STOCK" | "READY_TO_PUBLISH" | "PUBLISHED" | "UNPUBLISHED";
  changedSince?: Date;
  sort?:
    | "updated"
    | "price_desc"
    | "price_asc"
    | "cost_desc"
    | "cost_asc"
    | "stock_desc"
    | "stock"
    | "title"
    | "sku"
    | "synced"
    | "brand"
    | "model"
    | "category";
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
    hasTemporarySku,
    view,
    changedSince,
    sort = "updated",
    page = 1,
    pageSize = 25,
  } = filters;

  // Zero-stock products don't belong in inventory management at all — they
  // never show here, full stop, not even behind a filter toggle.
  const where: Record<string, unknown> = { sourceId: { not: null }, stockQty: { gt: 0 } };

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
  if (hasTemporarySku) where.isTemporarySku = true;

  const orderBy: Record<string, unknown> =
    sort === "stock"
      ? { stockQty: "asc" }
      : sort === "stock_desc"
        ? { stockQty: "desc" }
        : sort === "price_asc"
          ? { price: "asc" }
          : sort === "price_desc"
            ? { price: "desc" }
            : sort === "cost_asc"
              ? { supplierCost: "asc" }
              : sort === "cost_desc"
                ? { supplierCost: "desc" }
                : sort === "sku"
                  ? { sku: "asc" }
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
        inventoryLines: { orderBy: { label: "asc" } },
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
      where: { products: { some: { sourceId: { not: null }, stockQty: { gt: 0 } } } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.inventorySource.findMany({ orderBy: { filename: "asc" } }),
    db.category.findMany({
      where: { products: { some: { sourceId: { not: null }, stockQty: { gt: 0 } } } },
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

const REVIEW_PRODUCT_SELECT = {
  id: true,
  title: true,
  sku: true,
  slug: true,
  stockQty: true,
  brand: { select: { name: true } },
  category: { select: { name: true } },
} as const;

function withNonNullProduct<T extends { product: unknown }>(alerts: T[]) {
  return alerts.filter((a): a is T & { product: NonNullable<T["product"]> } => a.product !== null);
}

// The general "טיפול" list. Three sources feed it, all via open alerts
// (not a direct product query) so this always matches exactly what the
// reconcilers/action consider in-need-of-attention, with no risk of drift:
//  - URGENT_MISSING_MEDIA — no photo *and* no spec, so the site hid it
//    (reconcileUrgentMissingMedia in lib/inventory/sync.ts)
//  - MISSING_IMAGE — no photo but enough spec to stay published, so it is
//    live on a placeholder tile (reconcileMissingImage, same file)
//  - NEW_FROM_SOURCE — a row the sheet just produced a product for, with a
//    raw title, a broad category and no content yet
//  - MANUAL_ATTENTION — an admin flagged it by hand from the product page
// Sorted so the hidden products come before the merely photo-less ones;
// a product only ever holds one of the two automatic alerts, never both.
export async function getAttentionProducts() {
  const alerts = await db.inventoryAlert.findMany({
    where: {
      type: { in: ["NEW_FROM_SOURCE", "URGENT_MISSING_MEDIA", "MISSING_IMAGE", "MANUAL_ATTENTION"] },
      isResolved: false,
    },
    orderBy: { createdAt: "desc" },
    include: { product: { select: REVIEW_PRODUCT_SELECT } },
  });
  // Explicit rank rather than ordering by the severity string: the column is
  // a plain String, and "CRITICAL" < "INFO" < "WARNING" alphabetically puts
  // INFO above WARNING, which is not the order anyone means by severity.
  const rank: Record<string, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };
  return withNonNullProduct(alerts).sort(
    (a, b) => (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3),
  );
}

// The "טיפול דחוף" list: only products an admin explicitly sent there via
// the button on the product page (setProductReviewFlagAction(..., "URGENT"))
// — never populated automatically, unlike getAttentionProducts above.
export async function getUrgentReviewProducts() {
  const alerts = await db.inventoryAlert.findMany({
    where: { type: "MANUAL_URGENT", isResolved: false },
    orderBy: { createdAt: "desc" },
    include: { product: { select: REVIEW_PRODUCT_SELECT } },
  });
  return withNonNullProduct(alerts);
}

// Which manual flag (if any) is currently open for one product — read on
// the product page itself so the admin-only flag button can show its
// current state instead of always starting from "none".
export async function getProductReviewFlag(productId: string): Promise<"NONE" | "ATTENTION" | "URGENT"> {
  const alert = await db.inventoryAlert.findFirst({
    where: { productId, type: { in: ["MANUAL_ATTENTION", "MANUAL_URGENT"] }, isResolved: false },
    select: { type: true },
  });
  if (!alert) return "NONE";
  return alert.type === "MANUAL_URGENT" ? "URGENT" : "ATTENTION";
}

export async function getInventoryProductDetail(id: string) {
  return db.product.findUnique({
    where: { id },
    include: {
      brand: true,
      category: true,
      source: true,
      images: { orderBy: { sortOrder: "asc" } },
      inventoryLines: { orderBy: { label: "asc" } },
      changeEvents: { orderBy: { createdAt: "desc" }, take: 20 },
      alerts: { where: { isResolved: false }, orderBy: { createdAt: "desc" } },
      attributeValues: { include: { attribute: true }, orderBy: { attribute: { sortOrder: "asc" } } },
    },
  });
}
