import { requireBackOffice } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * The catalogue as one JSON file.
 *
 * Every published product with the fields somebody building spec mappings
 * or auditing content needs: title, brand, category, the HTML description,
 * the raw spec JSON a source handed over, every attribute value with its
 * key and unit, the image URLs and their provenance. The alternative was a
 * crawl of 1,656 product pages, which is how the shop was slowed for an
 * afternoon.
 *
 * A route handler under the admin tree, so it carries the same sign-in the
 * back office does; nothing here is public and nothing here is cached.
 *
 * Streamed rather than returned, because the whole file is several
 * megabytes and a serverless response has a ceiling a buffered one would
 * hit; the array is written one product per line, which also means a
 * reader can parse it as JSON or as JSON lines.
 *
 *   /admin/products/export            — published products (what the site shows or can show)
 *   /admin/products/export?scope=all  — every row, hidden ones included
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireBackOffice();
  } catch {
    return new Response("unauthorized", { status: 403 });
  }

  const scope = new URL(request.url).searchParams.get("scope");
  const products = await db.product.findMany({
    where: scope === "all" ? {} : { isPublished: true },
    orderBy: { sku: "asc" },
    select: {
      id: true,
      sku: true,
      slug: true,
      title: true,
      model: true,
      gtin13: true,
      price: true,
      compareAtPrice: true,
      stockQty: true,
      stockStatus: true,
      isPublished: true,
      enrichmentStatus: true,
      colorName: true,
      warrantyMonths: true,
      shortDescription: true,
      description: true,
      descriptionSourceUrl: true,
      extraSpecsRaw: true,
      specSourceUrl: true,
      updatedAt: true,
      brand: { select: { name: true, slug: true } },
      category: { select: { name: true, slug: true, parent: { select: { name: true, slug: true } } } },
      supplier: { select: { name: true } },
      images: { select: { url: true }, orderBy: { sortOrder: "asc" } },
      attributeValues: {
        select: {
          value: true,
          attribute: { select: { key: true, label: true, unit: true, inputType: true } },
        },
        orderBy: { attribute: { sortOrder: "asc" } },
      },
    },
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode("[\n"));
      products.forEach((p, i) => {
        const row = {
          ...p,
          images: p.images.map((img) => img.url),
          attributes: p.attributeValues.map((av) => ({
            key: av.attribute.key,
            label: av.attribute.label,
            unit: av.attribute.unit,
            inputType: av.attribute.inputType,
            value: av.value,
          })),
          attributeValues: undefined,
        };
        controller.enqueue(encoder.encode(`${i > 0 ? ",\n" : ""}${JSON.stringify(row)}`));
      });
      controller.enqueue(encoder.encode("\n]\n"));
      controller.close();
    },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(stream, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="buytoday-catalog-${stamp}.json"`,
      "cache-control": "no-store",
    },
  });
}
