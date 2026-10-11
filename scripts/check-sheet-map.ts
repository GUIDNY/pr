/**
 * The guard on the mapping between a price-list tab and a category.
 *
 * This check exists because of one line. On 2026-09-09 normalizer.ts started
 * trimming the incoming tab name — the right fix for a different bug — while
 * sheet-map.ts still held keys transcribed with the supplier's stray spaces
 * and matched them exactly. From that day "מסכים" never matched "מסכים ",
 * categoryForSheet returned null, and sync.ts dropped every row of four tabs
 * before touching a product. The sheets were read daily. 123 published
 * products worth ₪538,000 went 35 days without a stock or price update, and
 * it surfaced as a customer ringing about a TV mount that had left the price
 * list in September.
 *
 * Normalising both sides fixed it. This is what stops it coming back in
 * another form: the lookup is asserted to forgive whitespace, the stored
 * names are asserted not to need forgiving, and the unscoped fallback is
 * asserted to be unambiguous — because that fallback is what lets a tab
 * resolve whichever workbook it arrives in, and it would start guessing the
 * day two workbooks used one name for two categories.
 *
 * No database and no network: it reads the map and the category tree.
 *   npm run check:sheets
 */
import {
  SHEET_CATEGORY_MAP,
  EXTRA_TAB_CATEGORY_MAP,
  NON_PRODUCT_SHEETS,
  categoryForSheet,
  categoryForUnscopedSheet,
  normaliseSheetName,
  allKnownSheetNames,
  type SourceKey,
} from "../src/lib/inventory/sheet-map";
import { CATEGORY_TREE } from "../src/lib/category-tree";

const failures: string[] = [];
const notes: string[] = [];

function fail(message: string) {
  failures.push(message);
}

/* 1. Every stored name is already canonical.
      A key that needs trimming is a key whose whitespace is load-bearing
      somewhere, and that is the bug. */
for (const [sourceKey, map] of Object.entries(SHEET_CATEGORY_MAP)) {
  for (const name of Object.keys(map)) {
    if (name !== normaliseSheetName(name)) {
      fail(
        `SHEET_CATEGORY_MAP.${sourceKey}: the key ${JSON.stringify(name)} carries whitespace. ` +
          `Store it as ${JSON.stringify(normaliseSheetName(name))} — the lookup normalises, ` +
          `so the whitespace means nothing and reads as if it mattered.`,
      );
    }
  }
}
for (const name of Object.keys(EXTRA_TAB_CATEGORY_MAP)) {
  if (name !== normaliseSheetName(name)) {
    fail(
      `EXTRA_TAB_CATEGORY_MAP: the key ${JSON.stringify(name)} carries whitespace. ` +
        `Store it as ${JSON.stringify(normaliseSheetName(name))}.`,
    );
  }
}
for (const [sourceKey, names] of Object.entries(NON_PRODUCT_SHEETS)) {
  for (const name of names) {
    if (name !== normaliseSheetName(name)) {
      fail(`NON_PRODUCT_SHEETS.${sourceKey}: ${JSON.stringify(name)} carries whitespace.`);
    }
  }
}

/* 2. No two keys collide once normalised, which would make one of them
      unreachable — the silent kind of mistake this file is about. */
for (const [sourceKey, map] of Object.entries(SHEET_CATEGORY_MAP)) {
  const seen = new Map<string, string>();
  for (const name of Object.keys(map)) {
    const norm = normaliseSheetName(name);
    const first = seen.get(norm);
    if (first !== undefined) {
      fail(
        `SHEET_CATEGORY_MAP.${sourceKey}: ${JSON.stringify(name)} and ${JSON.stringify(first)} ` +
          `normalise to the same name, so one of them can never be reached.`,
      );
    }
    seen.set(norm, name);
  }
}

/* 3. The unscoped fallback has to be unambiguous.
      categoryForSheet falls back to it so that a tab resolves whichever
      workbook it arrives in — the mount tab is written both
      "מתקניי תליה וכבלים" and "מוצרי תלייה וכבלים" and products sit under
      both. That fallback is only safe while one name means one category. */
const slugsByName = new Map<string, Set<string>>();
for (const { name, slug } of allKnownSheetNames()) {
  const norm = normaliseSheetName(name);
  const set = slugsByName.get(norm) ?? new Set<string>();
  set.add(slug);
  slugsByName.set(norm, set);
}
for (const [name, slugs] of slugsByName) {
  if (slugs.size > 1) {
    fail(
      `The tab name ${JSON.stringify(name)} maps to more than one category ` +
        `(${[...slugs].join(", ")}). categoryForSheet falls back to the unscoped lookup, ` +
        `which would now pick one of them arbitrarily. Scope it or rename it.`,
    );
  }
}

/* 4. Every slug names a real category. A tab that maps to a slug with no
      category row imports nothing either — the same outage, one layer down,
      and the per-row UNMATCHED_ROW alert now names the slug for exactly
      this case. */
const realSlugs = new Set<string>();
for (const department of CATEGORY_TREE) {
  realSlugs.add(department.slug);
  for (const child of department.children ?? []) realSlugs.add(child.slug);
}
for (const { source, name, slug } of allKnownSheetNames()) {
  if (!realSlugs.has(slug)) {
    fail(`${source}: tab ${JSON.stringify(name)} maps to "${slug}", which is not in CATEGORY_TREE.`);
  }
}

/* 5. The regression test for the actual failure: every stored name must
      still resolve when the supplier retypes it with a leading space, a
      trailing space, or a doubled inner space. This is the assertion that
      would have failed on 2026-09-09. */
const mangles: [string, (s: string) => string][] = [
  ["leading space", (s) => ` ${s}`],
  ["trailing space", (s) => `${s} `],
  ["both", (s) => ` ${s} `],
  ["tab character", (s) => `\t${s}`],
  ["doubled inner space", (s) => s.replace(" ", "  ")],
];
for (const [sourceKey, map] of Object.entries(SHEET_CATEGORY_MAP)) {
  for (const [name, slug] of Object.entries(map)) {
    for (const [label, mangle] of mangles) {
      const got = categoryForSheet(sourceKey as SourceKey, mangle(name));
      if (got !== slug) {
        fail(
          `categoryForSheet(${sourceKey}, ${JSON.stringify(mangle(name))}) returned ` +
            `${got === null ? "null" : `"${got}"`}, expected "${slug}" — ${label} broke the lookup.`,
        );
      }
    }
  }
}
for (const [name, slug] of Object.entries(EXTRA_TAB_CATEGORY_MAP)) {
  for (const [label, mangle] of mangles) {
    const got = categoryForUnscopedSheet(mangle(name));
    if (got !== slug) {
      fail(
        `categoryForUnscopedSheet(${JSON.stringify(mangle(name))}) returned ` +
          `${got === null ? "null" : `"${got}"`}, expected "${slug}" — ${label} broke the lookup.`,
      );
    }
  }
}

/* 6. And a tab nobody has mapped still resolves to null, so the
      SHEET_NOT_MAPPED alert keeps firing for a genuinely new tab instead of
      being swallowed by an over-eager fallback. */
if (categoryForSheet("white-goods-screens", "לשונית שאינה קיימת בשום מקום") !== null) {
  fail("An unknown tab name resolved to a category. The fallback is matching too much.");
}

notes.push(`${allKnownSheetNames().length} tab names mapped across ${Object.keys(SHEET_CATEGORY_MAP).length} workbooks + the variant table.`);
notes.push(`${slugsByName.size} distinct names after normalising, all unambiguous.`);
notes.push(`${mangles.length} whitespace mutations tested against every name.`);

console.log("check:sheets — price-list tab mapping\n");
for (const note of notes) console.log(`  · ${note}`);
console.log("");

if (failures.length > 0) {
  console.error(`${failures.length} problem${failures.length === 1 ? "" : "s"}:\n`);
  for (const f of failures) console.error(`  ✗ ${f}\n`);
  process.exit(1);
}
console.log("  ✓ every tab name resolves, and none of them depends on whitespace to do it.");
