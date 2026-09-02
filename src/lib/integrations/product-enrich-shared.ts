import { createHash } from "crypto";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { type KeyCheck } from "./api-fields";

// Shared between /api/integrations/product-enrich (fill in missing data on
// an existing product) and /api/integrations/products (create a brand-new
// one) — both are external-agent-facing, bearer-token-protected, and need
// the exact same image/brand/supplier/warranty handling, so it lives here
// once instead of twice.

export function checkAuth(request: Request): NextResponse | null {
  const secret = process.env.PRODUCT_ENRICH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "PRODUCT_ENRICH_SECRET is not configured on the server" }, { status: 503 });
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

// Was 3, which was a guess at what a gallery should hold rather than a
// limit anything needed: the gallery renders whatever rows exist and the
// thumbnail strip wraps. A manufacturer page routinely carries a front, a
// side, an open-door, a detail and a lifestyle shot, and an agent that
// found eight had five thrown away and had to come back for them.
export const MAX_PRODUCT_IMAGES = 8;

export function unknownKeyError(where: string, keys: string[], check: KeyCheck): NextResponse {
  const hints = keys
    .map((k) => {
      const alias = check.aliases?.[k];
      if (!alias) return `"${k}"`;
      if (alias.startsWith("(")) return `"${k}" — ${alias.slice(1, -1)}`;
      return `"${k}" — did you mean "${alias}"?`;
    })
    .join(", ");
  return NextResponse.json(
    {
      error: `unrecognised field(s) in ${where}: ${hints}`,
      accepted: [...check.known].sort(),
    },
    { status: 400 },
  );
}

export type FieldOutcome = { field: string; reason: string };

// The object form carries provenance alongside the URL. A plain `string[]`
// still works unchanged — normalizeImages is the one place that reconciles
// both shapes into this, so every image-handling branch downstream only
// ever deals with the object form.
export type EnrichImageInput = {
  url: string;
  sourcePageUrl?: string;
  sourceImageUrl?: string;
  sourceDomain?: string;
  capturedAt?: string; // ISO date
};

export type NormalizedImage = {
  url: string;
  sourcePageUrl: string | null;
  sourceImageUrl: string | null;
  sourceDomain: string | null;
  capturedAt: Date | null;
};

export function normalizeImages(images: (string | EnrichImageInput)[] | undefined): NormalizedImage[] {
  if (!images) return [];
  return images
    .map((img): NormalizedImage | null => {
      if (typeof img === "string") {
        return { url: img, sourcePageUrl: null, sourceImageUrl: null, sourceDomain: null, capturedAt: null };
      }
      if (!img || typeof img.url !== "string") return null;
      const parsedDate = img.capturedAt ? new Date(img.capturedAt) : null;
      return {
        url: img.url,
        sourcePageUrl: img.sourcePageUrl ?? null,
        sourceImageUrl: img.sourceImageUrl ?? null,
        sourceDomain: img.sourceDomain ?? null,
        capturedAt: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null,
      };
    })
    .filter((img): img is NormalizedImage => img !== null);
}

// A URL that 404s saved as a ProductImage is worse than no image at all —
// it shows a broken-image icon on a live product page instead of the
// placeholder — so a *confirmed* dead link is rejected before it's ever
// written. But some CDNs (Cloudflare-fronted ones especially) block
// requests from cloud/datacenter IPs like Vercel's even for perfectly real
// images — a network error or timeout here doesn't prove the URL is bad,
// just that *we* couldn't check it, so that case is let through rather
// than penalizing a real image for living behind bot protection.
export async function checkImageUrl(url: string): Promise<"ok" | "confirmed-bad" | "unverified"> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  const headers = { "User-Agent": "Mozilla/5.0 (compatible; AIEC-enrichment-bot/1.0)" };
  try {
    // GET, not HEAD: some hosts reject HEAD outright (405) or treat it as
    // more bot-like than a normal GET — the body itself is never awaited,
    // so this doesn't cost more than a HEAD would in practice.
    const res = await fetch(url, { method: "GET", redirect: "follow", signal: controller.signal, headers });
    if (res.ok) {
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType !== "" && !contentType.startsWith("image/")) return "confirmed-bad";
      // A real product photo is never a few hundred bytes — a common
      // scraping trap is a lazy-loaded gallery's placeholder (a 1x1
      // tracking-pixel-style SVG or GIF sitting in `src` while the real
      // photo only appears in `data-src`/`srcset` after JS runs), which
      // passes the content-type check just fine while being empty.
      const length = Number(res.headers.get("content-length") ?? "");
      if (Number.isFinite(length) && length > 0 && length < 1000) return "confirmed-bad";
      return "ok";
    }
    // Only treat "not found" as a confirmed dead link. 403/5xx overlap
    // heavily with bot/hotlink protection responses (Cloudflare in
    // particular answers a blocked request with 403, not a dropped
    // connection) — those aren't proof the image is actually missing.
    return res.status === 404 || res.status === 410 ? "confirmed-bad" : "unverified";
  } catch {
    return "unverified";
  } finally {
    clearTimeout(timeout);
  }
}

// The one resolver, shared with the inventory sync. It used to be a near
// copy here, and the copy is where a renamed brand's slug collision threw
// instead of reusing the row it collided with — see brand-resolver.ts.
export { resolveBrandId as findOrCreateBrandId } from "@/lib/inventory/brand-resolver";

// Same shape as inventory sync's own slug generator (asciiSlug + a short
// hash of the identifying value) — an ASCII base from the title, plus a
// hash-of-sku suffix so uniqueness is guaranteed without a DB round-trip to
// check for collisions.
export function generateProductSlug(title: string, sku: string): string {
  const base =
    title
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase() || "product";
  const suffix = createHash("sha1").update(sku).digest("hex").slice(0, 8);
  return `${base}-${suffix}`;
}

export async function findOrCreateSupplierId(name: string): Promise<string> {
  const trimmed = name.trim();
  const existing = await db.supplier.findFirst({ where: { name: trimmed } });
  if (existing) return existing.id;
  const created = await db.supplier.create({ data: { name: trimmed } });
  return created.id;
}

// "24", "24 חודשים" -> 24 months. "שנתיים"/"2 שנים" -> years, converted to
// months (any digit string alongside a Hebrew "year" word is read as years,
// not months — a plain number defaults to months).
export function parseWarrantyMonths(input: string | number): number | null {
  if (typeof input === "number") return Number.isFinite(input) && input > 0 ? Math.round(input) : null;
  const text = input.trim();
  const digits = text.match(/\d+/)?.[0];
  const isYears = /שנ/.test(text);
  if (digits) {
    const n = Number(digits);
    return n > 0 ? (isYears ? n * 12 : n) : null;
  }
  if (text.includes("שנתיים")) return 24;
  if (text === "שנה") return 12;
  return null;
}
