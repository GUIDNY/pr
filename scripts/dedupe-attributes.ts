import "dotenv/config";
import { db } from "../src/lib/db";

// Two independent seed scripts (prisma/seed.ts's demo reseed, and this
// directory's own seed-category-attributes.ts) each defined a CategoryAttribute
// for the same real-world concept under different keys — e.g. washing-machines
// ended up with both a text "capacity" (from prisma/seed.ts, unit ק"ג) AND a
// number "capacity_kg" (from seed-category-attributes.ts) attribute row, so a
// product with both filled shows two spec-table rows for the same fact. This
// migrates any real ProductAttributeValue off the old key onto the canonical
// one, then removes the old CategoryAttribute row (which cascade-deletes any
// leftover value that wasn't migrated — e.g. one that lost the "already has a
// canonical value" tie-break below).
//
// Scoped to the two duplications actually confirmed against production data
// (washing-machines, dryers) — not a full audit of all ~32 seeded categories.
const DEDUPE: { categorySlug: string; oldKey: string; newKey: string }[] = [
  { categorySlug: "washing-machines", oldKey: "capacity", newKey: "capacity_kg" },
  { categorySlug: "washing-machines", oldKey: "rpm", newKey: "spin_rpm" },
  { categorySlug: "dryers", oldKey: "capacity", newKey: "capacity_kg" },
];

async function main() {
  let migrated = 0;
  let discarded = 0;
  let deletedAttributes = 0;

  for (const { categorySlug, oldKey, newKey } of DEDUPE) {
    const category = await db.category.findUnique({ where: { slug: categorySlug } });
    if (!category) {
      console.log("SKIP (no category)", categorySlug);
      continue;
    }
    const [oldAttr, newAttr] = await Promise.all([
      db.categoryAttribute.findUnique({ where: { categoryId_key: { categoryId: category.id, key: oldKey } } }),
      db.categoryAttribute.findUnique({ where: { categoryId_key: { categoryId: category.id, key: newKey } } }),
    ]);
    if (!oldAttr) {
      console.log("SKIP (no old attribute)", categorySlug, oldKey);
      continue;
    }
    if (!newAttr) {
      console.log("SKIP (no canonical attribute to migrate onto)", categorySlug, oldKey, "->", newKey);
      continue;
    }

    const oldValues = await db.productAttributeValue.findMany({ where: { attributeId: oldAttr.id } });
    let migratedThisPair = 0;
    let discardedThisPair = 0;
    for (const ov of oldValues) {
      const existing = await db.productAttributeValue.findUnique({
        where: { productId_attributeId: { productId: ov.productId, attributeId: newAttr.id } },
      });
      if (existing) {
        // The product already has a value on the canonical attribute —
        // trust that one (it may already be the correctly-typed number) and
        // just drop the old text duplicate rather than overwrite it blind.
        discardedThisPair++;
        continue;
      }
      await db.productAttributeValue.create({
        data: { productId: ov.productId, attributeId: newAttr.id, value: ov.value },
      });
      migratedThisPair++;
    }
    migrated += migratedThisPair;
    discarded += discardedThisPair;

    // Cascade-deletes any ProductAttributeValue still left on the old
    // attribute (the ones that lost the tie-break above).
    await db.categoryAttribute.delete({ where: { id: oldAttr.id } });
    deletedAttributes++;
    console.log(`done: ${categorySlug} ${oldKey} -> ${newKey} (migrated ${migratedThisPair}, discarded ${discardedThisPair})`);
  }

  console.log({ migrated, discarded, deletedAttributes });
  process.exit(0);
}

main();
