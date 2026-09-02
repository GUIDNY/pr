import { createHash } from "crypto";
import { db } from "@/lib/db";

// Turning a brand name from a sheet or an agent into a Brand row, without
// falling over when the name has been edited since.
//
// The bug this exists for, in full. A brand's slug is derived from its name
// and then frozen — it is public in /brand/<slug>, so renaming a brand must
// not break links already shared. "PolkAudio" was imported once and got the
// slug polkaudio-81d337; someone later renamed it to "Polk Audio" for the
// storefront, which is exactly what the admin is for. The slug stayed.
//
// Then a new price sheet arrived with "PolkAudio" again. The lookup was by
// name only, found nothing — the row is called "Polk Audio" now — and tried
// to create a second brand, computing the same slug from the same name:
//
//     Unique constraint failed on the fields: (slug)
//
// which threw, and took four PolkAudio soundbars out of the sync with it.
// Not corruption: those rows were skipped and nothing was written. But four
// products silently did not update, and every brand anyone ever renames is
// the same landmine waiting for its next sheet.
//
// So the slug is looked up as well as the name. A row already holding the
// slug this name computes IS this brand — that is what deriving the slug
// from the name means — and it is reused rather than duplicated. Only a
// genuine third case gets a fresh row, and even that cannot throw.

function asciiSlug(input: string) {
  return input
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();
}

/** The slug a given brand name computes. Deterministic, and the identity a
 *  renamed brand keeps. */
export function brandSlugFor(name: string): string {
  const trimmed = name.trim();
  const hash = createHash("sha1").update(trimmed).digest("hex");
  const base = asciiSlug(trimmed) || hash.slice(0, 10);
  return `${base}-${hash.slice(0, 6)}`;
}

export const UNKNOWN_BRAND = "לא ידוע";

/**
 * Find the brand for this name, or create it. Never throws on a name that
 * collides with an existing slug.
 *
 * Shared by the inventory sync and the enrichment endpoints, which both used
 * to carry their own near-copy of this — and one of the two copies is where
 * the bug lived.
 */
export async function resolveBrandId(name: string | null | undefined): Promise<string> {
  const brandName = (name ?? UNKNOWN_BRAND).trim() || UNKNOWN_BRAND;

  const byName = await db.brand.findFirst({ where: { name: brandName }, select: { id: true } });
  if (byName) return byName.id;

  // The renamed-brand case: some row already owns the slug this name
  // derives, which can only be because it was once called this.
  const slug = brandSlugFor(brandName);
  const bySlug = await db.brand.findUnique({ where: { slug }, select: { id: true } });
  if (bySlug) return bySlug.id;

  try {
    const created = await db.brand.create({ data: { name: brandName, slug } });
    return created.id;
  } catch {
    // Two ways to land here: another request created the same brand between
    // the lookup and the insert, or a different name happened to derive the
    // same slug. Look once more — that covers the first — and only then fall
    // back to a suffixed slug, which is still stable for this name because
    // the input to the hash is.
    const raced = await db.brand.findFirst({
      where: { OR: [{ name: brandName }, { slug }] },
      select: { id: true, name: true },
    });
    if (raced && raced.name === brandName) return raced.id;

    const created = await db.brand.create({
      data: { name: brandName, slug: `${slug}-${createHash("sha1").update(`${brandName}#2`).digest("hex").slice(0, 6)}` },
    });
    return created.id;
  }
}

/**
 * The brand for this name if one already exists, and null otherwise —
 * never creates a row.
 *
 * The sync used to call resolveBrandId at the very top of applyOneRow,
 * before the two early returns that drop a row (zero stock on a product we
 * have never seen, and a sheet tab with no matching category). Those rows
 * write no product, but the brand row was already committed — so every junk
 * value that ever appeared in a BRAND cell became a permanent Brand: model
 * codes (EC9155.GR, IQ700), spec fragments (240Hz, 50W RMS), product types
 * (מיקרוגל), a spreadsheet summary line (סה"כ), even "Invalid Date".
 *
 * One sync produced 178 of them in a single run, half the brand table,
 * every one with zero products — visible in the admin's brand picker and
 * at a public /brand/<slug> page.
 *
 * So matching uses this, and only a row that survives as far as being
 * written calls resolveBrandId. Nothing is lost by looking up instead of
 * creating: the one place the sync needs a brand before that point is the
 * legacy brand+model+title fallback in findExistingProduct, which searches
 * for a product already carrying this brandId. A brand that does not exist
 * yet has no products, so that search could never have matched anyway.
 */
export async function findBrandId(name: string | null | undefined): Promise<string | null> {
  const brandName = (name ?? UNKNOWN_BRAND).trim() || UNKNOWN_BRAND;
  const byName = await db.brand.findFirst({ where: { name: brandName }, select: { id: true } });
  if (byName) return byName.id;
  const bySlug = await db.brand.findUnique({
    where: { slug: brandSlugFor(brandName) },
    select: { id: true },
  });
  return bySlug?.id ?? null;
}
