import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { reconcileUrgentMissingMedia, reconcileMissingImage } from "@/lib/inventory/sync";
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
  // Accepted and explicitly refused, so a caller that sends them gets a
  // reason back instead of silence. These come from the supplier's sheet.
  price?: number;
  stockQty?: number;
  name?: string;
  // The manufacturer's own model number/code — NOT part of `name`. The
  // import only ever fills it from a MODEL-classified Excel column, and a
  // large share of sheets have no such column, so for most products this
  // arrives empty and stays that way unless it is set here.
  model?: string;
  // A real, structured field — not scraped guesswork — for products whose
  // manufacturer sells the exact same model at multiple finishes, each
  // with its own real model number (e.g. Hidurit's M-LR8 "רוז גולד" vs
  // M-LB8 "שחור" at the same capacity).
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
  // Kept so existing callers keep working; it no longer gates anything.
  // Every field sent is written now, which is exactly what listing a field
  // here used to opt into. Still validated as an array so a caller sending
  // `overwrite: true` learns their assumption is wrong rather than having
  // it silently ignored.
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
// Every image branch used to filter with `url.startsWith("https://")` and
// throw the rest away without a word — an http:// photo was dropped in
// silence, so a caller got a successful response, no image, and nothing in
// `skipped` explaining it. Israeli manufacturer and importer sites still
// serve plenty of images over plain http, which made this the quietest way
// for a product to arrive without its picture.
//
// http:// is accepted now (the page loads it exactly as it loads any other
// remote image — next.config sets images.unoptimized, so nothing rewrites
// the URL), and anything that is not an http(s) URL at all is reported
// instead of vanishing.
function usableImageUrls(images: NormalizedImage[], skipped: FieldOutcome[]): NormalizedImage[] {
  const usable: NormalizedImage[] = [];
  for (const img of images) {
    if (/^https?:\/\//i.test(img.url)) usable.push(img);
    else skipped.push({ field: "images", reason: `not an http(s) URL, not saved: ${img.url}` });
  }
  return usable;
}

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
  // appendImages is the one image flag that still changes anything: adding
  // to the existing set rather than replacing it. replaceImages,
  // overwriteDescription and overwrite are still accepted so existing
  // callers keep working, but they no longer gate anything — every field
  // sent is written now, which is what they were used to opt into.
  const appendImages = item.appendImages ?? defaults.appendImages;

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

  // Every content field below follows one rule: sent means written. The
  // fill-only, opt-in-to-overwrite model this endpoint used to enforce
  // existed to stop it fighting the nightly sync, which re-derived title,
  // category and brand from the supplier sheet every morning and would
  // have undone anything written here. That cron is gone, so the only
  // thing the restriction still did was make the caller guess which of its
  // values would silently land and which would not.
  //
  // What replaces the guard is the record: `overwritten` reports the
  // previous value of anything replaced, and every call is written to the
  // audit log. Send `dryRun: true` to see exactly what a call would change
  // before it changes it.
  //
  // Price, stockQty and sku stay out — they are the product's commercial
  // identity and come from the supplier's own sheet, not from content
  // enrichment.
  if (item.price !== undefined) skipped.push({ field: "price", reason: "not settable here — price comes from the supplier sheet" });
  if (item.stockQty !== undefined) skipped.push({ field: "stockQty", reason: "not settable here — stock comes from the supplier sheet" });

  const setField = (field: string, next: string, previous: string | null) => {
    if (previous) overwritten.push({ field, previousValue: previous });
    updateData[field] = next;
    applied.push(previous ? `${field} (replaced)` : field);
  };

  if (item.name !== undefined) {
    const title = String(item.name).trim();
    if (!title) {
      skipped.push({ field: "name", reason: "empty title — a product must keep a name" });
    } else {
      // The slug is deliberately left alone: it is public in the product
      // URL, so renaming a product must not break links already shared.
      setField("title", title, product.title);
    }
  }

  if (item.category !== undefined) {
    const slug = String(item.category).trim();
    const category = slug ? await db.category.findUnique({ where: { slug }, select: { id: true, slug: true } }) : null;
    if (!category) {
      skipped.push({
        field: "category",
        reason: `no category with slug "${slug}" — GET this endpoint for the full list of valid slugs`,
      });
    } else if (category.id === product.categoryId) {
      skipped.push({ field: "category", reason: `already in "${slug}"` });
    } else {
      // Spec values belong to the category's own attributes, so moving a
      // product to a different category leaves any existing ones pointing
      // at fields the new category does not define. Reported rather than
      // silently dropped — the caller usually wants to resend specs.
      if (product.attributeValues.length > 0) {
        skipped.push({
          field: "technicalSpec",
          reason: `${product.attributeValues.length} existing spec value(s) belong to the previous category — resend technicalSpec for the new one`,
        });
      }
      setField("categoryId", category.id, product.categoryId);
    }
  }

  if (item.model !== undefined) setField("model", item.model, product.model);
  if (item.colorName !== undefined) setField("colorName", item.colorName, product.colorName);
  if (item.description !== undefined) setField("description", item.description, product.description);

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
    const name = String(item.brand).trim();
    if (!name) {
      skipped.push({ field: "brand", reason: "empty brand name" });
    } else if (name === product.brand.name) {
      skipped.push({ field: "brand", reason: `already set to "${name}"` });
    } else {
      // "לא ידוע" is the placeholder the import assigns when it cannot
      // derive a manufacturer, so replacing it is a fill, not a rewrite.
      const previous = product.brand.name === "לא ידוע" ? null : product.brand.name;
      if (previous) overwritten.push({ field: "brand", previousValue: previous });
      if (!dryRun) updateData.brandId = await findOrCreateBrandId(name);
      applied.push(previous ? "brand (replaced)" : "brand");
    }
  }

  if (item.supplier !== undefined) {
    const name = String(item.supplier).trim();
    if (!name) {
      skipped.push({ field: "supplier", reason: "empty supplier name" });
    } else {
      const previous = product.supplier?.name ?? null;
      if (previous) overwritten.push({ field: "supplier", previousValue: previous });
      if (!dryRun) updateData.supplierId = await findOrCreateSupplierId(name);
      applied.push(previous ? "supplier (replaced)" : "supplier");
    }
  }

  if (item.warranty !== undefined) {
    const months = parseWarrantyMonths(item.warranty);
    if (months === null) {
      skipped.push({ field: "warranty", reason: "could not parse a month count from the given value" });
    } else if (months === product.warrantyMonths) {
      skipped.push({ field: "warranty", reason: `already set to ${months} months` });
    } else {
      // 12 is the schema default rather than a stated warranty, so moving
      // off it is a fill; anything else is a real replacement.
      const previous = product.warrantyMonths === 12 ? null : `${product.warrantyMonths} months`;
      if (previous) overwritten.push({ field: "warranty", previousValue: previous });
      updateData.warrantyMonths = months;
      applied.push(previous ? "warranty (replaced)" : "warranty");
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
      if (!attr) {
        const previous = rawKey in existingRawSpecs ? existingRawSpecs[rawKey] : null;
        if (previous !== null) overwritten.push({ field: `technicalSpec.${rawKey}`, previousValue: previous });
        rawSpecWrites[rawKey] = String(rawValue);
        applied.push(previous !== null ? `technicalSpec.raw.${rawKey} (replaced)` : `technicalSpec.raw.${rawKey}`);
        continue;
      }
      const existingValue = existingByAttrId.get(attr.id);
      if (existingValue) {
        overwritten.push({ field: `technicalSpec.${rawKey}`, previousValue: existingValue.value });
        specOverwrites.push({ valueId: existingValue.id, value: String(rawValue) });
        applied.push(`technicalSpec.${rawKey} (replaced)`);
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
  // Sending `images` means "this is the product's photo set". With no
  // explicit appendImages, that replaces whatever is there — the old
  // default refused the write entirely and told the caller to pick a flag,
  // which is the same silent-nothing-happened outcome as an http:// URL.
  const effectiveReplaceImages = !appendImages && normalizedImages.length > 0;
  if (normalizedImages.length > 0) {
    if (effectiveReplaceImages) {
      const currentImages = remainingImages.map((img) => img.url);
      const requested = usableImageUrls(normalizedImages, skipped);
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
        const requested = usableImageUrls(normalizedImages, skipped);
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
      const candidates = usableImageUrls(normalizedImages, skipped);
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

  // ENRICHED means "a person or agent has curated this product's content",
  // and the inventory sync reads it to decide whose title and category to
  // leave alone. Two kinds of write must therefore not set it.
  //
  // Provenance is bookkeeping: attaching a source URL to text that was
  // already there says nothing about the text.
  //
  // A photo is not curation either, and treating it as such was actively
  // harmful: sheet-map files every imported row under a broad category,
  // structured specs hang off leaf categories, and ENRICHED freezes the
  // category the sync would otherwise have corrected. So an agent that did
  // nothing but add a picture permanently locked the product out of ever
  // holding a filterable spec.
  const NON_CURATING = /^(descriptionSourceUrl|specSourceUrl|images)/;
  const wroteContent =
    applied.some((field) => !NON_CURATING.test(field)) ||
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

  // Whatever this batch just filled in (or emptied out) changes which
  // products belong in the "טיפול" queue. Both reconcilers run, not just
  // the first: reconcileUrgentMissingMedia clears products that had
  // neither a photo nor a spec, and reconcileMissingImage clears the ones
  // that were only missing a photo — without it, a product the agent just
  // photographed kept sitting in the queue asking for a photo. One pass at
  // the end of the batch, not per item, since each scans the catalog.
  if (!dryRun) {
    await reconcileUrgentMissingMedia();
    await reconcileMissingImage();
  }

  return NextResponse.json({ dryRun, count: results.length, results });
}
