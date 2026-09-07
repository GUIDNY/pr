// Regenerates the redirect table the proxy serves from.
//
// Every address a product or brand has been renamed away from, mapped to the
// one it answers on now. Run it after any rename:
//
//   npx tsx scripts/generate-legacy-slugs.ts
//
// It lives in the repository as generated code rather than being read at
// build time, for two reasons. A build that cannot reach the database would
// otherwise ship no redirects at all — and preview builds never can. And a
// redirect table is worth being able to read in a diff.
import { Client } from "pg";
import { writeFileSync } from "fs";
import { join } from "path";

const OUT = join(process.cwd(), "src", "generated", "legacy-slugs.ts");

async function main() {
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const client = new Client({ connectionString });
  await client.connect();
  try {
    const { rows } = await client.query<{ prefix: string; old_slug: string; new_slug: string }>(
      `SELECT 'product' AS prefix, h.slug AS old_slug, p.slug AS new_slug
         FROM "ProductSlugHistory" h JOIN "Product" p ON p.id = h."productId"
        WHERE h.slug <> p.slug
        UNION ALL
       SELECT 'brand', h.slug, b.slug
         FROM "BrandSlugHistory" h JOIN "Brand" b ON b.id = h."brandId"
        WHERE h.slug <> b.slug
        ORDER BY 1, 2`,
    );

    const products: Record<string, string> = {};
    const brands: Record<string, string> = {};
    for (const row of rows) {
      (row.prefix === "brand" ? brands : products)[row.old_slug] = row.new_slug;
    }

    const body = `// GENERATED — do not edit by hand.
// Run: npx tsx scripts/generate-legacy-slugs.ts
//
// Every address a product or brand used to answer on, mapped to the one it
// answers on now. proxy.ts serves these as permanent redirects, ahead of any
// cache — see the note there for why that placement is the whole point.
//
// Mapped to the CURRENT slug, never to the previous one, so a product renamed
// twice still sends its oldest address straight to the final one. There are
// no chains to follow and none to go stale.

export const LEGACY_PRODUCT_SLUGS: Record<string, string> = ${JSON.stringify(products, null, 2)};

export const LEGACY_BRAND_SLUGS: Record<string, string> = ${JSON.stringify(brands, null, 2)};
`;
    writeFileSync(OUT, body, "utf8");
    console.log(
      `wrote ${OUT}\n  products: ${Object.keys(products).length}\n  brands:   ${Object.keys(brands).length}`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
