import { createHash } from "crypto";
import { db } from "@/lib/db";
import type { NormalizedProductRow } from "./types";
import {
  diffAgainstExisting,
  detectSourceConflicts,
  isMajorStockChange,
  totalStock,
  displayStockLines,
  deriveStockStatus,
  resolvedPrice,
  hasAnyStockData,
} from "./diff-engine";
import type { SourceKey } from "./sheet-map";
import { brandLikeDividers } from "./brand-extractor";
import type { SyncTrigger } from "@/lib/enums";

// Sequential, persistent, gap-free: 0001, 0002, ... — never reused, never
// renumbered on a later sync. A single-row counter table keeps allocation
// atomic without scanning existing SKUs for a max.
async function allocateTempSku(): Promise<string> {
  const counter = await db.tempSkuCounter.upsert({
    where: { id: "singleton" },
    update: { value: { increment: 1 } },
    create: { id: "singleton", value: 1 },
  });
  return String(counter.value).padStart(4, "0");
}

// Finds the product this row belongs to across syncs, in priority order:
//  1. Same physical position in the source (sourceId+sheet+row) — the
//     primary identity signal, including the temp-SKU -> real-SKU upgrade
//     case (a product that had no SKU last sync now has one this sync).
//     Not trusted if that position now holds a *different* real SKU than
//     this row's real SKU — that means rows shifted upstream, not that our
//     temp SKU should silently attach to an unrelated product.
//  2. For rows with no real SKU and no position match: a content-based
//     fallback (same brand+model+title, still temp-SKU'd, same source) —
//     guards against minor row-order drift in the sheet.
//  3. For rows with a real SKU: a plain SKU lookup.
async function findExistingProduct(
  sourceId: string,
  row: NormalizedProductRow,
  brandId: string,
) {
  const positionMatch = await db.product.findFirst({
    where: { sourceId, sourceSheet: row.sheetName, sourceRowRef: row.rowIndex },
  });

  if (positionMatch) {
    const positionMatchIsStaleIdentity =
      !row.skuIsSynthetic &&
      !positionMatch.isTemporarySku &&
      positionMatch.sku !== row.sku;
    if (!positionMatchIsStaleIdentity) return positionMatch;
  }

  if (!row.skuIsSynthetic) {
    return db.product.findUnique({ where: { sku: row.sku } });
  }

  return db.product.findFirst({
    where: {
      sourceId,
      isTemporarySku: true,
      brandId,
      model: row.model,
      title: row.title,
    },
  });
}

export function getLowStockThreshold(): number {
  const raw = process.env.LOW_STOCK_THRESHOLD;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : 3;
}

function asciiSlug(input: string) {
  return input
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();
}

function slugFor(row: NormalizedProductRow, sku: string) {
  const base =
    asciiSlug(row.model ?? row.brandName ?? row.categorySlug ?? "product") ||
    "product";
  const suffix = createHash("sha1").update(sku).digest("hex").slice(0, 8);
  return `${base}-${suffix}`;
}

async function resolveBrandId(name: string | null): Promise<string> {
  const brandName = (name ?? "לא ידוע").trim() || "לא ידוע";
  const existing = await db.brand.findFirst({ where: { name: brandName } });
  if (existing) return existing.id;
  const slug =
    asciiSlug(brandName) ||
    createHash("sha1").update(brandName).digest("hex").slice(0, 10);
  const created = await db.brand.create({
    data: {
      name: brandName,
      slug: `${slug}-${createHash("sha1").update(brandName).digest("hex").slice(0, 6)}`,
    },
  });
  return created.id;
}

async function resolveCategoryId(slug: string | null): Promise<string | null> {
  if (!slug) return null;
  const cat = await db.category.findUnique({ where: { slug } });
  return cat?.id ?? null;
}

type AlertInput = {
  type: string;
  severity: string;
  productId?: string | null;
  sourceId?: string | null;
  syncRunId?: string | null;
  sourceSku?: string | null;
  message: string;
};

// A persisting issue (still no confirmed price, still out of stock, etc.)
// would otherwise get a brand new alert row every single sync run forever
// — resolve whatever unresolved alert of the same type already exists for
// this product/source before creating the current one, so the alert list
// reflects the current state, not sync history.
async function upsertAlert(input: AlertInput) {
  const where = input.productId
    ? { type: input.type, productId: input.productId, isResolved: false }
    : {
        type: input.type,
        sourceId: input.sourceId ?? undefined,
        productId: null,
        isResolved: false,
      };
  await db.inventoryAlert.updateMany({
    where,
    data: { isResolved: true, resolvedAt: new Date() },
  });
  await db.inventoryAlert.create({ data: input });
}

type ApplyResult = {
  productsAdded: number;
  productsUpdated: number;
  priceChanges: number;
  stockChanges: number;
  seenSkus: Set<string>;
};

// Alert types that describe a single row's current state, as opposed to a
// one-off event (MAJOR_STOCK_CHANGE, OUT_OF_STOCK) or something set outside
// this loop (MISSING_FROM_SOURCE). When the same SKU appears as several
// rows in one source (e.g. one row per color variant), each row can trip a
// *different* one of these — upsertAlert only auto-resolves a prior alert
// of the *same* type, so a type tripped by an earlier variant but not by
// the row that ends up as the product's final state would otherwise sit
// open forever, still describing a state the product is no longer in.
const ROW_STATE_ALERT_TYPES = new Set([
  "UNMATCHED_ROW",
  "INVALID_PRICE",
  "MISSING_MODEL",
  "NEGATIVE_STOCK",
  "DUPLICATE_SKU",
  "DUPLICATE_MODEL",
  "SOURCE_CONFLICT",
]);

// One row's worth of work: find/create/update its Product row, replace its
// stock-line breakdown, and emit whatever alerts its current data implies.
// Isolated into its own function (instead of living inline in the loop) so
// applyRowsForSource can wrap a single row's failure without an uncaught
// exception three levels deep — e.g. a transient unique-constraint clash
// while two rows' SKUs are mid-swap — from aborting every row after it in
// the same source, which used to leave the whole sync stuck and every
// later row silently unprocessed.
async function applyOneRow(
  sourceId: string,
  row: NormalizedProductRow,
  syncRunId: string,
  conflictSkus: Set<string>,
  threshold: number,
  result: ApplyResult,
): Promise<{ productId: string; types: Set<string> } | null> {
  const hasConflict = conflictSkus.has(row.sku);
  const brandId = await resolveBrandId(row.brandName);

  // Position (sourceId+sheet+row) first, content-identity fallback for
  // temp-SKU'd rows, plain SKU lookup otherwise — see findExistingProduct
  // for why this order matters (handles the temp -> real SKU upgrade case
  // without creating a duplicate).
  const existing = await findExistingProduct(sourceId, row, brandId);
  const stock = totalStock(row);

  // Zero stock, never seen before: don't pull it into the system at all —
  // not a product record, not a temp SKU, not an alert. It's not "a
  // product that needs review," it's not a product yet. If a real product
  // that used to have stock drops to zero, it's still updated below (kept,
  // not deleted, so it can come back) — this only skips rows with nothing
  // to reactivate in the first place.
  if (stock <= 0 && !existing) return null;

  // Safety net for the early-exit (missing category) path below: track
  // whatever SKU this row is already known by, so an existing product at
  // this position/identity isn't wrongly marked missing-from-source just
  // because its category couldn't be resolved this run.
  if (existing) result.seenSkus.add(existing.sku);
  else if (!row.skuIsSynthetic) result.seenSkus.add(row.sku);

  const categoryId = await resolveCategoryId(row.categorySlug);
  if (!categoryId) {
    await upsertAlert({
      type: "UNMATCHED_ROW",
      severity: "WARNING",
      sourceId,
      syncRunId,
      sourceSku: existing?.sku ?? row.sku,
      message: `לא נמצאה קטגוריה מתאימה לגיליון "${row.sheetName}"`,
    });
    return null;
  }

  const { price: resolved } = resolvedPrice(row);
  let status = deriveStockStatus(row, stock, hasConflict);
  if (status !== "NEEDS_REVIEW" && resolved === null) status = "NEEDS_REVIEW";
  const finalStatus =
    status === "IN_STOCK" && stock <= threshold ? "LOW_STOCK" : status;

  const changes = diffAgainstExisting(
    row,
    existing
      ? {
          id: existing.id,
          sku: existing.sku,
          isTemporarySku: existing.isTemporarySku,
          sourceId: existing.sourceId,
          price: existing.price,
          stockQty: existing.stockQty,
          title: existing.title,
          model: existing.model,
          missingFromSourceSince: existing.missingFromSourceSince,
        }
      : null,
  );

  // Real SKU always wins. No real SKU: reuse the existing product's
  // already-assigned temp SKU (same logical product, same number as last
  // sync) or mint the next sequential one for a genuinely new product.
  const isTemporarySku = row.skuIsSynthetic;
  const sku = !row.skuIsSynthetic
    ? row.sku
    : (existing?.sku ?? (await allocateTempSku()));
  result.seenSkus.add(sku);

  const stockLines = displayStockLines(row);

  const data = {
    sku,
    isTemporarySku,
    title: row.title,
    model: row.model,
    brandId,
    categoryId,
    price: resolved ?? existing?.price ?? 0,
    minSalePrice: row.minSalePrice,
    supplierCost: row.internalCost,
    warrantyMonths: existing?.warrantyMonths ?? 12,
    stockStatus: finalStatus,
    stockQty: stock,
    stockBreakdown: JSON.stringify(row.rawSnapshot),
    internalNotes: row.color ? `צבע: ${row.color}` : null,
    sourceId,
    sourceSheet: row.sheetName,
    sourceRowRef: row.rowIndex,
    lastExcelSyncAt: new Date(),
    missingFromSourceSince: null,
    // Store policy: zero stock means fully off the site, not just
    // "published but shows out of stock" — enforced again at query time
    // in src/lib/queries/products.ts (PUBLIC_PRODUCT_WHERE) since that's
    // the layer that actually can't go stale.
    isPublished:
      !hasConflict &&
      finalStatus !== "NEEDS_REVIEW" &&
      resolved !== null &&
      stock > 0,
  };

  let productId: string;
  if (existing) {
    await db.product.update({ where: { id: existing.id }, data });
    productId = existing.id;
    result.productsUpdated++;
    if (existing.missingFromSourceSince) {
      await db.inventoryAlert.updateMany({
        where: { type: "MISSING_FROM_SOURCE", productId, isResolved: false },
        data: { isResolved: true, resolvedAt: new Date() },
      });
    }
  } else {
    const created = await db.product.create({
      data: {
        ...data,
        slug: slugFor(row, sku),
        shortDescription: row.color ? `צבע: ${row.color}` : null,
      },
    });
    productId = created.id;
    result.productsAdded++;
  }

  // Full replace, not a diff — each sync states what the source currently
  // says, per-location; a location that vanished from the source should
  // vanish from the breakdown too, not linger from a previous run.
  await db.inventorySourceLine.deleteMany({ where: { productId } });
  if (stockLines.length > 0) {
    await db.inventorySourceLine.createMany({
      data: stockLines.map((l) => ({
        productId,
        label: l.label,
        quantity: l.quantity,
      })),
    });
  }

  // Image URL comes only from an explicit column in the source — never
  // guessed/searched — so it's safe to trust and apply directly.
  if (row.imageUrl) {
    const existingImage = await db.productImage.findFirst({
      where: { productId },
    });
    if (!existingImage) {
      await db.productImage.create({
        data: { productId, url: row.imageUrl, sortOrder: 0 },
      });
    } else if (existingImage.url !== row.imageUrl) {
      await db.productImage.update({
        where: { id: existingImage.id },
        data: { url: row.imageUrl },
      });
    }
  }

  for (const change of changes) {
    if (change.changeType === "PRICE_CHANGED") result.priceChanges++;
    if (
      change.changeType === "STOCK_INCREASED" ||
      change.changeType === "STOCK_DECREASED" ||
      change.changeType === "BECAME_OUT_OF_STOCK" ||
      change.changeType === "BACK_IN_STOCK"
    ) {
      result.stockChanges++;
    }
    await db.inventoryChangeEvent.create({
      data: {
        syncRunId,
        productId,
        sourceId,
        sourceSku: sku,
        sourceSheet: row.sheetName,
        changeType: change.changeType,
        previousValue:
          change.previousValue === null
            ? null
            : JSON.stringify(change.previousValue),
        newValue:
          change.newValue === null ? null : JSON.stringify(change.newValue),
      },
    });
    if (
      (change.changeType === "STOCK_INCREASED" ||
        change.changeType === "STOCK_DECREASED") &&
      typeof change.previousValue === "number" &&
      typeof change.newValue === "number" &&
      isMajorStockChange(change.previousValue, change.newValue)
    ) {
      await upsertAlert({
        type: "MAJOR_STOCK_CHANGE",
        severity: "WARNING",
        productId,
        sourceId,
        syncRunId,
        sourceSku: sku,
        message: `שינוי מלאי חריג ב-${row.title}: ${change.previousValue} → ${change.newValue}`,
      });
    }
  }

  // A handful of units left is a normal, healthy state, not a problem to
  // flag — no alert for LOW_STOCK. OUT_OF_STOCK only reaches here for a
  // product that already existed (brand-new zero-stock rows were skipped
  // above), so it's still worth recording that it dropped to zero.
  if (finalStatus === "OUT_OF_STOCK") {
    await upsertAlert({
      type: "OUT_OF_STOCK",
      severity: "INFO",
      productId,
      sourceId,
      syncRunId,
      sourceSku: row.sku,
      message: `${row.title} אזל מהמלאי`,
    });
  }

  const currentRowTypes = new Set<string>();

  if (!hasAnyStockData(row)) {
    currentRowTypes.add("UNMATCHED_ROW");
    await upsertAlert({
      type: "UNMATCHED_ROW",
      severity: "WARNING",
      productId,
      sourceId,
      syncRunId,
      sourceSku: sku,
      message: `${row.title}: אין נתוני מלאי כלל במקור — לא פורסם, מצריך בדיקה`,
    });
  }
  if (resolved === null) {
    currentRowTypes.add("INVALID_PRICE");
    await upsertAlert({
      type: "INVALID_PRICE",
      severity: "WARNING",
      productId,
      sourceId,
      syncRunId,
      sourceSku: sku,
      message: `${row.title}: אין מחיר מינימום במקור — לא פורסם`,
    });
  }

  for (const issue of row.issues) {
    const typeMap = {
      MISSING_MODEL: "MISSING_MODEL",
      INVALID_PRICE: "INVALID_PRICE",
      NEGATIVE_STOCK: "NEGATIVE_STOCK",
      DUPLICATE_SKU: "DUPLICATE_SKU",
      DUPLICATE_MODEL: "DUPLICATE_MODEL",
      UNMATCHED_ROW: "UNMATCHED_ROW",
    } as const;
    currentRowTypes.add(typeMap[issue.type]);
    await upsertAlert({
      type: typeMap[issue.type],
      severity:
        issue.type === "INVALID_PRICE" || issue.type === "NEGATIVE_STOCK"
          ? "CRITICAL"
          : "WARNING",
      productId,
      sourceId,
      syncRunId,
      sourceSku: sku,
      message: issue.message,
    });
  }

  if (hasConflict) {
    currentRowTypes.add("SOURCE_CONFLICT");
    await upsertAlert({
      type: "SOURCE_CONFLICT",
      severity: "CRITICAL",
      productId,
      sourceId,
      syncRunId,
      sourceSku: sku,
      message: `מק"ט ${sku} מופיע ביותר ממקור פעיל אחד`,
    });
  }

  return { productId, types: currentRowTypes };
}

export async function applyRowsForSource(
  sourceId: string,
  rows: NormalizedProductRow[],
  syncRunId: string,
  conflictSkus: Set<string>,
): Promise<ApplyResult> {
  const threshold = getLowStockThreshold();
  const result: ApplyResult = {
    productsAdded: 0,
    productsUpdated: 0,
    priceChanges: 0,
    stockChanges: 0,
    seenSkus: new Set(),
  };
  // Overwritten (not merged) per product on every row that touches it, so
  // after the loop this reflects only the *last* processed row for each
  // product — the one whose data actually won.
  const finalIssueTypesByProduct = new Map<string, Set<string>>();

  for (const row of rows) {
    try {
      const outcome = await applyOneRow(
        sourceId,
        row,
        syncRunId,
        conflictSkus,
        threshold,
        result,
      );
      if (outcome)
        finalIssueTypesByProduct.set(outcome.productId, outcome.types);
    } catch (err) {
      await upsertAlert({
        type: "UNMATCHED_ROW",
        severity: "CRITICAL",
        sourceId,
        syncRunId,
        sourceSku: row.sku || null,
        message: `${row.title}: שגיאה בעיבוד השורה, דולגה — ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // Settle pass: a product touched by several rows this run (duplicate-SKU
  // variants) may have accumulated alerts of types its *final* row never
  // triggered — those describe a state it's no longer in, so close them
  // even though upsertAlert's same-type dedup never got the chance to.
  for (const [productId, finalTypes] of finalIssueTypesByProduct) {
    const staleAlerts = await db.inventoryAlert.findMany({
      where: {
        productId,
        isResolved: false,
        type: { in: [...ROW_STATE_ALERT_TYPES] },
      },
    });
    for (const alert of staleAlerts) {
      if (!finalTypes.has(alert.type)) {
        await db.inventoryAlert.update({
          where: { id: alert.id },
          data: { isResolved: true, resolvedAt: new Date() },
        });
      }
    }
  }

  return result;
}

export async function markMissingProducts(
  sourceId: string,
  seenSkus: Set<string>,
  syncRunId: string,
): Promise<number> {
  const stillLinked = await db.product.findMany({
    where: { sourceId, missingFromSourceSince: null },
    select: { id: true, sku: true, title: true },
  });
  const missing = stillLinked.filter((p) => !seenSkus.has(p.sku));

  for (const p of missing) {
    await db.product.update({
      where: { id: p.id },
      data: { missingFromSourceSince: new Date(), stockStatus: "NEEDS_REVIEW" },
    });
    await db.inventoryChangeEvent.create({
      data: {
        syncRunId,
        productId: p.id,
        sourceId,
        sourceSku: p.sku,
        changeType: "PRODUCT_MISSING_FROM_SOURCE",
        previousValue: null,
        newValue: null,
      },
    });
    await upsertAlert({
      type: "MISSING_FROM_SOURCE",
      severity: "WARNING",
      productId: p.id,
      sourceId,
      syncRunId,
      sourceSku: p.sku,
      message: `${p.title} נעלם מקובץ המקור — סומן לבדיקה, לא נמחק`,
    });
  }
  return missing.length;
}

export async function recordUnknownColumnAlerts(
  sourceId: string,
  syncRunId: string,
  sheetsWithUnknowns: { sheetName: string; unknownLabels: string[] }[],
) {
  for (const s of sheetsWithUnknowns) {
    if (s.unknownLabels.length === 0) continue;
    await upsertAlert({
      type: "UNKNOWN_COLUMN",
      severity: "INFO",
      sourceId,
      syncRunId,
      message: `גיליון "${s.sheetName}": עמודות לא מזוהות — ${s.unknownLabels.join(", ")}`,
    });
  }
}

// A per-run SOURCE_CONFLICT alert only gets created/resolved for products
// whose own source happened to be re-scanned in that run — but a conflict
// depends on the *other* source too, and that side isn't always the one
// that changed. Worse, deactivating one of the two conflicting sources
// doesn't touch either source's file hash, so a sync can skip both of them
// entirely and the stale "still conflicting" alert never gets cleared.
// This reconciles every open SOURCE_CONFLICT alert against current DB
// ground truth — which real (non-temporary) SKUs are actually claimed by
// more than one *active* source right now — independent of what changed
// in any particular run. Call this after every sync, and also right after
// toggling a source's active state, since that alone can resolve or create
// a conflict without any file ever changing.
export async function reconcileSourceConflictAlerts(syncRunId: string | null) {
  const threshold = getLowStockThreshold();
  const products = await db.product.findMany({
    where: { isTemporarySku: false, source: { isActive: true } },
    select: { id: true, sku: true, sourceId: true },
  });
  const bySku = new Map<string, typeof products>();
  for (const p of products) {
    const list = bySku.get(p.sku) ?? [];
    list.push(p);
    bySku.set(p.sku, list);
  }
  const stillConflicting = new Map<string, typeof products>();
  for (const [sku, group] of bySku) {
    if (new Set(group.map((p) => p.sourceId)).size > 1)
      stillConflicting.set(sku, group);
  }

  const openAlerts = await db.inventoryAlert.findMany({
    where: { type: "SOURCE_CONFLICT", isResolved: false },
  });
  for (const alert of openAlerts) {
    if (!alert.sourceSku || !stillConflicting.has(alert.sourceSku)) {
      await db.inventoryAlert.update({
        where: { id: alert.id },
        data: { isResolved: true, resolvedAt: new Date() },
      });
    }
  }

  // Resolving the alert alone leaves the product's own stockStatus stuck on
  // "NEEDS_REVIEW" — that field is normally only recomputed when the
  // product's own source row gets reprocessed by a real sync, which
  // clearing a conflict this way never triggers. Sweep every product
  // that's still marked NEEDS_REVIEW but has no open alert left at all
  // (covers both alerts just resolved above and ones orphaned by an
  // earlier run, before this recompute step existed) and recompute its
  // status from what's already on the product.
  const orphanedNeedsReview = await db.product.findMany({
    where: {
      stockStatus: "NEEDS_REVIEW",
      alerts: { none: { isResolved: false } },
    },
    select: { id: true, stockQty: true },
  });
  for (const product of orphanedNeedsReview) {
    const status =
      product.stockQty <= 0
        ? "OUT_OF_STOCK"
        : product.stockQty <= threshold
          ? "LOW_STOCK"
          : "IN_STOCK";
    await db.product.update({
      where: { id: product.id },
      data: { stockStatus: status, isPublished: product.stockQty > 0 },
    });
  }

  for (const [sku, group] of stillConflicting) {
    const alreadyOpen = await db.inventoryAlert.findFirst({
      where: { type: "SOURCE_CONFLICT", sourceSku: sku, isResolved: false },
    });
    if (alreadyOpen) continue;
    for (const p of group) {
      await upsertAlert({
        type: "SOURCE_CONFLICT",
        severity: "CRITICAL",
        productId: p.id,
        sourceId: p.sourceId,
        syncRunId,
        sourceSku: sku,
        message: `מק"ט ${sku} מופיע ביותר ממקור פעיל אחד`,
      });
      await db.product.update({
        where: { id: p.id },
        data: { stockStatus: "NEEDS_REVIEW", isPublished: false },
      });
    }
  }
}

// Store policy: a product with neither a real photo nor any technical
// spec (structured or the free-text extraSpecsRaw fallback) doesn't go
// live, no matter what the source/enrichment pipeline says about price or
// stock — those two are the minimum a customer needs to trust a listing.
// Runs both directions every time: hides anything currently live that's
// missing both, and republishes anything previously hidden for this exact
// reason the moment enrichment fills in at least one of the two — nobody
// has to remember to flip it back manually. Stock itself is never touched;
// hiding is strictly a visibility flag, not an inventory action.
export async function reconcileUrgentMissingMedia() {
  const toHide = await db.product.findMany({
    where: {
      isPublished: true,
      stockQty: { gt: 0 },
      images: { none: {} },
      attributeValues: { none: {} },
      extraSpecsRaw: null,
    },
    select: { id: true, title: true, sku: true, sourceId: true },
  });
  for (const p of toHide) {
    await db.product.update({ where: { id: p.id }, data: { isPublished: false } });
    await upsertAlert({
      type: "URGENT_MISSING_MEDIA",
      severity: "CRITICAL",
      productId: p.id,
      sourceId: p.sourceId,
      syncRunId: null,
      sourceSku: p.sku,
      message: `${p.title}: אין תמונה ואין מפרט טכני — הוסר מהתצוגה באתר עד שיתווסף לפחות אחד מהשניים`,
    });
  }

  const openAlerts = await db.inventoryAlert.findMany({
    where: { type: "URGENT_MISSING_MEDIA", isResolved: false },
    include: {
      product: {
        select: {
          id: true,
          stockQty: true,
          images: { select: { id: true }, take: 1 },
          attributeValues: { select: { id: true }, take: 1 },
          extraSpecsRaw: true,
        },
      },
    },
  });
  let restored = 0;
  for (const alert of openAlerts) {
    const p = alert.product;
    if (!p) continue;
    const hasMedia = p.images.length > 0 || p.attributeValues.length > 0 || !!p.extraSpecsRaw;
    if (hasMedia && p.stockQty > 0) {
      await db.product.update({ where: { id: p.id }, data: { isPublished: true } });
      await db.inventoryAlert.update({ where: { id: alert.id }, data: { isResolved: true, resolvedAt: new Date() } });
      restored++;
    }
  }

  return { hidden: toHide.length, restored };
}

export function conflictSkuSet(rows: NormalizedProductRow[]): Set<string> {
  return new Set(detectSourceConflicts(rows).map((c) => c.sku));
}

export type { SyncTrigger };

// The real, repeatable sync: reads each active source's current file from
// Supabase Storage, skips ones whose content hash hasn't changed since the
// last scan, and applies the rest — this is what both the manual "sync now"
// action and the scheduled Vercel Cron endpoint call. Swapping Excel for
// Priority ERP later means replacing how bytes are fetched here; the parse
// -> normalize -> diff -> apply pipeline underneath doesn't change.
export async function runFullSync(
  trigger: SyncTrigger,
  triggeredById?: string,
) {
  const { parseWorkbook } = await import("./excel-parser");
  const {
    fetchSheetWorkbook,
    parseGoogleWorkbook,
    categoryForGoogleSheetTab,
    extractSpreadsheetId,
  } = await import("./google-sheets-source");
  const { normalizeRow, findDuplicates } = await import("./normalizer");
  const { createHash } = await import("crypto");

  const syncRun = await db.inventorySyncRun.create({
    data: { trigger, triggeredById, status: "RUNNING", sourceIds: "[]" },
  });

  const sources = await db.inventorySource.findMany({
    where: { isActive: true },
  });
  const scannedSourceIds: string[] = [];
  const allRows: NormalizedProductRow[] = [];
  const perSourceRows = new Map<string, NormalizedProductRow[]>();
  const perSourceUnknowns = new Map<
    string,
    { sheetName: string; unknownLabels: string[] }[]
  >();
  let totalRowsScanned = 0;
  let anyChanged = false;

  for (const source of sources) {
    await db.inventorySource.update({
      where: { id: source.id },
      data: { lastScannedAt: new Date() },
    });

    let sheets: import("./types").ParsedSheet[] = [];
    let contentHash: string;
    let contentSize: number;
    let categoryResolver: (sheetName: string) => string | null = () =>
      source.categorySlugOverride ?? null;

    try {
      if (source.sourceType === "GOOGLE_SHEET") {
        if (!source.sheetUrl) continue;
        const spreadsheetId = extractSpreadsheetId(source.sheetUrl);
        if (!spreadsheetId) throw new Error("קישור הגליון אינו תקין");
        const bytes = await fetchSheetWorkbook(spreadsheetId);
        contentHash = createHash("sha256").update(bytes).digest("hex");
        contentSize = bytes.length;
        if (contentHash === source.fileHash) continue; // unchanged
        const workbook = parseGoogleWorkbook(
          bytes,
          source.categorySlugOverride,
        );
        sheets = workbook.sheets;
        categoryResolver = (sheetName) =>
          categoryForGoogleSheetTab(sheetName, source.categorySlugOverride);
      } else {
        const { downloadInventoryFile, isStorageConfigured } =
          await import("./storage");
        if (!isStorageConfigured() || !source.storagePath) continue;
        const bytes = await downloadInventoryFile(source.storagePath);
        contentHash = createHash("sha256").update(bytes).digest("hex");
        contentSize = bytes.length;
        if (contentHash === source.fileHash) continue; // unchanged
        const workbook = parseWorkbook(bytes, source.key as SourceKey);
        sheets = workbook.sheets;
      }
    } catch (err) {
      await upsertAlert({
        type: "UNMATCHED_ROW",
        severity: "CRITICAL",
        sourceId: source.id,
        syncRunId: syncRun.id,
        message: `נכשל בטעינת המקור: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }

    anyChanged = true;
    scannedSourceIds.push(source.id);

    perSourceUnknowns.set(
      source.id,
      sheets
        .filter((s) => s.unknownLabels.length > 0)
        .map((s) => ({
          sheetName: s.sheetName,
          unknownLabels: s.unknownLabels,
        })),
    );

    const rows: NormalizedProductRow[] = [];
    for (const sheet of sheets) {
      totalRowsScanned += sheet.rows.length;
      // A brand named once as its own yellow divider ("GAGGIA", "B&W") is
      // now known for the rest of this sheet — used as a fallback signal
      // when extracting brand from other rows' free-text descriptions.
      const knownBrands = brandLikeDividers(
        sheet.rows
          .map((r) => r.sectionLabel)
          .filter((l): l is string => l !== null),
      );
      for (const row of sheet.rows) {
        rows.push(
          normalizeRow(
            source.key,
            sheet.sheetName,
            row,
            sheet.columns,
            categoryResolver(sheet.sheetName),
            knownBrands,
          ),
        );
      }
    }
    findDuplicates(rows);
    perSourceRows.set(source.id, rows);
    allRows.push(...rows);

    await db.inventorySource.update({
      where: { id: source.id },
      data: { fileHash: contentHash, fileSizeBytes: contentSize },
    });
  }

  // DB-ground-truth reconciliation, independent of which sources' files
  // actually changed this run — see reconcileSourceConflictAlerts for why.
  await reconcileSourceConflictAlerts(syncRun.id);
  await reconcileUrgentMissingMedia();

  if (!anyChanged) {
    await db.inventorySyncRun.update({
      where: { id: syncRun.id },
      data: {
        status: "NO_CHANGES",
        sourceIds: JSON.stringify(scannedSourceIds),
        finishedAt: new Date(),
      },
    });
    return db.inventorySyncRun.findUniqueOrThrow({ where: { id: syncRun.id } });
  }

  const conflicts = conflictSkuSet(allRows);
  let productsAdded = 0,
    productsUpdated = 0,
    productsMissing = 0,
    priceChanges = 0,
    stockChanges = 0;

  for (const sourceId of scannedSourceIds) {
    const rows = perSourceRows.get(sourceId) ?? [];
    const result = await applyRowsForSource(
      sourceId,
      rows,
      syncRun.id,
      conflicts,
    );
    productsAdded += result.productsAdded;
    productsUpdated += result.productsUpdated;
    priceChanges += result.priceChanges;
    stockChanges += result.stockChanges;
    productsMissing += await markMissingProducts(
      sourceId,
      result.seenSkus,
      syncRun.id,
    );
    await recordUnknownColumnAlerts(
      sourceId,
      syncRun.id,
      perSourceUnknowns.get(sourceId) ?? [],
    );
    await db.inventorySource.update({
      where: { id: sourceId },
      data: { lastSyncedAt: new Date() },
    });
  }

  const errorCount = await db.inventoryAlert.count({
    where: { syncRunId: syncRun.id, severity: "CRITICAL" },
  });

  return db.inventorySyncRun.update({
    where: { id: syncRun.id },
    data: {
      status: "SUCCESS",
      sourceIds: JSON.stringify(scannedSourceIds),
      rowsScanned: totalRowsScanned,
      productsAdded,
      productsUpdated,
      productsMissing,
      priceChanges,
      stockChanges,
      errorCount,
      finishedAt: new Date(),
    },
  });
}
