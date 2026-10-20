import "server-only";
import { db } from "@/lib/db";
import type { StockStatus } from "@/lib/enums";
import { imageIsFromBlockedHost } from "@/lib/inventory/blocked-image-hosts";
import { isSelfHosted } from "@/lib/inventory/image-migration";
import type { Prisma } from "@/generated/prisma/client";

/* From a price list, and only from a price list.
   This used to be `sourceId: { not: null }` — any source at all — and the
   difference was not academic: the summary bar read 1,593 in-stock products
   while the shop served 1,259, and 17 of the gap were products from four
   Google Sheet sources switched off in August that no sync could ever
   update. A summary bar that counts stock nothing maintains is a summary
   bar that cannot be reconciled with the shop, which is how an outage
   hides. The owner's rule as of 11 October: the only source is the price
   lists.

   At module scope because the fix was applied to the summary bar and not to
   the list printed directly beneath it, so the same screen showed 1,624 in
   one place and 1,640 in the other — sixteen products apart, every one of
   them from those same dead Google Sheet sources. Two numbers on one screen
   that answer the same question have to come from one definition, or the
   next person to reconcile them loses an afternoon. */
const FROM_A_PRICE_LIST = { source: { sourceType: "EXCEL", isActive: true } } as const;

/* And still carried by it. The owner's rule, 12 October: a product the
   price list no longer lists is not in stock, full stop. The quantity on
   the record is the last thing the sheet said before it stopped saying
   anything, and counting it made the summary bar claim 1,624 products in
   stock when 129 of those are ones the supplier has dropped and nobody is
   selling. The number stays on the record — if the supplier lists the
   product again the sync overwrites it from the sheet on that run — it just
   stops being counted as stock we have. */
const STILL_CARRIED = { ...FROM_A_PRICE_LIST, missingFromSourceSince: null } as const;
const IN_STOCK = { ...STILL_CARRIED, stockQty: { gt: 0 } } as const;

/* And a second question, which until 19 October had the same answer as the
   first and no longer does: how many can we actually sell.
   A product the price list still offers is sellable with nothing in a
   warehouse — someone rings the supplier — so "in stock" stopped being the
   count of what the shop can take money for. It is now 1,444 against 2,947,
   and the summary bar showed only the first, which is how a screen comes to
   be read as saying the catalogue did not grow when it had grown by 1,502.
   The same predicate as PUBLIC_PRODUCT_WHERE's sellability clause, written
   the same way round, so the back office and the storefront cannot disagree
   about what is for sale. */
/* Typed rather than `as const`, because Prisma will not take a readonly
   array for OR — the same reason PUBLIC_PRODUCT_WHERE declares its clause
   outside the object. */
const SELLABLE_OR: Prisma.ProductWhereInput[] = [
  { stockQty: { gt: 0 } },
  { sourceAvailability: "ORDERABLE" },
];
const SELLABLE = { ...STILL_CARRIED, OR: SELLABLE_OR } as const;

export async function getInventorySummary() {
  const latestRun = await db.inventorySyncRun.findFirst({
    where: { status: { in: ["SUCCESS", "NO_CHANGES"] } },
    orderBy: { startedAt: "desc" },
  });

  const [
    totalProducts,
    sellable,
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
    db.product.count({ where: IN_STOCK }),
    db.product.count({ where: SELLABLE }),
    db.product.count({ where: { ...STILL_CARRIED, stockStatus: "IN_STOCK" } }),
    db.product.count({ where: { ...STILL_CARRIED, stockStatus: "OUT_OF_STOCK" } }),
    db.product.count({ where: { ...STILL_CARRIED, stockStatus: "LOW_STOCK" } }),
    db.product.count({ where: { ...STILL_CARRIED, stockStatus: "SUPPLIER_STOCK" } }),
    db.product.count({ where: { ...STILL_CARRIED, stockStatus: "DISPLAY_ONLY" } }),
    db.product.count({ where: { ...STILL_CARRIED, stockStatus: "NEEDS_REVIEW" } }),
    db.product.count({ where: { ...IN_STOCK, isTemporarySku: true } }),
    db.inventoryChangeEvent.count({ where: { createdAt: { gte: new Date(Date.now() - 86400000) } } }),
    db.inventoryAlert.count({ where: { isResolved: false } }),
  ]);

  return {
    totalProducts,
    sellable,
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
  const where: Record<string, unknown> = { ...IN_STOCK };

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
    /* The price lists, and nothing else. Four Google Sheet sources were
       switched off in August and left 268 products behind that no sync
       could ever update; they stayed in every source picker in the back
       office, so the catalogue looked as though it had seven sources when
       three of them were doing the work. The owner's rule as of 11 October:
       "the only source is the price lists". */
    db.inventorySource.findMany({
      where: { sourceType: "EXCEL" },
      orderBy: { filename: "asc" },
    }),
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
  // Read for the one-line fix on the urgent queue, which needs the current
  // value to start its input from — never rendered as a price to a customer.
  price: true,
  model: true,
  brandId: true,
  // The first photo, so both queues can show the product instead of a generic
  // box. On "טיפול" that is the fastest way to tell the two halves of the list
  // apart: most of it is waiting for a photo, and the ones that already have
  // one are there for some other reason entirely.
  images: { select: { url: true }, orderBy: { sortOrder: "asc" as const }, take: 1 },
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

// One entry per product, not per alert — which is what the screen is a list
// of, and what its count means when somebody reads it.
//
// The two automatic reasons overlap by design: a product the sheet created
// this morning is NEW_FROM_SOURCE, and having arrived with nothing but a
// title and a price it is also URGENT_MISSING_MEDIA. Both are true and both
// are worth showing. But rendering the alerts directly put that product on
// the screen twice and counted it twice, so a queue of 186 products
// announced itself as 296 and read as though the backlog had doubled
// overnight. The reasons belong on the product as badges; the number above
// them is a number of products.
//
// Order is inherited from getAttentionProducts, which sorts by severity, so
// a product takes the position of its most severe reason.
export type AttentionItem = {
  productId: string;
  product: Awaited<ReturnType<typeof getAttentionProducts>>[number]["product"];
  types: string[];
  latestAt: Date;
};

export async function getAttentionItems(): Promise<AttentionItem[]> {
  const alerts = await getAttentionProducts();
  const byProduct = new Map<string, AttentionItem>();

  for (const alert of alerts) {
    const key = alert.product.id;
    const seen = byProduct.get(key);
    if (!seen) {
      byProduct.set(key, {
        productId: key,
        product: alert.product,
        types: [alert.type],
        latestAt: alert.createdAt,
      });
      continue;
    }
    if (!seen.types.includes(alert.type)) seen.types.push(alert.type);
    if (alert.createdAt > seen.latestAt) seen.latestAt = alert.createdAt;
  }

  return [...byProduct.values()];
}

// The "טיפול דחוף" list: only products an admin explicitly sent there via
// the button on the product page (setProductReviewFlagAction(..., "URGENT"))
// — never populated automatically, unlike getAttentionProducts above.
// Every brand, for the brand picker on the urgent queue. A brand clash is
// settled by choosing the right one, so the list has to be the real list —
// typing a name would create brands by typo.
export async function getBrandOptions() {
  return db.brand.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
}

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
    // A product can hold both flags open at once — 9 of them do — and
    // findFirst without an order returns whichever row the database reaches
    // first, so the button could show "attention" for a product that is also
    // marked urgent. Sorting by type descending puts MANUAL_URGENT ahead of
    // MANUAL_ATTENTION alphabetically, which is the more serious of the two:
    // the button should always report the worse state, never the milder one.
    orderBy: { type: "desc" },
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

/**
 * Products still carrying a photograph from a competing retailer's server.
 *
 * Derived, never seeded. The competitor list was classified by hand once
 * and 1,428 images were deleted on the strength of it — and 353 are back,
 * on 202 products created after that cleanup. A row of alerts written today
 * would go stale the same way: it would still name a product whose photo
 * was replaced last week, and it would miss the next one that arrives
 * tomorrow. Asking the question live means the list is right at the moment
 * it is read, and a product leaves it by being fixed rather than by someone
 * remembering to resolve a flag.
 *
 * `onlyImageForProduct` is the number that decides what can be done about
 * each row. 201 of the 202 have no other photograph, so deleting the image
 * does not clean up a product — it takes it off the shop, because
 * PUBLIC_PRODUCT_WHERE needs a picture. The screen has to say that before
 * offering the button, which is why this is counted here rather than left
 * to whoever is looking.
 *
 * Owner-only, and enforced at the page rather than here: a seller cannot
 * act on this and does not need to carry it.
 */
export type CompetitorImageRow = {
  productId: string;
  title: string;
  sku: string;
  slug: string;
  isPublished: boolean;
  stockQty: number;
  liveOnSite: boolean;
  totalImages: number;
  images: { id: string; url: string; host: string; onlyImageForProduct: boolean }[];
};

export async function getCompetitorImageProducts(): Promise<CompetitorImageRow[]> {
  // Every image, filtered in JS: isBlockedImageHost is a hand-written host
  // matcher, not something the query planner can express, and 3,362 rows is
  // a cheap read on a page only the owner opens.
  const images = await db.productImage.findMany({
    select: {
      id: true,
      url: true,
      /* An image already copied to our CDN carries the host it came from
         here and nowhere else — without these two the report is blind to
         every migrated image, which is how 28 live zap.co.il photographs
         went unlisted. */
      sourceDomain: true,
      sourceImageUrl: true,
      productId: true,
      product: {
        select: {
          title: true,
          sku: true,
          slug: true,
          isPublished: true,
          stockQty: true,
          _count: { select: { images: true } },
        },
      },
    },
  });

  const byProduct = new Map<string, CompetitorImageRow>();
  for (const img of images) {
    if (!imageIsFromBlockedHost(img)) continue;
    const total = img.product._count.images;
    const row = byProduct.get(img.productId) ?? {
      productId: img.productId,
      title: img.product.title,
      sku: img.product.sku,
      slug: img.product.slug,
      isPublished: img.product.isPublished,
      stockQty: img.product.stockQty,
      liveOnSite: img.product.isPublished && img.product.stockQty > 0 && total > 0,
      totalImages: total,
      images: [],
    };
    row.images.push({
      id: img.id,
      url: img.url,
      /* The host that matters is where the photograph came from, not where
         it is served from now. A migrated image would otherwise print
         "buytoday.co.il" in a list of other people's pictures. */
      host:
        img.sourceDomain ??
        (img.sourceImageUrl ?? img.url).replace(/^https?:\/\//i, "").split("/")[0],
      onlyImageForProduct: total === 1,
    });
    byProduct.set(img.productId, row);
  }

  // The ones that would go dark first — those are the decision, the rest is
  // tidying.
  return [...byProduct.values()].sort(
    (a, b) => Number(b.liveOnSite) - Number(a.liveOnSite) || a.title.localeCompare(b.title, "he"),
  );
}

export type ImageReadinessRow = {
  key: "ours" | "migratable" | "prec" | "refusing" | "blocked";
  label: string;
  products: number;
  note: string;
};

/**
 * How many products on the shop Google can actually fetch a photograph for.
 *
 * Counted per PRODUCT and off its PRIMARY image, which is the only framing
 * that answers the question being asked. "2,900 images left" sounds like the
 * work; it is not. A product's second and third photographs cost it nothing
 * in Merchant Center, an unpublished product costs nothing either, and one
 * product with nine hotlinks is one problem rather than nine. What decides
 * whether an item is shown is whether the image_link on the item Google
 * fetches answers when Google asks.
 *
 * The buckets are not severity, they are WHO UNBLOCKS THEM, because that is
 * what the number is for:
 *
 *  - ours / migratable — the cron. Nobody does anything.
 *  - prec — a rule on someone else's Cloudflare account. A phone call.
 *  - refusing — hosts that answer a datacenter address with 403. Measured,
 *    not assumed: these are the ones our own runs were refused by, and
 *    Google fetches from the same kind of address.
 *  - blocked — competitors' servers. Never copied, by decision, and the
 *    decision is the owner's on their own screen. Code will not move these
 *    however long it runs.
 *
 * Hosts are matched by substring rather than read from
 * blocked-image-hosts.ts for the refusing set, because "refuses us" is an
 * observation about the world that we collect by running, while "blocked"
 * is a rule we hold. Keeping them apart is the same distinction
 * HOSTS_THAT_REFUSE_US draws in the migration library.
 */
export async function getImageReadiness(): Promise<ImageReadinessRow[]> {
  /* Published, not live-on-site, and the primary image only.
    
     The unit matters more than it looks, and three of us measured three
     different true things before agreeing on this one: 110 images moved,
     88 products with at least one image moved, 56 products whose PRIMARY
     image moved. Only the last one tracks Merchant Center, because
     image_link carries the primary image and nothing else — a product with
     six photographs whose first is still on a manufacturer's server has not
     moved at all as far as Google is concerned.
    
     Published rather than in-stock, because a sold-out product keeps its
     page and comes back; its image is work already done or still owed
     either way. */
  const rows = await db.product.findMany({
    where: { isPublished: true, images: { some: {} } },
    select: {
      id: true,
      images: {
        orderBy: { sortOrder: "asc" },
        take: 1,
        select: { url: true, sourceDomain: true, sourceImageUrl: true },
      },
    },
  });

  const REFUSING = /c100|sel\.co\.il|payngo|yshalom|electricshop|shekem-electric/i;

  const count = { ours: 0, migratable: 0, prec: 0, refusing: 0, blocked: 0 };
  for (const r of rows) {
    const image = r.images[0];
    if (!image) continue;
    const url = image.url;
    /* Blocked is asked first, and of the provenance rather than the URL.
       With the self-hosted test in front of it a copied competitor image
       counted as "already ours — ready for Google", which is the one
       answer that can get the Merchant Center account suspended: it is
       ready to be served, under our name, and it is not ours. */
    if (imageIsFromBlockedHost(image)) count.blocked++;
    else if (isSelfHosted(url)) count.ours++;
    else if (/prec\.co\.il/i.test(url)) count.prec++;
    else if (REFUSING.test(url)) count.refusing++;
    else count.migratable++;
  }

  return [
    { key: "ours", label: "כבר אצלנו", products: count.ours, note: "גוגל מושך מהשרת שלנו. אלה מוכנים." },
    {
      key: "migratable",
      label: "בדרך — הקרון מטפל",
      products: count.migratable,
      note: "מארחים שעונים לנו. עוברים אלינו לבד, בלי שאף אחד ילחץ על כלום.",
    },
    {
      key: "prec",
      label: "האתר הישן — צריך טלפון",
      products: count.prec,
      note: "prec.co.il מחזיר 403 לשרתים. נפתח בכלל Cloudflare בצד שלהם, לא בקוד שלנו.",
    },
    {
      key: "refusing",
      label: "מארחים שמסרבים",
      products: count.refusing,
      note: "אתרים שעונים 403 לכתובת של מרכז נתונים. גוגל מושך מאותו סוג כתובת, אז כנראה גם לו הם מסרבים.",
    },
    {
      key: "blocked",
      label: "תמונות של מתחרים — החלטה שלך",
      products: count.blocked,
      note: "לא מועתקות אלינו לעולם. צריך תצלום אחר, או הסרה. הלשונית הייעודית מציגה אותן.",
    },
  ];
}

/* ---------------------------------------------------------------------------
   What one sync run actually did.

   The owner asked for this on 14 October, after a run moved a price
   overnight and the only way to find out which one was a database query.
   Two pages already existed and neither answers it: סנכרון history shows a
   run's counters ("1,116 מוצרים עודכנו") with nothing under them, and
   שינויים shows every event ever in one flat list, newest first, 50 to a
   page.

   The flat list is the instructive failure. The 04:30 run on 14 October
   wrote 1,148 events and **1,114 of them were PRODUCT_DATA_CHANGED**, which
   does not mean the product's data changed: it means the sheet's raw
   description differs from the title we hold, the enrichment guard refused
   the overwrite, and the event was logged anyway. Every enriched product
   produces one on every run, forever. So the page that shows "changes"
   shows 97% rows where nothing happened, and the eight price moves that did
   happen are on page three.

   Hence the split below. `real` is what the run changed — price, stock,
   products in, products gone. `reported` is the noise, counted and named
   honestly rather than hidden, because "the sheet disagrees with our title"
   is worth knowing in bulk and worthless one row at a time. */

/** Changes the run made. PRODUCT_DATA_CHANGED is deliberately not here. */
const REAL_CHANGE_TYPES = [
  "PRICE_CHANGED",
  "NEW_PRODUCT",
  "PRODUCT_MISSING_FROM_SOURCE",
  "BECAME_OUT_OF_STOCK",
  "BACK_IN_STOCK",
  "STOCK_INCREASED",
  "STOCK_DECREASED",
  "SUPPLIER_STOCK_CHANGED",
  "SHOWROOM_STOCK_CHANGED",
  "SOURCE_CONFLICT",
] as const;

/* The alert types that explain a change to a product, or a refusal to make
   one. A run raises plenty of others and the list was wider on the first
   draft, which the 14 October run settled by measurement: it raised 243
   alerts and 174 of them were UNMATCHED_ROW — a sheet row that found no
   product at all, which is a real problem and not an answer to "why did
   this product's price move". Dropping that one type takes the section from
   243 rows to 69, and the page is read by somebody holding one product. */
const EXPLANATORY_ALERT_TYPES = [
  "INVALID_PRICE",
  "PRICE_BELOW_COST",
  "ROW_NAMES_ANOTHER_MODEL",
  "ROW_CLAIMED_TWICE",
  "SOURCE_CONFLICT",
  "DUPLICATE_SKU",
  "MISSING_FROM_SOURCE",
  "MAJOR_STOCK_CHANGE",
] as const;

export type SyncRunChangeRow = {
  id: string;
  changeType: string;
  sourceSku: string | null;
  sourceSheet: string | null;
  previousValue: string | null;
  newValue: string | null;
  product: { id: string; sku: string; title: string; model: string | null; price: number; stockQty: number } | null;
};

export async function getSyncRunChanges(runId?: string) {
  /* The run to show. Not simply the newest: a NO_CHANGES run has no events
     and landing on it reads as "the feature is broken" rather than "nothing
     happened", so without an explicit id we open the newest run that
     actually wrote something. */
  const runs = await db.inventorySyncRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 20,
    include: { triggeredBy: { select: { name: true } }, _count: { select: { changeEvents: true } } },
  });

  const run = runId ? runs.find((r) => r.id === runId) ?? null : runs.find((r) => r._count.changeEvents > 0) ?? runs[0] ?? null;
  if (!run)
    return { runs, run: null, real: [], realTotal: 0, counts: [], reportedCount: 0, alerts: [], alertTotal: 0, money: { perUnit: 0, listed: 0 } };

  /* Both lists below are capped, so both totals are fetched separately and
     rendered beside them. A list that silently stops at its limit is worse
     than no list on a page whose job is to account for a run completely —
     the reader has no way to tell "that is all of them" from "that is the
     first 400". */
  const [counts, real, realTotal, reportedCount, alerts, alertTotal] = await Promise.all([
    db.inventoryChangeEvent.groupBy({
      by: ["changeType"],
      where: { syncRunId: run.id },
      _count: { _all: true },
    }),
    db.inventoryChangeEvent.findMany({
      where: { syncRunId: run.id, changeType: { in: [...REAL_CHANGE_TYPES] } },
      orderBy: { createdAt: "asc" },
      /* A cap, because a run that re-sorts a tab can report hundreds of
         products gone and the page still has to render. 400 is past any
         healthy run and short of a browser problem. */
      take: 400,
      select: {
        id: true,
        changeType: true,
        sourceSku: true,
        sourceSheet: true,
        previousValue: true,
        newValue: true,
        product: { select: { id: true, sku: true, title: true, model: true, price: true, stockQty: true } },
      },
    }),
    db.inventoryChangeEvent.count({ where: { syncRunId: run.id, changeType: { in: [...REAL_CHANGE_TYPES] } } }),
    db.inventoryChangeEvent.count({ where: { syncRunId: run.id, changeType: "PRODUCT_DATA_CHANGED" } }),
    db.inventoryAlert.findMany({
      where: { syncRunId: run.id, type: { in: [...EXPLANATORY_ALERT_TYPES] } },
      orderBy: { createdAt: "asc" },
      take: 120,
      select: {
        id: true,
        type: true,
        message: true,
        isResolved: true,
        product: { select: { id: true, sku: true } },
      },
    }),
    db.inventoryAlert.count({ where: { syncRunId: run.id, type: { in: [...EXPLANATORY_ALERT_TYPES] } } }),
  ]);

  /* The money, both ways, because they answer different questions. Per unit
     is "how much did the price of this thing move"; listed is that times the
     stock behind it, which is what actually moves off the shelf. Only
     PRICE_CHANGED contributes — a stock event is not a price. */
  let perUnit = 0;
  let listed = 0;
  for (const e of real) {
    if (e.changeType !== "PRICE_CHANGED") continue;
    const before = Number(e.previousValue);
    const after = Number(e.newValue);
    if (!Number.isFinite(before) || !Number.isFinite(after)) continue;
    perUnit += after - before;
    listed += (after - before) * (e.product?.stockQty ?? 0);
  }

  return { runs, run, real, realTotal, counts, reportedCount, alerts, alertTotal, money: { perUnit, listed } };
}
