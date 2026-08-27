import "dotenv/config";
import { db } from "../src/lib/db";
import { classifyHeader } from "../src/lib/inventory/classifier";

// One-time backfill for products synced BEFORE the normalizer/classifier fix
// (see classifier.ts's "מידות" IGNORED rule and normalizer.ts's
// DIMENSIONS_LIKE guard) — their `title` is a dimensions string like
// "84X190X65.5" instead of a real product name. `Product.stockBreakdown`
// holds the full original Excel row (header label -> raw value, despite its
// misleading field name — see normalizer.ts's rawSnapshot comment), so the
// real title can be re-derived from already-stored data without a fresh
// Excel upload, by re-running the same header-classification + fallback
// logic the (now-fixed) sync pipeline uses going forward.
const DIMENSIONS_LIKE = /^[\d.]+\s*[xX×]\s*[\d.]+/;

async function main() {
  const candidates = await db.product.findMany({
    where: { stockBreakdown: { not: null } },
    select: { id: true, sku: true, title: true, model: true, stockBreakdown: true, brand: { select: { name: true } } },
  });

  const broken = candidates.filter((p) => DIMENSIONS_LIKE.test(p.title));
  console.log(`found ${broken.length} products with a dimensions-shaped title`);

  let fixed = 0;
  let stillUnresolved = 0;

  for (const p of broken) {
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(p.stockBreakdown!);
    } catch {
      stillUnresolved++;
      console.log("SKIP (unparseable stockBreakdown)", p.sku);
      continue;
    }

    let description: string | null = null;
    let model: string | null = null;
    let bestUnknown: string | null = null;

    for (const [label, value] of Object.entries(raw)) {
      if (value === null || value === undefined) continue;
      const s = String(value).trim();
      if (!s) continue;
      const field = classifyHeader(label);
      if (field === "DESCRIPTION" && !description) description = s;
      else if (field === "MODEL" && !model) model = s;
      else if (field === "UNKNOWN") {
        if (DIMENSIONS_LIKE.test(s)) continue;
        if (s.length >= 8 && (!bestUnknown || s.length > bestUnknown.length)) bestUnknown = s;
      }
    }

    const resolvedDescription = description ?? bestUnknown;
    const newTitle = resolvedDescription || [p.brand.name, model ?? p.model].filter(Boolean).join(" ") || null;

    if (!newTitle || DIMENSIONS_LIKE.test(newTitle)) {
      stillUnresolved++;
      console.log("UNRESOLVED (no real name found in raw row)", p.sku, "-", p.title);
      continue;
    }

    await db.product.update({
      where: { id: p.id },
      data: { title: newTitle, model: p.model ?? model ?? undefined },
    });
    fixed++;
    console.log("FIXED", p.sku, ":", p.title, "->", newTitle);
  }

  console.log({ totalBroken: broken.length, fixed, stillUnresolved });
  process.exit(0);
}

main();
