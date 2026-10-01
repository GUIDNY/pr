/**
 * The buying guide on a department page, from content/category-intros/*.html
 * into Category.description. Idempotent: re-running overwrites in place.
 *
 * Files rather than rows typed into the admin, for the reason the buying
 * guides are files: a claim that was checked once has to be re-checkable
 * later, and a file diffs where a textarea does not. The filename is the
 * category slug, and a slug with no category is an error rather than a
 * silent skip — a typo there would otherwise look exactly like success.
 *
 * WHY THE NINE DEPARTMENTS AND NOT THE WHOLE TREE: 40 of the 51 category
 * pages already carry a real guide, and those are the leaves. The nine at
 * the top of the tree had nothing at all, and they are the pages that pass
 * authority down to the leaves. A measurement of all 142 brand and category
 * pages found the longest paragraph in the body of 101 of them to be the
 * same 157 characters, byte for byte: the accessibility widget's privacy
 * notice. A page whose most substantial text is a notice identical to a
 * hundred other pages is what "crawled, not indexed" describes, and 1,637
 * URLs are sitting in it.
 *
 * The format is the one CategoryIntro already parses: <h2> and <p>, with the
 * FIRST heading dropped on render because it restates the page's own <h1>.
 * Every file therefore opens with a heading nobody will see, which is
 * deliberate — writing the file without one silently loses the first real
 * section.
 *
 *   npm run seed:intros
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { db } from "../src/lib/db";

const DIR = join(process.cwd(), "content", "category-intros");

async function main() {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".html"));
  let written = 0;
  let missing = 0;

  for (const file of files) {
    const slug = file.replace(/\.html$/, "");
    const html = readFileSync(join(DIR, file), "utf8").trim().replace(/\n+/g, "");

    const category = await db.category.findUnique({ where: { slug }, select: { id: true, name: true } });
    if (!category) {
      console.log(`  MISSING  ${slug} — no category with this slug`);
      missing++;
      continue;
    }

    const headings = (html.match(/<h2>/g) ?? []).length;
    /* One heading is a file that only has the throwaway title, which renders
       as nothing at all. Worth failing on rather than writing. */
    if (headings < 2) {
      console.log(`  THIN     ${slug} — ${headings} heading(s); the first is dropped on render`);
      missing++;
      continue;
    }

    await db.category.update({ where: { id: category.id }, data: { description: html } });
    console.log(`  ok       ${slug.padEnd(22)} ${category.name.padEnd(22)} ${headings - 1} sections, ${html.length} chars`);
    written++;
  }

  console.log(`\n${written} written, ${missing} skipped.\n`);
  await db.$disconnect();
  if (missing > 0) process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
