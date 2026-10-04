import "dotenv/config";
import { db } from "../src/lib/db";

/**
 * Width and depth for the cooling leaves, out of the product description and
 * into ProductAttributeValue — where the Finder, the spec table's dimensions
 * block and a future g:product_detail can all read them.
 *
 *   npm run check:dimensions      # report only
 *   npm run fix:dimensions        # write
 *
 * WHY THE DESCRIPTION AND NOT THE SHEET. The source row carries a column
 * headed `עומקXגובהXרוחב` on 199 of the 202 cooling products, which looks
 * like the obvious source and is not: on 166 of 181 rows the FIRST number
 * matches the width stated in the description, not the third, so the header's
 * first and last labels are swapped against its own data. On a handful of
 * rows the order really is depth-first (LG GM-859RSCE, Bauknecht GKIE IL
 * 3000). A column whose field order varies row to row cannot be parsed, so
 * the sheet is used only to corroborate — exactly the mistake the brand
 * derivation made five times, which is why this comment is longer than the
 * parser.
 *
 * The description is a real source: it was written from the manufacturer's
 * own figures with the URL kept in descriptionSourceUrl. Where it and the
 * sheet disagree beyond 2 cm, NOTHING is written and the product is listed
 * for a person — a wrong width on a retail page is a fridge that does not
 * fit the opening the customer measured.
 *
 * Values are stored as bare numbers ("90.8", "60"). product-content.ts
 * appends the attribute's unit only to a value that is bare, so "60 ס\"מ"
 * here would render the unit twice.
 */

const CATEGORY_SLUGS = [
  "fridge-4-door",
  "fridge-bottom-freezer",
  "fridge-top-freezer",
  "fridge-side-by-side",
  "fridge-integrated",
] as const;

/* `רוחב`/`עומק` immediately followed by the number, so `רוחב נישה 56 ס"מ`
   and `רוחב מינימלי` are skipped by construction: those are the opening's
   measurement, not the appliance's. `כ-` is kept because "כ-91 ס"מ" is how
   the description hedges a figure it is sure of to one decimal. */
const WIDTH = /רוחב[ :]*(?:כ-)?(\d{2,3}(?:[.,]\d)?) ?ס"?מ/;
const DEPTH_BODY = /עומק גוף[ :]*(?:כ-)?(\d{2,3}(?:[.,]\d)?) ?ס"?מ/;
const DEPTH_PLAIN = /עומק[ :]*(?:כ-)?(\d{2,3}(?:[.,]\d)?) ?ס"?מ/;
const DEPTH_TOTAL = /עומק כולל(?: דלתות)?[ :]*(?:כ-)?(\d{2,3}(?:[.,]\d)?) ?ס"?מ/;
const TRIPLE = /^\s*([\d.,]+)\s*[xX×]\s*([\d.,]+)\s*[xX×]\s*([\d.,]+)/;

/* A fridge narrower than 40 cm or deeper than a metre is a parse, not a
   product. Both bounds are wider than anything in the catalog (45–91.8 and
   54.5–91.4), so they catch a broken match rather than trim a real one. */
const WIDTH_RANGE = [40, 120] as const;
const DEPTH_RANGE = [40, 100] as const;
const AGREEMENT_CM = 2;

const ATTRS = [
  { key: "width", label: "רוחב", unit: 'ס"מ', sortOrder: 1 },
  { key: "depth", label: "עומק", unit: 'ס"מ', sortOrder: 2 },
] as const;

const num = (s: string | undefined) => (s ? Number(s.replace(",", ".")) : null);
const plain = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
/* Trailing ".0" would fail product-content.ts's bare-number test. */
const bare = (n: number) => String(Number(n.toFixed(1)));

type Verdict = { value: number | null; reason?: "absent" | "contradicted" | "out-of-range" };

function reconcile(stated: number | null, sheet: [number, number] | null, range: readonly [number, number]): Verdict {
  if (stated === null) return { value: null, reason: "absent" };
  if (stated < range[0] || stated > range[1]) return { value: null, reason: "out-of-range" };
  if (!sheet) return { value: stated };
  const agrees = sheet.some((s) => Math.abs(stated - s) <= AGREEMENT_CM);
  return agrees ? { value: stated } : { value: null, reason: "contradicted" };
}

async function main() {
  const write = process.argv.includes("--write");

  const categories = await db.category.findMany({
    where: { slug: { in: [...CATEGORY_SLUGS] } },
    select: { id: true, slug: true },
  });

  /* These five leaves carry a legacy attribute set keyed `width`/`capacity`
     rather than the `width_cm`/`capacity_liters` that seed-category-attributes
     uses — and that seeder does not cover them at all. Adopting its keys here
     would leave two רוחב rows per category, so the existing `width` is used
     as-is and `depth` is created to match it. Upserted rather than assumed so
     a fresh database can run this. */
  const attrId = new Map<string, string>();
  for (const c of categories) {
    for (const def of ATTRS) {
      const attr = await db.categoryAttribute.upsert({
        where: { categoryId_key: { categoryId: c.id, key: def.key } },
        update: {},
        create: { categoryId: c.id, ...def, inputType: "text", isFilter: true },
      });
      attrId.set(`${c.id}:${def.key}`, attr.id);
    }
  }

  const products = await db.product.findMany({
    where: { categoryId: { in: categories.map((c) => c.id) } },
    select: {
      id: true, title: true, categoryId: true, description: true, stockBreakdown: true,
      attributeValues: { select: { attributeId: true } },
    },
  });

  const tally = { written: 0, alreadySet: 0, absent: 0, contradicted: 0, outOfRange: 0 };
  const contradictions: string[] = [];

  for (const p of products) {
    const text = plain(p.description ?? "");

    let sheet: [number, number] | null = null;
    if (p.stockBreakdown?.startsWith("{")) {
      try {
        const row = JSON.parse(p.stockBreakdown) as Record<string, unknown>;
        const raw = row["עומקXגובהXרוחב"];
        const m = raw ? TRIPLE.exec(String(raw)) : null;
        const first = num(m?.[1]);
        const third = num(m?.[3]);
        if (first !== null && third !== null) sheet = [first, third];
      } catch {
        /* a row that will not parse is simply no corroboration */
      }
    }

    const found = {
      width: num(WIDTH.exec(text)?.[1]),
      depth: num(DEPTH_BODY.exec(text)?.[1]) ?? num(DEPTH_PLAIN.exec(text)?.[1]) ?? num(DEPTH_TOTAL.exec(text)?.[1]),
    };

    for (const key of ["width", "depth"] as const) {
      const id = attrId.get(`${p.categoryId}:${key}`);
      if (!id) continue;
      if (p.attributeValues.some((v) => v.attributeId === id)) {
        tally.alreadySet++;
        continue;
      }

      const verdict = reconcile(found[key], sheet, key === "width" ? WIDTH_RANGE : DEPTH_RANGE);
      if (verdict.value === null) {
        if (verdict.reason === "absent") tally.absent++;
        else if (verdict.reason === "contradicted") {
          tally.contradicted++;
          contradictions.push(`${key} ${found[key]} vs sheet ${sheet?.join("/")} — ${p.title}`);
        } else tally.outOfRange++;
        continue;
      }

      tally.written++;
      if (write) {
        await db.productAttributeValue.create({
          data: { productId: p.id, attributeId: id, value: bare(verdict.value) },
        });
      }
    }
  }

  console.log(`\n${products.length} products in ${categories.length} cooling leaves`);
  console.log(write ? tally : { ...tally, written: `${tally.written} (dry run — pass --write)` });

  if (contradictions.length) {
    console.log(`\n${contradictions.length} left empty because the sheet contradicts the description:`);
    for (const line of contradictions) console.log("  " + line);
  }

  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
