// Picks the 3 products for the daily Instagram story set ("3 הדילים של אלפרד להיום").
// Read-only: never writes to the DB, never touches Instagram.
//
//   npx tsx scripts/pick-story-products.ts                 # for today (Asia/Jerusalem)
//   npx tsx scripts/pick-story-products.ts --date 2026-11-25
//   npx tsx scripts/pick-story-products.ts --json          # machine-readable
//
// Rules (owner, 24.11.2026):
//   - published on the site and sellable (PUBLIC_PRODUCT_WHERE's stock rule is
//     stricter here: Product.stockQty > 0)
//   - at least 2 good units in Priority (PriorityStockBySku.goodQty >= 2)
//   - 3 different categories (compared at the top-level category)
//   - a product does not come back within 14 days (earlier STORY_SET rows)
//   - actually cheaper (owner, 24.11): Product.price < previousValue of the FIRST
//     PRICE_CHANGED InventoryChangeEvent since 2026-10-01; no such event = out.
//     The frame shows only the current price: no "before", no percentages.
//   - no Frigidaire; no product whose price a person set by hand
//     (Product.priceManualAt is not null) — "frozen" is read that way, say so
//     if the owner meant something else
// The pick is deterministic per date (hash), so re-running gives the same set.
// It prints, per product, the page URL, clean facts from the product page's
// JSON-LD and the input for the GPT frame prompt. Advantages must come only
// from the page; the picker lists what the page carries, a human/QA confirms.
import "dotenv/config";
import { createHash } from "node:crypto";
import { db } from "../src/lib/db";
import { jerusalemNow } from "../src/lib/instagram-plan";
import { parseStoryProducts } from "../src/lib/instagram-stories";

const SITE = "https://buytoday.co.il";
// Link sticker for the owner (added by hand in the app); every IG link carries utm: story / post / bio.
const STORY_LINK = `${SITE}/black-november?utm_source=instagram&utm_medium=story&utm_campaign=alfred-daily`;
const argv = process.argv.slice(2);
const dateArg = argv.includes("--date") ? argv[argv.indexOf("--date") + 1] : undefined;
const AS_JSON = argv.includes("--json");
const date = dateArg ?? jerusalemNow().date;

type Cand = { slug: string; title: string; price: number; stockQty: number; goodQty: number; brand: string; category: string; root: string; model: string | null };

function rank(slug: string) {
  return createHash("sha256").update(`${date}:${slug}`).digest("hex");
}

async function main() {
  const since = new Date(`${date}T00:00:00Z`);
  since.setUTCDate(since.getUTCDate() - 14);
  const recent = await db.instagramPost.findMany({
    where: { type: "STORY_SET", scheduledFor: { gte: since, lt: new Date(`${date}T00:00:00Z`) }, status: { in: ["queued", "publishing", "published"] } },
    select: { caption: true },
  });
  const used = new Set(recent.flatMap((r) => (parseStoryProducts(r.caption) ?? []).map((p) => p.slug)));

  const rows = await db.$queryRaw<Cand[]>`
    select p.slug, p.title, p.price::float8 as price, p."stockQty"::int as "stockQty",
           b."goodQty"::int as "goodQty", br.name as brand, c.name as category,
           coalesce(rc.name, c.name) as root, p.model
    from "Product" p
    join "PriorityStockBySku" b on upper(b."skuNorm") = upper(regexp_replace(p.sku, '[^A-Za-z0-9]', '', 'g'))
    join "Brand" br on br.id = p."brandId"
    join "Category" c on c.id = p."categoryId"
    left join "Category" rc on rc.id = c."parentId"
    where p."isPublished" = true
      and p."stockQty" > 0
      and b."goodQty" >= 2
      and p."priceManualAt" is null
      and p.price > 0
      and br.name not ilike '%frigidaire%'
      and p.price < (
        select nullif(regexp_replace(e."previousValue", '[^0-9.]', '', 'g'), '')::float8
        from "InventoryChangeEvent" e
        where e."productId" = p.id and e."changeType" = 'PRICE_CHANGED' and e."createdAt" >= '2026-10-01'
        order by e."createdAt" asc limit 1)`;
  const eligible = rows.filter((r) => !used.has(r.slug)).sort((a, z) => rank(a.slug).localeCompare(rank(z.slug)));

  const picked: Cand[] = [];
  const roots = new Set<string>();
  for (const r of eligible) {
    if (roots.has(r.root)) continue;
    roots.add(r.root);
    picked.push(r);
    if (picked.length === 3) break;
  }

  const out = [];
  for (const p of picked) {
    const url = `${SITE}/product/${p.slug}`;
    let image: string | null = null, description: string | null = null, specs: string[] = [];
    try {
      const html = await (await fetch(url)).text();
      for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
        try {
          const d = JSON.parse(m[1]);
          if (d && d["@type"] === "Product") {
            image = Array.isArray(d.image) ? d.image[0] : d.image ?? null;
            description = d.description ?? null;
            specs = (d.additionalProperty ?? []).slice(0, 12).map((x: { name: string; value: string }) => `${x.name}: ${x.value}`);
          }
        } catch { /* next block */ }
      }
    } catch { /* page fetch is best effort; the facts above come from the DB */ }
    out.push({ ...p, url, image, description, specs });
  }

  if (AS_JSON) { console.log(JSON.stringify({ date, eligible: eligible.length, excludedRecent: used.size, picked: out }, null, 2)); return; }
  console.log(`Story picks for ${date}: ${out.length}/3 (eligible ${eligible.length}, in 14-day history ${used.size})`);
  out.forEach((p, i) => {
    console.log(`\n#${i + 2} ${p.title}\n  slug ${p.slug} | ${p.brand} | ${p.root} > ${p.category} | model ${p.model ?? "-"}\n  price ${p.price} ILS | site stock ${p.stockQty} | Priority good ${p.goodQty}\n  ${p.url}\n  image ${p.image ?? "(none found)"}\n  page description: ${p.description ?? "-"}\n  page specs (advantages must come only from here):\n${p.specs.map((s) => `    - ${s}`).join("\n")}`);
  });
  if (out.length < 3) console.log("\nWARNING: fewer than 3 products satisfy the rules.");
  console.log(`\nNotes to owner - link sticker for the story: ${STORY_LINK}`);
  console.log(`\nRow for the DB caption: ${JSON.stringify({ products: out.map((p) => ({ slug: p.slug, price: p.price })) })}`);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
