import { Client } from "pg";

/**
 * Every renamed product's and brand's old address, as redirect rules for
 * next.config.
 *
 * These are declared in the config on purpose, which puts them in front of
 * every cache. The page-level lookup that used to be the only mechanism
 * cannot be: /product/[slug] is an ISR route, and an ISR route's response is
 * stored per path. Once a path has a `notFound()` stored against it — which
 * happens the moment anything asks for a slug before it becomes a legacy
 * slug — that stored 404 is what visitors get, and the redirect the page
 * would now return never reaches them. Reproduced locally: ask for an unknown
 * slug twice, add its history row, ask again, and the 404 keeps coming back
 * from cache while a fresh render of the very same code returns a 308.
 *
 * The database stays the single source of truth; this reads it at build time
 * rather than anyone keeping a second list by hand. The page-level lookup
 * stays too, for a rename made since the last build — between the two, a
 * moved address is answered whether or not anything is cached.
 *
 * Deliberately plain SQL and not the app's Prisma client. next.config is
 * compiled on its own, outside the "@/..." path aliases, so importing the
 * client here drags the whole generated tree into the config resolver for one
 * two-column query.
 *
 * A build that cannot reach the database ships no rules rather than failing.
 * Preview deployments have no DATABASE_URL at all — the variables are scoped
 * to Production — and losing these on a preview costs nothing, while losing
 * the build costs the ability to look at a change before customers do.
 */
export async function legacySlugRedirects(): Promise<
  { source: string; destination: string; permanent: true }[]
> {
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) return [];

  const client = new Client({ connectionString });
  try {
    await client.connect();
    const { rows } = await client.query<{ prefix: string; old_slug: string; new_slug: string }>(
      // "<> " on both halves drops a row whose owner has since moved back onto
      // that same address, which would otherwise redirect a live URL to itself.
      `SELECT 'product' AS prefix, h.slug AS old_slug, p.slug AS new_slug
         FROM "ProductSlugHistory" h
         JOIN "Product" p ON p.id = h."productId"
        WHERE h.slug <> p.slug
        UNION ALL
       SELECT 'brand' AS prefix, h.slug AS old_slug, b.slug AS new_slug
         FROM "BrandSlugHistory" h
         JOIN "Brand" b ON b.id = h."brandId"
        WHERE h.slug <> b.slug`,
    );
    // Vercel caps a deployment at 1,024 redirect rules and rejects the whole
    // build past it. Renames are rare — 223 after the one big cleanup — but
    // this grows for the life of the shop and nothing else would say a word
    // until a deploy failed, so it says so early and loudly.
    if (rows.length > 900) {
      console.warn(
        `[legacy-slug-redirects] ${rows.length} rules: approaching the 1,024-rule limit. ` +
          `Move the oldest of these behind a lookup before they take the build down.`,
      );
    }

    return rows.map((row) => ({
      source: `/${row.prefix}/${row.old_slug}`,
      destination: `/${row.prefix}/${row.new_slug}`,
      permanent: true as const,
    }));
  } catch (error) {
    console.warn("[legacy-slug-redirects] no database at build time; shipping none:", error);
    return [];
  } finally {
    await client.end().catch(() => {});
  }
}
