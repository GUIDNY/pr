"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { validateRow, type ProductSpecs, type SpecSchema, type RowProblem, type SpecRowInput } from "@/lib/spec-import";
import { SPEC_IMPORT_BATCH } from "@/lib/spec-import-constants";

/**
 * Replacing a product's spec rows with the rows a hand-off file holds.
 *
 * Replacement, not merge, on purpose: the file was built from the current
 * attribute table plus each product's raw manufacturer specs, through one
 * normaliser, so it already contains everything worth keeping — and it is
 * the only way the three defects in the current table go away (a unit
 * doubled inside the value, a label twice, a price in a warranty row).
 * Merging would keep every one of them.
 *
 * Two calls, both admin-only. The dry run computes exactly what apply
 * would write and writes nothing; apply does the same computation and
 * then one transaction per batch. The client sends the file in batches of
 * SPEC_IMPORT_BATCH products so no single request runs long.
 */

export type BatchResult = {
  matched: number;
  unknownSlugs: string[];
  rowsBefore: number;
  rowsAfter: number;
  attributesToCreate: { category: string; key: string; label: string }[];
  labelMismatches: { slug: string; key: string; file: string; db: string }[];
  /** Products the file holds fewer rows for than the database does. A
      replacement file is built from the database, so fewer means a key
      the builder dropped — the hand-off's first version would have lost
      187 rows this way, silently. Listed so it is never silent here. */
  losingRows: { slug: string; before: number; after: number }[];
  problems: RowProblem[];
  written: boolean;
};

export async function importSpecBatchAction(batch: ProductSpecs[], apply: boolean): Promise<BatchResult> {
  const session = await requireAdmin();
  if (!Array.isArray(batch) || batch.length === 0) throw new Error("empty batch");
  if (batch.length > SPEC_IMPORT_BATCH) throw new Error(`at most ${SPEC_IMPORT_BATCH} products per batch`);

  /* The rows are checked again here. The client parsed and validated the
     file, but a server action is reachable without that client, and the
     rules are cheap. */
  const problems: RowProblem[] = [];
  const wanted = new Map<string, SpecRowInput[]>();
  for (const entry of batch) {
    const slug = typeof entry?.slug === "string" ? entry.slug.trim() : "";
    if (!slug) continue;
    const rows: SpecRowInput[] = [];
    const seen = new Set<string>();
    for (const raw of Array.isArray(entry.rows) ? entry.rows : []) {
      const checked = validateRow(slug, raw);
      if ("problem" in checked) {
        problems.push(checked.problem);
        continue;
      }
      if (seen.has(checked.row.key)) continue;
      seen.add(checked.row.key);
      rows.push(checked.row);
    }
    wanted.set(slug, rows);
  }

  const products = await db.product.findMany({
    where: { slug: { in: [...wanted.keys()] } },
    select: {
      id: true,
      slug: true,
      categoryId: true,
      category: { select: { slug: true } },
      attributeValues: { select: { id: true } },
    },
  });
  const bySlug = new Map(products.map((p) => [p.slug, p]));
  const unknownSlugs = [...wanted.keys()].filter((slug) => !bySlug.has(slug));

  const categoryIds = [...new Set(products.map((p) => p.categoryId))];
  const attributes = await db.categoryAttribute.findMany({
    where: { categoryId: { in: categoryIds } },
    select: { id: true, categoryId: true, key: true, label: true, sortOrder: true },
  });
  const attrByCategory = new Map<string, Map<string, { id: string; label: string }>>();
  const nextSort = new Map<string, number>();
  for (const a of attributes) {
    if (!attrByCategory.has(a.categoryId)) attrByCategory.set(a.categoryId, new Map());
    attrByCategory.get(a.categoryId)!.set(a.key, { id: a.id, label: a.label });
    nextSort.set(a.categoryId, Math.max(nextSort.get(a.categoryId) ?? 0, a.sortOrder + 1));
  }

  /* Attributes the rows need and the category does not have yet, keyed so
     two products in the same category asking for the same key create it
     once. */
  const toCreate = new Map<string, { categoryId: string; categorySlug: string; key: string; label: string; unit: string | null; inputType: string; sortOrder: number }>();
  const labelMismatches: BatchResult["labelMismatches"] = [];
  const losingRows: BatchResult["losingRows"] = [];
  let rowsBefore = 0;
  let rowsAfter = 0;

  for (const p of products) {
    const rows = wanted.get(p.slug) ?? [];
    rowsBefore += p.attributeValues.length;
    rowsAfter += rows.length;
    if (rows.length < p.attributeValues.length) {
      losingRows.push({ slug: p.slug, before: p.attributeValues.length, after: rows.length });
    }
    const have = attrByCategory.get(p.categoryId) ?? new Map();
    for (const row of rows) {
      const existing = have.get(row.key);
      if (existing) {
        if (existing.label !== row.label) labelMismatches.push({ slug: p.slug, key: row.key, file: row.label, db: existing.label });
        continue;
      }
      const id = `${p.categoryId}\u0000${row.key}`;
      if (!toCreate.has(id)) {
        const sortOrder = nextSort.get(p.categoryId) ?? 0;
        nextSort.set(p.categoryId, sortOrder + 1);
        toCreate.set(id, {
          categoryId: p.categoryId,
          categorySlug: p.category.slug,
          key: row.key,
          label: row.label,
          unit: row.unit,
          inputType: row.inputType,
          sortOrder,
        });
      }
    }
  }

  const result: BatchResult = {
    matched: products.length,
    unknownSlugs,
    rowsBefore,
    rowsAfter,
    attributesToCreate: [...toCreate.values()].map((a) => ({ category: a.categorySlug, key: a.key, label: a.label })),
    labelMismatches,
    losingRows,
    problems,
    written: false,
  };
  if (!apply) return result;

  /* Attributes first, outside the transaction, so their ids exist for the
     value rows. createManyAndReturn gives them back in one round trip. */
  if (toCreate.size > 0) {
    const created = await db.categoryAttribute.createManyAndReturn({
      data: [...toCreate.values()].map((a) => ({
        categoryId: a.categoryId,
        key: a.key,
        label: a.label,
        unit: a.unit,
        inputType: a.inputType,
        sortOrder: a.sortOrder,
      })),
      select: { id: true, categoryId: true, key: true, label: true },
    });
    for (const a of created) {
      if (!attrByCategory.has(a.categoryId)) attrByCategory.set(a.categoryId, new Map());
      attrByCategory.get(a.categoryId)!.set(a.key, { id: a.id, label: a.label });
    }
  }

  const ops = [];
  for (const p of products) {
    const rows = wanted.get(p.slug) ?? [];
    const have = attrByCategory.get(p.categoryId) ?? new Map();
    const data = rows
      .map((row) => ({ productId: p.id, attributeId: have.get(row.key)?.id, value: row.value }))
      .filter((v): v is { productId: string; attributeId: string; value: string } => typeof v.attributeId === "string");
    ops.push(db.productAttributeValue.deleteMany({ where: { productId: p.id } }));
    if (data.length > 0) ops.push(db.productAttributeValue.createMany({ data }));
  }
  await db.$transaction(ops);

  await logAudit({
    actorId: session.sub,
    action: "PRODUCT_SPECS_IMPORTED",
    entityType: "Product",
    entityId: `batch:${products[0]?.slug ?? "?"}..${products[products.length - 1]?.slug ?? "?"}`,
    metadata: { products: products.length, rowsBefore, rowsAfter, attributesCreated: toCreate.size },
  });

  return { ...result, written: true };
}

export type SchemaResult = {
  categoriesMatched: number;
  unknownCategories: string[];
  attributesCreated: number;
  attributesUpdated: number;
  written: boolean;
};

/** The schema file: per category, the attributes in display order. Creates
    the ones a category lacks and sets sortOrder/label/unit/inputType on the
    ones it has. Never deletes an attribute — a key the schema no longer
    lists keeps its rows until somebody removes them deliberately. */
export async function applySpecSchemaAction(schema: SpecSchema, apply: boolean): Promise<SchemaResult> {
  const session = await requireAdmin();
  const slugs = Object.keys(schema.categorySchema ?? {});
  const categories = await db.category.findMany({ where: { slug: { in: slugs } }, select: { id: true, slug: true } });
  const idBySlug = new Map(categories.map((c) => [c.slug, c.id]));
  const unknownCategories = slugs.filter((s) => !idBySlug.has(s));
  const existing = await db.categoryAttribute.findMany({
    where: { categoryId: { in: categories.map((c) => c.id) } },
    select: { id: true, categoryId: true, key: true, label: true, unit: true, inputType: true, sortOrder: true },
  });
  const byCatKey = new Map(existing.map((a) => [`${a.categoryId}\u0000${a.key}`, a]));

  const creates: { categoryId: string; key: string; label: string; unit: string | null; inputType: string; sortOrder: number }[] = [];
  const updates: { id: string; data: { label: string; unit: string | null; inputType: string; sortOrder: number } }[] = [];
  for (const [slug, keys] of Object.entries(schema.categorySchema ?? {})) {
    const categoryId = idBySlug.get(slug);
    if (!categoryId) continue;
    keys.forEach((key, index) => {
      const def = schema.attributes?.[key] ?? { key, label: key, unit: null, inputType: "text" };
      const have = byCatKey.get(`${categoryId}\u0000${key}`);
      if (!have) {
        creates.push({ categoryId, key, label: def.label, unit: def.unit, inputType: def.inputType, sortOrder: index });
      } else if (have.label !== def.label || have.unit !== def.unit || have.inputType !== def.inputType || have.sortOrder !== index) {
        updates.push({ id: have.id, data: { label: def.label, unit: def.unit, inputType: def.inputType, sortOrder: index } });
      }
    });
  }

  const result: SchemaResult = {
    categoriesMatched: categories.length,
    unknownCategories,
    attributesCreated: creates.length,
    attributesUpdated: updates.length,
    written: false,
  };
  if (!apply) return result;

  if (creates.length > 0) await db.categoryAttribute.createMany({ data: creates });
  if (updates.length > 0) {
    await db.$transaction(updates.map((u) => db.categoryAttribute.update({ where: { id: u.id }, data: u.data })));
  }
  await logAudit({
    actorId: session.sub,
    action: "CATEGORY_ATTRIBUTE_SCHEMA_IMPORTED",
    entityType: "Category",
    entityId: "schema",
    metadata: { categories: categories.length, created: creates.length, updated: updates.length },
  });
  return { ...result, written: true };
}

/** After the last batch: the pages that show specs are rebuilt on their
    next request. The feed is dynamic and the structured data is read from
    the same rows, so nothing else needs telling. */
export async function finishSpecImportAction(summary: { products: number; rows: number }) {
  const session = await requireAdmin();
  revalidatePath("/product/[slug]", "page");
  revalidatePath("/category/[slug]", "page");
  revalidatePath("/category-filtered/[slug]", "page");
  await logAudit({
    actorId: session.sub,
    action: "PRODUCT_SPECS_IMPORT_FINISHED",
    entityType: "Product",
    entityId: "all",
    metadata: summary,
  });
  return { success: true };
}
