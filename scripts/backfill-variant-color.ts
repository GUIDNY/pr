import "dotenv/config";
import { db } from "../src/lib/db";

// One-time backfill for products synced BEFORE the classifier fix (see
// classifier.ts's VARIANT_TEXT rule) — a bare "תאור" column's value (often
// the color, e.g. "רוז גולד"/"שחור") was getting silently discarded
// because it was classified as the same DESCRIPTION field as the real
// "תאור מוצר" column, and only the first of the two survived. The value
// is still sitting in Product.stockBreakdown (the full original row).
const COLOR_WORD_PATTERN =
  /שחור|לבן|אפור|כסוף|כסף|זהב|זהוב|אדום|כחול|תכלת|ירוק|צהוב|כתום|ורוד|רוז|סגול|חום|בז['"]?|נירוסטה|זכוכית|בורדו|שמפניה/;

async function main() {
  const candidates = await db.product.findMany({
    where: { stockBreakdown: { not: null }, shortDescription: null },
    select: { id: true, sku: true, title: true, stockBreakdown: true },
  });

  let fixed = 0;
  let skippedNotColorLike = 0;

  for (const p of candidates) {
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(p.stockBreakdown!);
    } catch {
      continue;
    }
    const hasOtherDesc =
      "תאור מוצר" in raw ||
      "תיאור" in raw ||
      "תיאור מוצר" in raw ||
      Object.keys(raw).some((k) => (k.includes("תאור") || k.includes("תיאור")) && k.trim() !== "תאור");
    const bareTaar = raw["תאור"];
    if (!hasOtherDesc || typeof bareTaar !== "string") continue;

    const value = bareTaar.trim();
    if (!value || !COLOR_WORD_PATTERN.test(value)) {
      skippedNotColorLike++;
      continue;
    }

    await db.product.update({ where: { id: p.id }, data: { shortDescription: `צבע: ${value}` } });
    fixed++;
    console.log("FIXED", p.sku, ":", p.title, "-> צבע:", value);
  }

  console.log({ fixed, skippedNotColorLike });
  process.exit(0);
}

main();
