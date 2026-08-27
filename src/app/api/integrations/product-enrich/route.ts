import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { reconcileUrgentMissingMedia } from "@/lib/inventory/sync";
import {
  checkAuth,
  MAX_PRODUCT_IMAGES,
  normalizeImages,
  checkImageUrl,
  findOrCreateBrandId,
  findOrCreateSupplierId,
  parseWarrantyMonths,
  type FieldOutcome,
  type EnrichImageInput,
  type NormalizedImage,
} from "@/lib/integrations/product-enrich-shared";

// Bearer-token-protected endpoint for an external agent (e.g. a scraping/
// enrichment tool) to fill in *missing* data on products that already exist
// here, matched by SKU. Deliberately narrow: it only ever fills a field that
// is currently empty and never touches anything the inventory sync owns
// (title, price, stock, category, brand when already resolved) — that data
// is refreshed by every sync run and this endpoint running concurrently
// with different values would just fight it. See README note in the repo
// root, or ask an admin, for the current PRODUCT_ENRICH_SECRET value.
export const dynamic = "force-dynamic";

type EnrichItem = {
  sku: string;
  name?: string;
  // The manufacturer's own model number/code — NOT part of `name`, and not
  // sync-owned the way name/price/stock/category are (the inventory sync
  // only ever writes this from a MODEL-classified Excel column when one
  // exists; a huge share of products have no such column at all, so this
  // sits empty forever unless filled here). Written only when currently
  // empty, same as description — pass `overwrite: ["model"]` to replace an
  // existing (possibly wrong) one.
  model?: string;
  // A real, structured field — not scraped guesswork — for products whose
  // manufacturer sells the exact same model at multiple finishes, each
  // with its own real model number (e.g. Hidurit's M-LR8 "רוז גולד" vs
  // M-LB8 "שחור" at the same capacity). Same fill-then-overwrite semantics
  // as every other field here.
  colorName?: string;
  description?: string;
  // Where the description text was scraped from — stored on the product,
  // admin-only, independent of whether `description` itself was written
  // this call (lets a later call attach a source to content saved earlier).
  descriptionSourceUrl?: string;
  technicalSpec?: Record<string, string | number | boolean>;
  specSourceUrl?: string;
  images?: (string | EnrichImageInput)[];
  // Removes specific existing images by exact URL — the surgical tool for
  // "this one photo is wrong, the others are fine," as opposed to
  // `replaceImages` (wipes and replaces the *entire* set). Runs before
  // `images`/`appendImages` are applied in the same call, so one request
  // can remove a bad photo and add its replacement together.
  removeImages?: string[];
  // Per-item override for the top-level `appendImages` request flag — lets
  // one batch mix "first photo for a bare product" items with "add more
  // photos to one that already has some" items.
  appendImages?: boolean;
  // Per-item override for `replaceImages` — takes priority over
  // appendImages when both are set, since "wipe and replace" is the more
  // explicit, more destructive instruction of the two.
  replaceImages?: boolean;
  // Per-item override for `overwriteDescription`.
  overwriteDescription?: boolean;
  brand?: string;
  category?: string;
  warranty?: string | number;
  supplier?: string;
  sourceUrl?: string;
  // Per-item override for the top-level `sourceBackfillOnly` flag. When
  // true, this item writes ONLY source-provenance metadata — Product's
  // descriptionSourceUrl/specSourceUrl, and sourcePageUrl/sourceImageUrl/
  // sourceDomain/capturedAt on images matched by URL to ones that already
  // exist on the product — and nothing else: no content field is written,
  // no image is created/replaced/removed, even if this same item also sets
  // description/technicalSpec/images/replaceImages/appendImages. Exists so
  // a catalog that was enriched before source-tracking existed can be
  // backfilled with provenance after the fact, without re-touching content
  // that's already correct.
  sourceBackfillOnly?: boolean;
  // Per-item override for the top-level `overwrite` array — an explicit,
  // field-by-field opt-in to replace a value that's already set (this
  // endpoint's default, everywhere else, is "never touch a filled field").
  // A specific field name, never a blanket boolean, so overwriting one
  // field can never accidentally wipe another (e.g. asking to fix a wrong
  // `brand` can't also silently clobber a good `description`). Supported:
  // "brand", "supplier", "warranty", "model", "colorName", "description"
  // (equivalent to overwriteDescription:true), "technicalSpec.<key>" for
  // one specific spec field, and "images" (replaces the whole image set —
  // equivalent to replaceImages:true — when `images` is also given and
  // neither appendImages nor replaceImages is set explicitly). Must be a
  // real array — a non-array value (e.g. `true`) is a validation error,
  // not something silently ignored or crashed on. `category`/`name` are
  // never overwritable here regardless — those stay owned by inventory
  // sync, full stop.
  overwrite?: string[];
};

type OverwriteOutcome = { field: string; previousValue: string };

// The backfill-only path: writes nothing but source-provenance metadata.
// Product.descriptionSourceUrl/specSourceUrl are set independent of the
// content fields (they may already be set from a prior real enrichment
// call), and each images[] entry's source fields are copied onto the
// *existing* ProductImage row with a matching url — never onto a new one,
// since backfill mode's whole point is to attach history to content that's
// already correct, not to add anything.
async function processSourceBackfill(item: EnrichItem, dryRun: boolean) {
  const sku = (item.sku ?? "").trim();
  if (!sku) return { sku: item.sku ?? "", matched: false, error: "missing sku" };

  // Note: item.overwrite's shape is already validated by processItem
  // before it routes here (sourceBackfillOnly is checked after that
  // validation), so no need to re-check it in this function.
  const product = await db.product.findUnique({
    where: { sku },
    select: { id: true, slug: true, images: { select: { id: true, url: true } } },
  });
  if (!product) return { sku, matched: false };

  const applied: string[] = [];
  const skipped: FieldOutcome[] = [];
  const productUpdate: Record<string, unknown> = {};

  if (item.descriptionSourceUrl !== undefined) {
    productUpdate.descriptionSourceUrl = item.descriptionSourceUrl || null;
    applied.push("descriptionSourceUrl");
  }
  if (item.specSourceUrl !== undefined) {
    productUpdate.specSourceUrl = item.specSourceUrl || null;
    applied.push("specSourceUrl");
  }

  const normalizedImages = normalizeImages(item.images);
  const imageUpdateList: (NormalizedImage & { id: string })[] = [];
  for (const img of normalizedImages) {
    const existing = product.images.find((pi) => pi.url === img.url);
    if (!existing) {
      skipped.push({ field: "images", reason: `no existing image with this url on the product — backfill never creates images: ${img.url}` });
      continue;
    }
    imageUpdateList.push({ ...img, id: existing.id });
    applied.push(`images[${img.url}].source`);
  }

  for (const field of ["description", "technicalSpec", "brand", "supplier", "warranty"] as const) {
    if (item[field] !== undefined) {
      skipped.push({ field, reason: "sourceBackfillOnly — content fields are never written in backfill mode" });
    }
  }
  if (item.replaceImages || item.appendImages) {
    skipped.push({
      field: "images",
      reason: "sourceBackfillOnly — no image is created/replaced, only source metadata updated on existing ones",
    });
  }

  if (dryRun) {
    return { sku, matched: true, productId: product.id, slug: product.slug, dryRun: true, applied, skipped };
  }

  if (Object.keys(productUpdate).length > 0) {
    await db.product.update({ where: { id: product.id }, data: productUpdate });
  }
  for (const u of imageUpdateList) {
    await db.productImage.update({
      where: { id: u.id },
      data: { sourcePageUrl: u.sourcePageUrl, sourceImageUrl: u.sourceImageUrl, sourceDomain: u.sourceDomain, capturedAt: u.capturedAt },
    });
  }

  if (applied.length > 0) {
    await logAudit({
      actorId: null,
      action: "PRODUCT_ENRICHMENT_SOURCE_BACKFILLED",
      entityType: "Product",
      entityId: product.id,
      metadata: { sku, applied },
    });
    revalidatePath(`/product/${product.slug}`);
  }

  return { sku, matched: true, productId: product.id, slug: product.slug, applied, skipped };
}

async function processItem(
  item: EnrichItem,
  dryRun: boolean,
  defaults: {
    appendImages: boolean;
    replaceImages: boolean;
    overwriteDescription: boolean;
    sourceBackfillOnly: boolean;
    overwrite: string[];
  }
) {
  const sku = (item.sku ?? "").trim();
  if (!sku) return { sku: item.sku ?? "", matched: false, error: "missing sku" };
  // `item.overwrite` comes straight from parsed JSON with no runtime type
  // check — a caller sending `overwrite: true` (mistaking it for a plain
  // boolean flag, like appendImages/overwriteDescription) used to crash
  // `new Set(true)` with "boolean true is not iterable", and silently
  // falling back to the request default isn't right either — a malformed
  // `overwrite` on one item is a mistake worth surfacing loudly on that
  // item, not swallowing.
  if (item.overwrite !== undefined && !Array.isArray(item.overwrite)) {
    return { sku, matched: false, error: '"overwrite" must be an array of field names, e.g. ["brand"] — got a non-array value' };
  }
  if (item.sourceBackfillOnly ?? defaults.sourceBackfillOnly) return processSourceBackfill(item, dryRun);
  const appendImages = item.appendImages ?? defaults.appendImages;
  const replaceImages = item.replaceImages ?? defaults.replaceImages;
  const overwriteDescription = item.overwriteDescription ?? defaults.overwriteDescription;
  const overwriteSet = new Set(
    item.overwrite ? item.overwrite.filter((f): f is string => typeof f === "string") : defaults.overwrite
  );

  const product = await db.product.findUnique({
    where: { sku },
    include: {
      brand: true,
      supplier: { select: { name: true } },
      images: { select: { id: true, url: true } },
      attributeValues: { select: { id: true, attributeId: true, value: true } },
    },
  });
  if (!product) return { sku, matched: false };
  const existingRawSpecs: Record<string, string> = product.extraSpecsRaw ? JSON.parse(product.extraSpecsRaw) : {};

  const applied: string[] = [];
  const skipped: FieldOutcome[] = [];
  const overwritten: OverwriteOutcome[] = [];
  const updateData: Record<string, unknown> = {};

  // Sync-owned fields: never touched here, regardless of dry-run, so the
  // caller can see explicitly that these were considered and rejected
  // rather than silently ignored.
  if (item.name !== undefined) skipped.push({ field: "name", reason: "owned by inventory sync (title) — not overwritten here" });
  if (item.category !== undefined) skipped.push({ field: "category", reason: "owned by inventory sync — not overwritten here" });

  if (item.model !== undefined) {
    if (!product.model) {
      updateData.model = item.model;
      applied.push("model");
    } else if (overwriteSet.has("model")) {
      overwritten.push({ field: "model", previousValue: product.model });
      updateData.model = item.model;
      applied.push("model (overwritten)");
    } else {
      skipped.push({ field: "model", reason: `already set (${product.model}) — pass overwrite: ["model"] to replace it` });
    }
  }

  if (item.colorName !== undefined) {
    if (!product.colorName) {
      updateData.colorName = item.colorName;
      applied.push("colorName");
    } else if (overwriteSet.has("colorName")) {
      overwritten.push({ field: "colorName", previousValue: product.colorName });
      updateData.colorName = item.colorName;
      applied.push("colorName (overwritten)");
    } else {
      skipped.push({ field: "colorName", reason: `already set (${product.colorName}) — pass overwrite: ["colorName"] to replace it` });
    }
  }

  if (item.description !== undefined) {
    if (!product.description) {
      updateData.description = item.description;
      applied.push("description");
    } else if (overwriteDescription || overwriteSet.has("description")) {
      overwritten.push({ field: "description", previousValue: product.description });
      updateData.description = item.description;
      applied.push("description (overwritten)");
    } else {
      skipped.push({ field: "description", reason: "already set (pass overwriteDescription: true, or overwrite: [\"description\"], to replace it)" });
    }
  }

  // Provenance fields — written independent of the content field itself,
  // so a source URL can be attached whether or not `description`/
  // `technicalSpec` were actually written by this same call.
  if (item.descriptionSourceUrl !== undefined) {
    updateData.descriptionSourceUrl = item.descriptionSourceUrl || null;
    applied.push("descriptionSourceUrl");
  }
  if (item.specSourceUrl !== undefined) {
    updateData.specSourceUrl = item.specSourceUrl || null;
    applied.push("specSourceUrl");
  }

  if (item.brand !== undefined) {
    if (product.brand.name === "לא ידוע") {
      if (!dryRun) updateData.brandId = await findOrCreateBrandId(item.brand);
      applied.push("brand");
    } else if (overwriteSet.has("brand")) {
      overwritten.push({ field: "brand", previousValue: product.brand.name });
      if (!dryRun) updateData.brandId = await findOrCreateBrandId(item.brand);
      applied.push("brand (overwritten)");
    } else {
      skipped.push({ field: "brand", reason: `already set (${product.brand.name}) — pass overwrite: ["brand"] to replace it` });
    }
  }

  if (item.supplier !== undefined) {
    if (!product.supplierId) {
      if (!dryRun) updateData.supplierId = await findOrCreateSupplierId(item.supplier);
      applied.push("supplier");
    } else if (overwriteSet.has("supplier")) {
      overwritten.push({ field: "supplier", previousValue: product.supplier?.name ?? product.supplierId });
      if (!dryRun) updateData.supplierId = await findOrCreateSupplierId(item.supplier);
      applied.push("supplier (overwritten)");
    } else {
      skipped.push({ field: "supplier", reason: 'already set — pass overwrite: ["supplier"] to replace it' });
    }
  }

  if (item.warranty !== undefined) {
    const months = parseWarrantyMonths(item.warranty);
    if (months === null) {
      skipped.push({ field: "warranty", reason: "could not parse a month count from the given value" });
    } else if (product.warrantyMonths === 12) {
      updateData.warrantyMonths = months;
      applied.push("warranty");
    } else if (overwriteSet.has("warranty")) {
      overwritten.push({ field: "warranty", previousValue: `${product.warrantyMonths} months` });
      updateData.warrantyMonths = months;
      applied.push("warranty (overwritten)");
    } else {
      skipped.push({ field: "warranty", reason: `already set (${product.warrantyMonths} months) — pass overwrite: ["warranty"] to replace it` });
    }
  }

  // Specs preferentially fill a real CategoryAttribute this product's
  // category defines and doesn't already have a value for. A key that
  // doesn't match one — the common case when the source names its fields
  // differently than we do — isn't dropped: it's merged into extraSpecsRaw
  // as free text instead, so nothing scraped is silently lost, and an admin
  // (or a future request, once GET on this route is used to learn the real
  // keys) can still map it to a real field later.
  const specWrites: { attributeId: string; value: string }[] = [];
  const specOverwrites: { valueId: string; value: string }[] = [];
  const rawSpecWrites: Record<string, string> = {};
  if (item.technicalSpec && Object.keys(item.technicalSpec).length > 0) {
    const attributes = await db.categoryAttribute.findMany({ where: { categoryId: product.categoryId } });
    const existingByAttrId = new Map(product.attributeValues.map((v) => [v.attributeId, v]));
    const byKey = new Map(attributes.map((a) => [a.key.toLowerCase(), a]));
    const byLabel = new Map(attributes.map((a) => [a.label.trim(), a]));
    for (const [rawKey, rawValue] of Object.entries(item.technicalSpec)) {
      const attr = byKey.get(rawKey.trim().toLowerCase()) ?? byLabel.get(rawKey.trim());
      const wantsOverwrite = overwriteSet.has(`technicalSpec.${rawKey}`);
      if (!attr) {
        if (rawKey in existingRawSpecs) {
          if (wantsOverwrite) {
            overwritten.push({ field: `technicalSpec.${rawKey}`, previousValue: existingRawSpecs[rawKey] });
            rawSpecWrites[rawKey] = String(rawValue);
            applied.push(`technicalSpec.raw.${rawKey} (overwritten)`);
          } else {
            skipped.push({
              field: `technicalSpec.${rawKey}`,
              reason: `already saved as unmapped free text — pass overwrite: ["technicalSpec.${rawKey}"] to replace it`,
            });
          }
        } else {
          rawSpecWrites[rawKey] = String(rawValue);
          applied.push(`technicalSpec.raw.${rawKey}`);
        }
        continue;
      }
      const existingValue = existingByAttrId.get(attr.id);
      if (existingValue) {
        if (wantsOverwrite) {
          overwritten.push({ field: `technicalSpec.${rawKey}`, previousValue: existingValue.value });
          specOverwrites.push({ valueId: existingValue.id, value: String(rawValue) });
          applied.push(`technicalSpec.${rawKey} (overwritten)`);
        } else {
          skipped.push({
            field: `technicalSpec.${rawKey}`,
            reason: `already set — pass overwrite: ["technicalSpec.${rawKey}"] to replace it`,
          });
        }
        continue;
      }
      specWrites.push({ attributeId: attr.id, value: String(rawValue) });
      applied.push(`technicalSpec.${rawKey}`);
    }
  }

  // Surgical single/multi-image removal by exact URL — the tool for "this
  // one photo is wrong, keep the rest," which neither appendImages
  // (add-only) nor replaceImages (wipes *everything*) could do. Computed
  // as a logical "remaining images" view so every calculation below
  // (currentImageCount, dedup against existingUrls, the "already has
  // images" gate) sees the post-removal state even during a dry run,
  // before anything is actually deleted.
  const removeImageUrls = new Set(
    Array.isArray(item.removeImages) ? item.removeImages.filter((u): u is string => typeof u === "string") : []
  );
  const imagesToDelete = product.images.filter((img) => removeImageUrls.has(img.url));
  for (const url of removeImageUrls) {
    if (!product.images.some((img) => img.url === url)) {
      skipped.push({ field: "images", reason: `no existing image with this url to remove: ${url}` });
    }
  }
  if (imagesToDelete.length > 0) {
    for (const img of imagesToDelete) overwritten.push({ field: "images.remove", previousValue: img.url });
    applied.push(`images.remove (${imagesToDelete.length} removed)`);
  }
  const remainingImages = product.images.filter((img) => !removeImageUrls.has(img.url));

  const imageWrites: NormalizedImage[] = [];
  let imageCounts: { currentImageCount: number; imagesToAppend: number; resultingImageCount: number } | undefined;
  let replaceInfo: { currentImages: string[]; imagesToRemove: string[]; imagesToAdd: string[] } | undefined;
  let doReplaceImages = false;
  const normalizedImages = normalizeImages(item.images);

  // `overwrite: ["images"]` with a new `images` set, and neither
  // appendImages nor replaceImages set explicitly, behaves like
  // `replaceImages: true` — wipes the existing set and writes the new one.
  // `overwrite: ["images"]` with NO `images` payload does nothing to
  // replace, so it's surfaced as an explicit skip instead of silently
  // swallowed.
  const effectiveReplaceImages = replaceImages || (overwriteSet.has("images") && !appendImages && normalizedImages.length > 0);
  if (overwriteSet.has("images") && !appendImages && !replaceImages && normalizedImages.length === 0 && imagesToDelete.length === 0) {
    skipped.push({
      field: "images",
      reason: '"images" in overwrite needs an `images` array to replace with (or use removeImages: [url] to just delete one)',
    });
  }

  if (normalizedImages.length > 0) {
    if (effectiveReplaceImages) {
      const currentImages = remainingImages.map((img) => img.url);
      const requested = normalizedImages.filter((img) => img.url.startsWith("https://"));
      const capped = requested.slice(0, MAX_PRODUCT_IMAGES);
      for (const overflow of requested.slice(MAX_PRODUCT_IMAGES)) {
        skipped.push({ field: "images", reason: `would exceed the ${MAX_PRODUCT_IMAGES}-image max, not added: ${overflow.url}` });
      }

      const checks = await Promise.all(capped.map(async (img) => [img, await checkImageUrl(img.url)] as const));
      const unverifiedUrls: string[] = [];
      for (const [img, status] of checks) {
        if (status === "confirmed-bad") {
          skipped.push({ field: "images", reason: `URL confirmed dead (404/410), not saved: ${img.url}` });
        } else {
          imageWrites.push(img);
          if (status === "unverified") unverifiedUrls.push(img.url);
        }
      }

      // Only actually wipe the existing photos if there's at least one
      // valid replacement — if every candidate URL turned out dead, ending
      // up with zero images because the input was bad is worse than just
      // keeping what was already there and reporting why nothing changed.
      doReplaceImages = imageWrites.length > 0;
      replaceInfo = {
        currentImages,
        imagesToRemove: doReplaceImages ? currentImages : [],
        imagesToAdd: imageWrites.map((img) => img.url),
      };

      if (doReplaceImages) {
        applied.push(
          unverifiedUrls.length > 0
            ? `images.replace (${imageWrites.length} added, ${currentImages.length} removed, ${unverifiedUrls.length} could not be verified from our server — saved anyway, worth a manual check: ${unverifiedUrls.join(", ")})`
            : `images.replace (${imageWrites.length} added, ${currentImages.length} removed)`
        );
      } else if (currentImages.length > 0) {
        skipped.push({ field: "images", reason: "no valid replacement images (all candidates failed validation) — existing images kept" });
      }
    } else if (appendImages) {
      const currentImageCount = remainingImages.length;
      const existingUrls = new Set(remainingImages.map((img) => img.url));
      const slotsAvailable = Math.max(0, MAX_PRODUCT_IMAGES - currentImageCount);

      if (slotsAvailable === 0) {
        skipped.push({ field: "images", reason: `already at the ${MAX_PRODUCT_IMAGES}-image max, nothing appended` });
        imageCounts = { currentImageCount, imagesToAppend: 0, resultingImageCount: currentImageCount };
      } else {
        const requested = normalizedImages.filter((img) => img.url.startsWith("https://"));
        const newImages: NormalizedImage[] = [];
        for (const img of requested) {
          if (existingUrls.has(img.url)) skipped.push({ field: "images", reason: `already present on this product, not duplicated: ${img.url}` });
          else newImages.push(img);
        }

        const candidates = newImages.slice(0, slotsAvailable);
        for (const overflow of newImages.slice(slotsAvailable)) {
          skipped.push({ field: "images", reason: `would exceed the ${MAX_PRODUCT_IMAGES}-image max, not added: ${overflow.url}` });
        }

        const checks = await Promise.all(candidates.map(async (img) => [img, await checkImageUrl(img.url)] as const));
        const unverifiedUrls: string[] = [];
        for (const [img, status] of checks) {
          if (status === "confirmed-bad") {
            skipped.push({ field: "images", reason: `URL confirmed dead (404/410), not saved: ${img.url}` });
          } else {
            imageWrites.push(img);
            if (status === "unverified") unverifiedUrls.push(img.url);
          }
        }

        imageCounts = { currentImageCount, imagesToAppend: imageWrites.length, resultingImageCount: currentImageCount + imageWrites.length };

        if (imageWrites.length > 0) {
          applied.push(
            unverifiedUrls.length > 0
              ? `images.append (${imageWrites.length} added, ${unverifiedUrls.length} could not be verified from our server — saved anyway, worth a manual check: ${unverifiedUrls.join(", ")})`
              : "images.append"
          );
        }
      }
    } else if (remainingImages.length === 0) {
      const candidates = normalizedImages.filter((img) => img.url.startsWith("https://"));
      const checks = await Promise.all(candidates.map(async (img) => [img, await checkImageUrl(img.url)] as const));
      const unverifiedUrls: string[] = [];
      for (const [img, status] of checks) {
        if (status === "confirmed-bad") {
          skipped.push({ field: "images", reason: `URL confirmed dead (404/410), not saved: ${img.url}` });
        } else {
          imageWrites.push(img);
          if (status === "unverified") unverifiedUrls.push(img.url);
        }
      }
      if (imageWrites.length > 0) {
        applied.push(
          unverifiedUrls.length > 0
            ? `images (${unverifiedUrls.length} could not be verified from our server, likely bot/hotlink protection — saved anyway, worth a manual check: ${unverifiedUrls.join(", ")})`
            : "images"
        );
      }
    } else {
      skipped.push({
        field: "images",
        reason: "product already has images (pass appendImages: true to add more, or replaceImages: true to replace them)",
      });
    }
  }

  if (dryRun) {
    return {
      sku,
      matched: true,
      productId: product.id,
      slug: product.slug,
      dryRun: true,
      applied,
      overwritten,
      skipped,
      ...imageCounts,
      ...replaceInfo,
    };
  }

  if (Object.keys(rawSpecWrites).length > 0) {
    updateData.extraSpecsRaw = JSON.stringify({ ...existingRawSpecs, ...rawSpecWrites });
  }

  // Attaching a source URL to content that was already there is bookkeeping,
  // not enrichment, so those two fields alone must not flip the status.
  const PROVENANCE_ONLY = new Set(["descriptionSourceUrl", "specSourceUrl"]);
  const wroteContent =
    applied.some((field) => !PROVENANCE_ONLY.has(field)) ||
    specWrites.length > 0 ||
    specOverwrites.length > 0;

  // Marks the product as curated. Nothing set enrichmentStatus before this,
  // so it sat at NOT_ENRICHED for the whole catalog and no consumer could
  // tell a hand-finished product from a raw sheet import — which is what the
  // nightly sync needs in order to know whose title and category to leave
  // alone (see applyOneRow in src/lib/inventory/sync.ts).
  if (wroteContent && product.enrichmentStatus !== "ENRICHED") {
    updateData.enrichmentStatus = "ENRICHED";
  }

  if (Object.keys(updateData).length > 0) {
    await db.product.update({ where: { id: product.id }, data: updateData });
  }
  if (specWrites.length > 0) {
    await db.productAttributeValue.createMany({
      data: specWrites.map((s) => ({ productId: product.id, attributeId: s.attributeId, value: s.value })),
    });
  }
  for (const s of specOverwrites) {
    await db.productAttributeValue.update({ where: { id: s.valueId }, data: { value: s.value } });
  }
  if (imagesToDelete.length > 0) {
    await db.productImage.deleteMany({ where: { id: { in: imagesToDelete.map((img) => img.id) } } });
  }
  if (imageWrites.length > 0) {
    if (doReplaceImages) {
      await db.productImage.deleteMany({ where: { productId: product.id } });
    }
    // Appending starts numbering after whatever's already there — starting
    // back at 0 would collide with (and reshuffle) the existing photos'
    // sortOrder instead of landing after them. Replacing always starts
    // fresh at 0, same as a brand-new set.
    const sortOrderOffset = appendImages && !doReplaceImages ? remainingImages.length : 0;
    await db.productImage.createMany({
      data: imageWrites.map((img, i) => ({
        productId: product.id,
        url: img.url,
        sortOrder: sortOrderOffset + i,
        sourcePageUrl: img.sourcePageUrl,
        sourceImageUrl: img.sourceImageUrl,
        sourceDomain: img.sourceDomain,
        capturedAt: img.capturedAt,
      })),
    });
  }

  if (applied.length > 0) {
    await logAudit({
      actorId: null,
      action: "PRODUCT_ENRICHED_EXTERNAL",
      entityType: "Product",
      entityId: product.id,
      metadata: { sku, applied, sourceUrl: item.sourceUrl ?? null },
    });
    revalidatePath(`/product/${product.slug}`);
    revalidatePath("/admin/inventory");
  }

  return { sku, matched: true, productId: product.id, slug: product.slug, applied, overwritten, skipped, ...imageCounts, ...replaceInfo };
}

// Lets a caller learn the exact `technicalSpec` keys this site actually
// recognizes per category *before* sending data — the old site's field
// names essentially never match ours 1:1, so guessing keys just means
// everything falls back to extraSpecsRaw instead of a real, filterable
// spec field. `?category=<slug>` narrows to one category; omitted returns
// every category that has at least one spec field defined.
export async function GET(request: Request) {
  const authError = checkAuth(request);
  if (authError) return authError;

  const categorySlug = new URL(request.url).searchParams.get("category");
  const [categories, allCategories] = await Promise.all([
    db.category.findMany({
      where: {
        ...(categorySlug ? { slug: categorySlug } : {}),
        attributes: { some: {} },
      },
      select: {
        slug: true,
        name: true,
        attributes: {
          orderBy: { sortOrder: "asc" },
          select: { key: true, label: true, unit: true, inputType: true, options: true },
        },
      },
      orderBy: { name: "asc" },
    }),
    // Every category, not just ones with defined spec fields — this is what
    // POST /api/integrations/products validates a new product's `category`
    // against, since a category with no CategoryAttribute yet is still a
    // perfectly valid place to file a product.
    db.category.findMany({ select: { slug: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return NextResponse.json({
    categories: categories.map((c) => ({
      slug: c.slug,
      name: c.name,
      attributes: c.attributes.map((a) => ({
        key: a.key,
        label: a.label,
        unit: a.unit,
        inputType: a.inputType,
        options: a.options ? JSON.parse(a.options) : null,
      })),
    })),
    allCategories,
  });
}

export async function POST(request: Request) {
  const authError = checkAuth(request);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  if (record.overwrite !== undefined && !Array.isArray(record.overwrite)) {
    return NextResponse.json(
      { error: '"overwrite" must be an array of field names, e.g. ["brand"] — got a non-array value' },
      { status: 400 }
    );
  }
  const dryRun = record.dryRun === true;
  const defaults = {
    appendImages: record.appendImages === true,
    replaceImages: record.replaceImages === true,
    overwriteDescription: record.overwriteDescription === true,
    sourceBackfillOnly: record.sourceBackfillOnly === true,
    overwrite: Array.isArray(record.overwrite) ? record.overwrite.filter((f): f is string => typeof f === "string") : [],
  };
  const items: EnrichItem[] = Array.isArray(record.items)
    ? (record.items as EnrichItem[])
    : typeof record.sku === "string"
      ? [record as unknown as EnrichItem]
      : [];

  if (items.length === 0) {
    return NextResponse.json({ error: "provide either a single object with `sku`, or `{ items: [...] }`" }, { status: 400 });
  }
  if (items.length > 200) {
    return NextResponse.json({ error: "max 200 items per request" }, { status: 400 });
  }

  const results = [];
  for (const item of items) {
    try {
      results.push(await processItem(item, dryRun, defaults));
    } catch (err) {
      results.push({ sku: item.sku ?? "", matched: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  // Whatever this batch just filled in (or emptied out) might change
  // whether a product still qualifies as "missing both image and spec" —
  // one pass at the end of the batch, not per item, since it scans the
  // whole catalog each time.
  if (!dryRun) await reconcileUrgentMissingMedia();

  return NextResponse.json({ dryRun, count: results.length, results });
}
