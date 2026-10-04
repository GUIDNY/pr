import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { submitUrls } from "@/lib/indexnow";
import { checkAuth, checkImageUrl } from "@/lib/integrations/product-enrich-shared";
import { BRAND_ITEM_KEYS, BRAND_TOP_LEVEL_KEYS, unknownKeysIn, type KeyCheck } from "@/lib/integrations/api-fields";

/**
 * The brand page's content, written by the agent that writes it.
 *
 * 86 of the 91 brand pages in the sitemap have no text of their own, and the
 * text for them exists — written, reviewed, sitting in two markdown files
 * with no way in except an admin pasting 86 pages by hand. This is the way
 * in: the same bearer token as /api/integrations/product-enrich, the same
 * strictness about field names, one call for the lot.
 *
 * Only the text about a brand is writable. `name` and `slug` identify the
 * row and are never changed here — the slug is public in every brand URL
 * and the name is in every product title.
 *
 *   POST /api/integrations/brands
 *   Authorization: Bearer <PRODUCT_ENRICH_SECRET>
 *   { "items": [ { "slug": "bosch", "pageContent": "<h2>…</h2><p>…</p>", "seoTitle": "…" } ], "dryRun": false }
 *
 * Fields per item (all optional; a sent field is written, an empty string
 * clears it):
 *   description  — one line; the meta description falls back to it
 *   pageContent  — the buying guide on the brand's own page (HTML, same
 *                  shape as Category.description)
 *   aboutContent — the "about the brand" panel on every product page of
 *                  this brand (plain text, \n-separated paragraphs)
 *   seoTitle, seoDesc, logoUrl
 */
export const dynamic = "force-dynamic";

const TEXT_FIELDS = ["description", "aboutContent", "pageContent", "seoTitle", "seoDesc"] as const;
type TextField = (typeof TEXT_FIELDS)[number];
const MAX_LENGTH: Record<TextField | "logoUrl", number> = {
  description: 500,
  aboutContent: 20_000,
  pageContent: 60_000,
  seoTitle: 120,
  seoDesc: 400,
  logoUrl: 1000,
};

type BrandItem = {
  slug?: string;
  name?: string;
  description?: string;
  aboutContent?: string;
  pageContent?: string;
  seoTitle?: string;
  seoDesc?: string;
  logoUrl?: string;
};

function canonicalise(record: Record<string, unknown>, check: KeyCheck): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) out[check.aliases?.[key] ?? key] = value;
  return out;
}

function unknownKeyError(unknown: string[], check: KeyCheck, where: string) {
  return NextResponse.json(
    {
      error: `unrecognised field${unknown.length > 1 ? "s" : ""} in ${where}: ${unknown.join(", ")}`,
      knownFields: check.known,
    },
    { status: 400 },
  );
}

async function processItem(raw: Record<string, unknown>, dryRun: boolean) {
  const item = canonicalise(raw, BRAND_ITEM_KEYS) as BrandItem;
  const slug = typeof item.slug === "string" ? item.slug.trim() : "";
  const name = typeof item.name === "string" ? item.name.trim() : "";
  if (!slug && !name) return { slug, name, updated: false, error: "missing slug or name" };

  const brand = slug
    ? await db.brand.findUnique({ where: { slug }, select: { id: true, slug: true, name: true } })
    : await db.brand.findFirst({
        where: { name: { equals: name, mode: "insensitive" } },
        select: { id: true, slug: true, name: true },
      });
  if (!brand) return { slug, name, updated: false, error: "brand not found" };

  const data: Partial<Record<TextField | "logoUrl", string | null>> = {};
  const applied: string[] = [];
  const skipped: { field: string; reason: string }[] = [];

  for (const field of TEXT_FIELDS) {
    const value = item[field];
    if (value === undefined) continue;
    if (typeof value !== "string") {
      skipped.push({ field, reason: "must be a string" });
      continue;
    }
    const trimmed = value.trim();
    if (trimmed.length > MAX_LENGTH[field]) {
      skipped.push({ field, reason: `longer than ${MAX_LENGTH[field]} characters` });
      continue;
    }
    data[field] = trimmed || null;
    applied.push(field);
  }

  if (item.logoUrl !== undefined) {
    const url = typeof item.logoUrl === "string" ? item.logoUrl.trim() : "";
    if (url && !url.startsWith("https://")) {
      skipped.push({ field: "logoUrl", reason: "must be an https:// URL" });
    } else if (url && (await checkImageUrl(url)) === "confirmed-bad") {
      skipped.push({ field: "logoUrl", reason: "the URL answers 404" });
    } else {
      data.logoUrl = url || null;
      applied.push("logoUrl");
    }
  }

  if (applied.length === 0) return { slug: brand.slug, name: brand.name, updated: false, applied, skipped };
  if (dryRun) return { slug: brand.slug, name: brand.name, updated: false, dryRun: true, applied, skipped };

  await db.brand.update({ where: { id: brand.id }, data });
  await logAudit({
    actorId: null,
    action: "BRAND_CONTENT_UPDATED",
    entityType: "Brand",
    entityId: brand.id,
    metadata: { applied, source: "integrations/brands" },
  });
  revalidatePath(`/brand/${brand.slug}`);
  return { slug: brand.slug, name: brand.name, updated: true, applied, skipped };
}

export async function POST(request: Request) {
  const denied = checkAuth(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "body must be an object" }, { status: 400 });
  }

  const top = canonicalise(body as Record<string, unknown>, BRAND_TOP_LEVEL_KEYS);
  const unknownTop = unknownKeysIn(top, BRAND_TOP_LEVEL_KEYS);
  if (unknownTop.length > 0) return unknownKeyError(unknownTop, BRAND_TOP_LEVEL_KEYS, "body");

  const dryRun = top.dryRun === true;
  const items: unknown[] = Array.isArray(top.items) ? top.items : [top];
  if (items.length === 0) return NextResponse.json({ error: "no items" }, { status: 400 });
  if (items.length > 200) return NextResponse.json({ error: "at most 200 items per call" }, { status: 400 });

  for (const [index, item] of items.entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return NextResponse.json({ error: `items[${index}] must be an object` }, { status: 400 });
    }
    const unknown = unknownKeysIn(canonicalise(item as Record<string, unknown>, BRAND_ITEM_KEYS), BRAND_ITEM_KEYS);
    if (unknown.length > 0) return unknownKeyError(unknown, BRAND_ITEM_KEYS, `items[${index}]`);
  }

  const results = [];
  for (const item of items) results.push(await processItem(item as Record<string, unknown>, dryRun));

  const updatedSlugs = results.filter((r) => r.updated).map((r) => r.slug);
  if (updatedSlugs.length > 0) await submitUrls(updatedSlugs.map((slug) => `/brand/${slug}`));

  return NextResponse.json({
    dryRun,
    total: results.length,
    updated: updatedSlugs.length,
    results,
  });
}
