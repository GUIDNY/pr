import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/integrations/product-enrich-shared";

// One product, by SKU. Reading a single product used to mean paging the
// list endpoint from a SKU you hoped came just before it —
// `?limit=5&after=0486` and then filtering client-side for 0487 — which
// costs a round trip per product and breaks outright when the SKU you
// guessed does not exist.
//
// It returns more than the list does, because the list is a queue and this
// is the record: the description and spec values themselves, and every
// provenance field — where the description came from, where the spec came
// from, and per image the page it was taken from, the original file URL,
// the domain and when it was captured. That is what makes an enrichment
// checkable after the fact and refreshable when the manufacturer updates
// their page, rather than a one-way write.
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ sku: string }> }) {
  const authError = checkAuth(request);
  if (authError) return authError;

  const { sku: raw } = await params;
  const sku = decodeURIComponent(raw ?? "").trim();
  if (!sku) return NextResponse.json({ error: "missing sku" }, { status: 400 });

  const p = await db.product.findUnique({
    where: { sku },
    select: {
      sku: true,
      title: true,
      slug: true,
      model: true,
      colorName: true,
      price: true,
      stockQty: true,
      stockStatus: true,
      isPublished: true,
      enrichmentStatus: true,
      description: true,
      descriptionSourceUrl: true,
      specSourceUrl: true,
      extraSpecsRaw: true,
      warrantyMonths: true,
      // The product's own last write, whoever made it — the closest thing
      // to "when was this enriched" that is true rather than asserted by
      // the caller. The audit log holds who and what.
      updatedAt: true,
      brand: { select: { name: true } },
      category: { select: { name: true, slug: true } },
      supplier: { select: { name: true } },
      images: {
        orderBy: { sortOrder: "asc" },
        select: { url: true, alt: true, sortOrder: true, sourcePageUrl: true, sourceImageUrl: true, sourceDomain: true, capturedAt: true },
      },
      attributeValues: { select: { value: true, attribute: { select: { key: true, label: true, unit: true } } } },
    },
  });

  if (!p) {
    return NextResponse.json(
      { error: `no product with sku "${sku}"`, sku },
      { status: 404 },
    );
  }

  let extraSpecs: Record<string, string> = {};
  try {
    extraSpecs = p.extraSpecsRaw ? JSON.parse(p.extraSpecsRaw) : {};
  } catch {
    // A malformed blob is worth reporting as empty rather than 500ing a
    // read; the raw string is returned below either way.
  }

  return NextResponse.json({
    sku: p.sku,
    title: p.title,
    slug: p.slug,
    model: p.model,
    colorName: p.colorName,
    brandName: p.brand.name,
    categoryName: p.category.name,
    categorySlug: p.category.slug,
    supplierName: p.supplier?.name ?? null,
    price: p.price,
    stockQty: p.stockQty,
    stockStatus: p.stockStatus,
    isPublished: p.isPublished,
    enrichmentStatus: p.enrichmentStatus,
    warrantyMonths: p.warrantyMonths,
    description: p.description,
    descriptionSourceUrl: p.descriptionSourceUrl,
    specSourceUrl: p.specSourceUrl,
    // Both halves of the spec, kept apart: `spec` matched a real
    // CategoryAttribute and is filterable on the site, `extraSpecs` did not
    // and is free text. A caller that wants the first should send the keys
    // GET /api/integrations/product-enrich?category=<slug> lists.
    spec: p.attributeValues.map((v) => ({
      key: v.attribute.key,
      label: v.attribute.label,
      unit: v.attribute.unit,
      value: v.value,
    })),
    extraSpecs,
    imageCount: p.images.length,
    images: p.images,
    lastModifiedAt: p.updatedAt,
    // Exactly the rule the storefront applies (PUBLIC_PRODUCT_WHERE), so a
    // caller can tell "saved" from "actually on the site" without guessing.
    liveOnSite: p.isPublished && p.stockQty > 0 && p.images.length > 0,
  });
}
