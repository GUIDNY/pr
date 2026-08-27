import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/integrations/product-enrich-shared";

// Bearer-token-protected read endpoint for an external agent: "which
// existing products currently need editing/enrichment attention?" — the
// exact same source of truth the admin sees at /admin/inventory/urgent
// ("טיפול") and /admin/inventory/urgent-critical ("טיפול דחוף"): open
// InventoryAlert rows, not a re-derived guess. URGENT_MISSING_MEDIA is set
// automatically (and auto-resolved) by reconcileUrgentMissingMedia() on
// every inventory sync when a product has no image, no structured spec,
// and no raw spec text; MANUAL_ATTENTION / MANUAL_URGENT are set by an
// admin flagging a product by hand from its detail page. Reusing this
// table means this endpoint can never drift from what the admin UI shows.
export const dynamic = "force-dynamic";

const DEFAULT_TYPES = ["URGENT_MISSING_MEDIA", "MANUAL_ATTENTION", "MANUAL_URGENT"] as const;
const MAX_LIMIT = 200;

export async function GET(request: Request) {
  const authError = checkAuth(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const typeParam = url.searchParams.get("type");
  // `?type=ANY` matches the admin main list's broadest "NEEDS_ATTENTION"
  // view (any unresolved alert of any kind, not just the three "in
  // treatment" types) — an escape hatch, not the default, since most of
  // those other types (LOW_STOCK, DUPLICATE_SKU, ...) aren't things an
  // external content agent can fix by editing a product's content.
  const types = typeParam === "ANY" ? null : typeParam ? typeParam.split(",").map((t) => t.trim()) : DEFAULT_TYPES;
  const limitParam = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, MAX_LIMIT) : 50;

  const alerts = await db.inventoryAlert.findMany({
    where: { ...(types ? { type: { in: [...types] } } : {}), isResolved: false },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      product: {
        select: {
          sku: true,
          title: true,
          slug: true,
          stockQty: true,
          isPublished: true,
          images: { select: { id: true }, take: 1 },
          attributeValues: { select: { id: true }, take: 1 },
          extraSpecsRaw: true,
          brand: { select: { name: true } },
          category: { select: { name: true, slug: true } },
        },
      },
    },
  });

  // A product can be deleted after its alert was raised — skip those
  // rather than returning a null product to the caller.
  const products = alerts
    .filter((a) => a.product !== null)
    .map((a) => {
      const p = a.product!;
      return {
        sku: p.sku,
        title: p.title,
        slug: p.slug,
        alertType: a.type,
        severity: a.severity,
        message: a.message,
        missingImage: p.images.length === 0,
        missingSpec: p.attributeValues.length === 0 && !p.extraSpecsRaw,
        isPublished: p.isPublished,
        stockQty: p.stockQty,
        brandName: p.brand.name,
        categoryName: p.category.name,
        categorySlug: p.category.slug,
        flaggedAt: a.createdAt,
      };
    });

  return NextResponse.json({ count: products.length, products });
}
