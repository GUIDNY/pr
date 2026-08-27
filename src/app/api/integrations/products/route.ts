import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import {
  checkAuth,
  MAX_PRODUCT_IMAGES,
  normalizeImages,
  checkImageUrl,
  findOrCreateBrandId,
  findOrCreateSupplierId,
  parseWarrantyMonths,
  generateProductSlug,
  type FieldOutcome,
  type EnrichImageInput,
  type NormalizedImage,
} from "@/lib/integrations/product-enrich-shared";

// Bearer-token-protected endpoint (same PRODUCT_ENRICH_SECRET as
// /api/integrations/product-enrich) for an external agent to create a
// *brand-new* product that doesn't exist here at all. product-enrich only
// ever fills gaps on a product matched by SKU and refuses to touch one it
// can't find — this is the other half: bringing a new SKU into existence in
// the first place.
//
// Every product created here lands with isPublished:false, no exceptions —
// this is unreviewed content from an external agent, and the site already
// has a real place for a human to review + go live: /admin/inventory's
// "מוכן לפרסום" (ready to publish) view is exactly isPublished:false +
// stockQty>0 + price>0 + no open alerts, which is precisely what a clean
// creation here produces.
export const dynamic = "force-dynamic";

type CreateItem = {
  sku: string;
  title: string;
  brand: string;
  category: string; // category slug — must already exist, never auto-created
  price: number;
  model?: string;
  colorName?: string;
  description?: string;
  descriptionSourceUrl?: string;
  technicalSpec?: Record<string, string | number | boolean>;
  specSourceUrl?: string;
  images?: (string | EnrichImageInput)[];
  warranty?: string | number;
  supplier?: string;
  stockQty?: number;
  sourceUrl?: string;
};

async function processCreateItem(item: CreateItem, dryRun: boolean) {
  const sku = (item.sku ?? "").trim();
  if (!sku) return { sku: item.sku ?? "", created: false, error: "missing sku" };

  const title = (item.title ?? "").trim();
  if (!title) return { sku, created: false, error: "missing title" };

  const brandName = (item.brand ?? "").trim();
  if (!brandName) return { sku, created: false, error: "missing brand" };

  const categorySlug = (item.category ?? "").trim();
  if (!categorySlug) return { sku, created: false, error: "missing category" };

  if (!Number.isFinite(item.price) || item.price <= 0) {
    return { sku, created: false, error: "price must be a positive number" };
  }

  const [existing, category] = await Promise.all([
    db.product.findUnique({ where: { sku }, select: { id: true } }),
    db.category.findUnique({ where: { slug: categorySlug }, select: { id: true } }),
  ]);
  if (existing) {
    return {
      sku,
      created: false,
      error: `SKU already exists (product ${existing.id}) — use POST /api/integrations/product-enrich to update it instead`,
    };
  }
  if (!category) {
    return {
      sku,
      created: false,
      error: `unknown category slug "${categorySlug}" — call GET /api/integrations/product-enrich to see allCategories`,
    };
  }

  const warnings: FieldOutcome[] = [];

  let warrantyMonths: number | undefined;
  if (item.warranty !== undefined) {
    const months = parseWarrantyMonths(item.warranty);
    if (months === null) warnings.push({ field: "warranty", reason: "could not parse a month count — left at the 12-month default" });
    else warrantyMonths = months;
  }

  const stockQty = Number.isFinite(item.stockQty) && (item.stockQty as number) >= 0 ? Math.floor(item.stockQty as number) : 0;

  const normalizedImages = normalizeImages(item.images).filter((img) => img.url.startsWith("https://"));
  const capped = normalizedImages.slice(0, MAX_PRODUCT_IMAGES);
  for (const overflow of normalizedImages.slice(MAX_PRODUCT_IMAGES)) {
    warnings.push({ field: "images", reason: `would exceed the ${MAX_PRODUCT_IMAGES}-image max, not added: ${overflow.url}` });
  }
  const checks = await Promise.all(capped.map(async (img) => [img, await checkImageUrl(img.url)] as const));
  const imageWrites: NormalizedImage[] = [];
  for (const [img, status] of checks) {
    if (status === "confirmed-bad") warnings.push({ field: "images", reason: `URL confirmed dead (404/410), not saved: ${img.url}` });
    else imageWrites.push(img);
  }

  // Same "match a real CategoryAttribute, else keep as free text" rule as
  // product-enrich — there's no "already set" check here since the product
  // (and therefore its spec values) don't exist yet.
  const specWrites: { attributeId: string; value: string }[] = [];
  const rawSpecWrites: Record<string, string> = {};
  if (item.technicalSpec && Object.keys(item.technicalSpec).length > 0) {
    const attributes = await db.categoryAttribute.findMany({ where: { categoryId: category.id } });
    const byKey = new Map(attributes.map((a) => [a.key.toLowerCase(), a]));
    const byLabel = new Map(attributes.map((a) => [a.label.trim(), a]));
    for (const [rawKey, rawValue] of Object.entries(item.technicalSpec)) {
      const attr = byKey.get(rawKey.trim().toLowerCase()) ?? byLabel.get(rawKey.trim());
      if (!attr) rawSpecWrites[rawKey] = String(rawValue);
      else specWrites.push({ attributeId: attr.id, value: String(rawValue) });
    }
  }

  const slug = generateProductSlug(title, sku);

  if (dryRun) {
    return {
      sku,
      created: true,
      dryRun: true,
      wouldCreateSlug: slug,
      isPublished: false,
      imagesToCreate: imageWrites.map((i) => i.url),
      specFieldsMatched: specWrites.length,
      specFieldsUnmapped: Object.keys(rawSpecWrites).length,
      warnings,
    };
  }

  const brandId = await findOrCreateBrandId(brandName);
  const supplierId = item.supplier ? await findOrCreateSupplierId(item.supplier) : undefined;

  const product = await db.product.create({
    data: {
      sku,
      title,
      slug,
      model: item.model?.trim() || null,
      colorName: item.colorName?.trim() || null,
      brandId,
      categoryId: category.id,
      price: item.price,
      description: item.description?.trim() || null,
      descriptionSourceUrl: item.descriptionSourceUrl || null,
      specSourceUrl: item.specSourceUrl || null,
      warrantyMonths: warrantyMonths ?? undefined,
      stockQty,
      stockStatus: stockQty > 0 ? "IN_STOCK" : "OUT_OF_STOCK",
      supplierId,
      isPublished: false,
      extraSpecsRaw: Object.keys(rawSpecWrites).length > 0 ? JSON.stringify(rawSpecWrites) : null,
    },
  });

  if (specWrites.length > 0) {
    await db.productAttributeValue.createMany({
      data: specWrites.map((s) => ({ productId: product.id, attributeId: s.attributeId, value: s.value })),
    });
  }
  if (imageWrites.length > 0) {
    await db.productImage.createMany({
      data: imageWrites.map((img, i) => ({
        productId: product.id,
        url: img.url,
        sortOrder: i,
        sourcePageUrl: img.sourcePageUrl,
        sourceImageUrl: img.sourceImageUrl,
        sourceDomain: img.sourceDomain,
        capturedAt: img.capturedAt,
      })),
    });
  }

  await logAudit({
    actorId: null,
    action: "PRODUCT_CREATED_EXTERNAL",
    entityType: "Product",
    entityId: product.id,
    metadata: { sku, sourceUrl: item.sourceUrl ?? null },
  });
  revalidatePath("/admin/inventory");

  return {
    sku,
    created: true,
    productId: product.id,
    slug: product.slug,
    isPublished: false,
    imagesCreated: imageWrites.length,
    specFieldsMatched: specWrites.length,
    specFieldsUnmapped: Object.keys(rawSpecWrites).length,
    warnings,
  };
}

const LIST_MAX_LIMIT = 200;

// GET on the same resource path = "list every product," not just the ones
// currently flagged by an alert (see /api/integrations/products-needing-
// attention, which only surfaces the worst case — an *automatic* flag only
// fires when a product has NO image AND NO spec AND NO raw spec text all at
// once). This is the broader sweep: page through the entire catalog, or
// narrow to `onlyIncomplete=true` for anything missing at least one of
// image/spec/description individually, even if not bad enough to be
// auto-flagged or unpublished.
export async function GET(request: Request) {
  const authError = checkAuth(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(Math.floor(limitParam), LIST_MAX_LIMIT) : 50;
  // Cursor = the last `sku` seen on the previous page (products are
  // ordered by sku ascending, so this is stable across pages even as other
  // products are created/edited concurrently).
  const after = url.searchParams.get("after");
  const onlyIncomplete = url.searchParams.get("onlyIncomplete") === "true";
  // ?hasModel=false narrows to products with no manufacturer model number
  // at all — the real blocker for enrichment (a missing image/spec can
  // often still be found from a description alone; a missing model number
  // usually means the product can't be matched to the manufacturer's own
  // site at all). ?hasModel=true is the inverse, mostly useful for
  // spot-checking.
  const hasModelParam = url.searchParams.get("hasModel");
  // `?missing=images,model` — narrower than onlyIncomplete, which ORs every
  // gap together and so keeps handing back products whose only problem is
  // one you can't currently do anything about. Whoever is enriching works
  // one gap at a time (an image pass, then a spec pass), and needs the queue
  // for that gap alone. Multiple values AND together: ?missing=images,spec
  // is "missing both", i.e. the products that are furthest from publishable.
  const missing = (url.searchParams.get("missing") ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  const MISSING_FILTERS: Record<string, object> = {
    images: { images: { none: {} } },
    spec: { AND: [{ attributeValues: { none: {} } }, { extraSpecsRaw: null }] },
    description: { description: null },
    model: { model: null },
  };
  const unknownMissing = missing.filter((m) => !(m in MISSING_FILTERS));
  if (unknownMissing.length > 0) {
    return NextResponse.json(
      {
        error: `unknown "missing" value(s): ${unknownMissing.join(", ")} — supported: ${Object.keys(MISSING_FILTERS).join(", ")}`,
      },
      { status: 400 },
    );
  }

  const rows = await db.product.findMany({
    where: {
      ...(after ? { sku: { gt: after } } : {}),
      ...(onlyIncomplete
        ? {
            OR: [
              { images: { none: {} } },
              { AND: [{ attributeValues: { none: {} } }, { extraSpecsRaw: null }] },
              { description: null },
            ],
          }
        : {}),
      ...(missing.length > 0 ? { AND: missing.map((m) => MISSING_FILTERS[m]) } : {}),
      ...(hasModelParam === "false" ? { model: null } : hasModelParam === "true" ? { model: { not: null } } : {}),
    },
    orderBy: { sku: "asc" },
    take: limit,
    select: {
      sku: true,
      title: true,
      slug: true,
      model: true,
      colorName: true,
      price: true,
      stockQty: true,
      isPublished: true,
      description: true,
      brand: { select: { name: true } },
      category: { select: { name: true, slug: true } },
      images: { select: { id: true } },
      attributeValues: { select: { id: true }, take: 1 },
      extraSpecsRaw: true,
    },
  });

  const products = rows.map((p) => ({
    sku: p.sku,
    title: p.title,
    slug: p.slug,
    model: p.model,
    colorName: p.colorName,
    brandName: p.brand.name,
    categoryName: p.category.name,
    categorySlug: p.category.slug,
    price: p.price,
    stockQty: p.stockQty,
    isPublished: p.isPublished,
    imageCount: p.images.length,
    hasSpec: p.attributeValues.length > 0 || !!p.extraSpecsRaw,
    hasDescription: !!p.description,
  }));

  // null once the last page has been reached — keep calling with
  // `?after=<nextCursor>` until this comes back null.
  const nextCursor = rows.length === limit ? rows[rows.length - 1].sku : null;

  return NextResponse.json({ count: products.length, nextCursor, products });
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
  const dryRun = record.dryRun === true;
  const items: CreateItem[] = Array.isArray(record.items)
    ? (record.items as CreateItem[])
    : typeof record.sku === "string"
      ? [record as unknown as CreateItem]
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
      results.push(await processCreateItem(item, dryRun));
    } catch (err) {
      results.push({ sku: item.sku ?? "", created: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ dryRun, count: results.length, results });
}
