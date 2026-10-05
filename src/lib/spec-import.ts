/**
 * The shape of a spec hand-off, and what a row has to satisfy before it is
 * written.
 *
 * The file comes from outside the codebase — an analyst's build over the
 * admin export — and it is applied by replacement: a product's attribute
 * rows become exactly the rows the file holds for it. Replacement is the
 * point (it is what removes a doubled unit or a price in a warranty row),
 * and it is also why every row is checked here first. A rule the file's
 * builder already enforces is enforced again on this side, because the
 * file is data and data changes hands.
 *
 * No database in this file; scripts/check-spec-import.ts runs the rules.
 */

import { INPUT_TYPES } from "@/lib/spec-import-constants";

export type SpecRowInput = {
  key: string;
  label: string;
  unit: string | null;
  inputType: string;
  value: string;
};

export type ProductSpecs = { slug: string; rows: SpecRowInput[] };

export type SchemaAttribute = { key: string; label: string; unit: string | null; inputType: string };
export type SpecSchema = {
  attributes: Record<string, SchemaAttribute>;
  /** category slug → attribute keys in display order */
  categorySchema: Record<string, string[]>;
};

export type RowProblem = { slug: string; key: string; value: string; reason: string };

const MAX_KEY = 64;
const MAX_LABEL = 80;
const MAX_UNIT = 16;
const MAX_VALUE = 300;
const KEY_SHAPE = /^[a-z0-9][a-z0-9_]*$/;
const BARE_NUMBER = /^-?\d+(\.\d+)?$/;

/* The same rejections lib/product-specs applies before a row reaches the
   structured data, so what is written is what will be shown. */
const EMPTY_VALUES = new Set([
  "לא צוין", "לא צויין", "לא ידוע", "אין", "אין מידע", "אין נתון", "לא רלוונטי", "ללא",
  "-", "—", "–", "n/a", "na", "none", "null", "undefined", "tbd", "?",
]);
/* \b is ASCII-only in JavaScript and never fires beside a Hebrew letter, so
   "199 שח" is matched as a digit, optional space, שח, and then anything
   that is not a letter. */
const LOOKS_LIKE_PRICE = /₪|ש"ח|ש״ח|שקל|\bnis\b|\bils\b|\d\s*שח(?!\p{L})/iu;

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

/** One row, checked. Returns the clean row or the reason it is refused. */
export function validateRow(slug: string, raw: unknown): { row: SpecRowInput } | { problem: RowProblem } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const key = str(r.key).toLowerCase();
  const label = str(r.label);
  const unit = str(r.unit) || null;
  const inputType = str(r.inputType) || "text";
  const value = str(r.value);
  const refuse = (reason: string) => ({ problem: { slug, key: key || "?", value, reason } });

  if (!key) return refuse("missing key");
  if (key.length > MAX_KEY || !KEY_SHAPE.test(key)) return refuse("key must be a-z, 0-9 and _ only");
  if (!label) return refuse("missing label");
  if (label.length > MAX_LABEL) return refuse(`label longer than ${MAX_LABEL}`);
  if (unit && unit.length > MAX_UNIT) return refuse(`unit longer than ${MAX_UNIT}`);
  if (!INPUT_TYPES.includes(inputType as (typeof INPUT_TYPES)[number])) return refuse(`inputType must be one of ${INPUT_TYPES.join("|")}`);
  if (!value) return refuse("empty value");
  if (value.length > MAX_VALUE) return refuse(`value longer than ${MAX_VALUE}`);
  if (EMPTY_VALUES.has(value.toLowerCase())) return refuse("value says nothing (לא צוין / n/a)");
  if (LOOKS_LIKE_PRICE.test(value)) return refuse("a price is not a spec");
  if (inputType === "number" && !BARE_NUMBER.test(value)) return refuse("number field needs a bare number (the unit is on the attribute)");
  if (inputType === "boolean" && !/^(true|false|כן|לא|yes|no)$/i.test(value)) return refuse("boolean field needs כן/לא");
  if (unit && value.endsWith(unit) && BARE_NUMBER.test(value.slice(0, -unit.length).trim())) {
    return refuse("unit repeated inside the value — it renders twice");
  }

  return { row: { key, label, unit, inputType, value } };
}

/** The attributes file: { slug: [row, ...] }. Rows that fail are returned
    separately, never silently dropped. */
export function parseSpecAttributesFile(json: unknown): { products: ProductSpecs[]; problems: RowProblem[] } {
  if (!json || typeof json !== "object" || Array.isArray(json)) throw new Error("spec-attributes.json must be an object keyed by slug");
  const products: ProductSpecs[] = [];
  const problems: RowProblem[] = [];
  for (const [slug, rawRows] of Object.entries(json as Record<string, unknown>)) {
    const rows: SpecRowInput[] = [];
    const seen = new Set<string>();
    for (const raw of Array.isArray(rawRows) ? rawRows : []) {
      const checked = validateRow(slug, raw);
      if ("problem" in checked) {
        problems.push(checked.problem);
        continue;
      }
      if (seen.has(checked.row.key)) {
        problems.push({ slug, key: checked.row.key, value: checked.row.value, reason: "duplicate key for this product" });
        continue;
      }
      seen.add(checked.row.key);
      rows.push(checked.row);
    }
    products.push({ slug: slug.trim(), rows });
  }
  return { products, problems };
}

/** The schema file. Tolerant about shape: category entries may be arrays of
    keys or arrays of { key } objects. Unknown keys in a category list are
    kept — the attribute is created from the row that carries it. */
export function parseSpecSchemaFile(json: unknown): SpecSchema {
  if (!json || typeof json !== "object") throw new Error("spec-schema.json must be an object");
  const j = json as Record<string, unknown>;
  const attributes: Record<string, SchemaAttribute> = {};
  const rawAttrs = (j.attributes && typeof j.attributes === "object" ? j.attributes : {}) as Record<string, unknown>;
  for (const [key, raw] of Object.entries(rawAttrs)) {
    const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const k = key.trim().toLowerCase();
    if (!KEY_SHAPE.test(k)) continue;
    attributes[k] = {
      key: k,
      label: str(r.label) || k,
      unit: str(r.unit) || null,
      inputType: INPUT_TYPES.includes(str(r.inputType) as (typeof INPUT_TYPES)[number]) ? str(r.inputType) : "text",
    };
  }
  const categorySchema: Record<string, string[]> = {};
  const rawCats = (j.categorySchema && typeof j.categorySchema === "object" ? j.categorySchema : {}) as Record<string, unknown>;
  for (const [slug, raw] of Object.entries(rawCats)) {
    const list = Array.isArray(raw) ? raw : Array.isArray((raw as { keys?: unknown })?.keys) ? (raw as { keys: unknown[] }).keys : [];
    const keys = list
      .map((entry) => (typeof entry === "string" ? entry : str((entry as { key?: unknown })?.key)))
      .map((k) => k.trim().toLowerCase())
      .filter((k) => KEY_SHAPE.test(k));
    if (keys.length > 0) categorySchema[slug.trim()] = [...new Set(keys)];
  }
  return { attributes, categorySchema };
}
