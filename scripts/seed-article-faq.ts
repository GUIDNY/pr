/**
 * The שאלות נפוצות block for the six short articles, from content/ into
 * the database — and the opening callout brought into the same shape the
 * five long guides use.
 *
 * Two changes per article, both to Article.content, which is a JSON array
 * of blocks (see ArticleBlock in lib/queries/articles.ts):
 *
 *   1. a `faq` block appended at the end, from
 *      content/article-faq/geo4-faq-blocks.json
 *   2. the first block, if it is a `paragraph` opening "התשובה הקצרה:",
 *      rewritten as the `quote` block the 9.9 guides open with, with the
 *      label bolded
 *
 * Nothing else is touched, and both steps are idempotent: an article that
 * already carries a faq block is left alone, and so is an opening block
 * that is already a quote. Re-running after a partial run finishes it.
 *
 * A file and a script rather than hand-written SQL, for the reason the
 * buying guides are files: 38 question/answer pairs are content, they will
 * be corrected later, and a file diffs where an UPDATE does not. No code
 * reads the JSON at runtime — faqEntities builds the FAQPage markup from
 * the blocks the page renders, so the schema follows from this and cannot
 * disagree with it.
 *
 *   npm run check:article-faq      # says what it would do, writes nothing
 *   npm run fix:article-faq        # does it
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "../src/lib/db";
import type { ArticleBlock } from "../src/lib/queries/articles";

const FILE = join(process.cwd(), "content/article-faq/geo4-faq-blocks.json");
const WRITE = process.argv.includes("--write");

/** The label the five 9.9 guides open with, and the shape they open in. */
const SHORT_ANSWER = "התשובה הקצרה:";

type FaqBlock = { type: "faq"; items: { q: string; a: string }[] };

function readBlocks(): Record<string, FaqBlock> {
  const parsed = JSON.parse(readFileSync(FILE, "utf8")) as Record<string, unknown>;
  delete parsed._meta;
  const out: Record<string, FaqBlock> = {};
  for (const [slug, raw] of Object.entries(parsed)) {
    const block = raw as FaqBlock;
    if (block?.type !== "faq" || !Array.isArray(block.items) || block.items.length === 0) {
      throw new Error(`${slug}: not a faq block with items`);
    }
    for (const item of block.items) {
      if (!item?.q?.trim() || !item?.a?.trim()) throw new Error(`${slug}: an item is missing q or a`);
    }
    out[slug] = { type: "faq", items: block.items.map((i) => ({ q: i.q.trim(), a: i.a.trim() })) };
  }
  return out;
}

async function main() {
  const wanted = readBlocks();
  const slugs = Object.keys(wanted);
  const articles = await db.article.findMany({
    where: { slug: { in: slugs } },
    select: { id: true, slug: true, content: true },
  });
  const bySlug = new Map(articles.map((a) => [a.slug, a]));

  const missing = slugs.filter((s) => !bySlug.has(s));
  if (missing.length > 0) {
    // A slug with no article is a typo in the file, and a typo that is
    // skipped quietly looks exactly like success.
    console.error(`no article for: ${missing.join(", ")}`);
    process.exitCode = 1;
  }

  let faqAdded = 0;
  let calloutFixed = 0;

  for (const slug of slugs) {
    const article = bySlug.get(slug);
    if (!article) continue;

    let blocks: ArticleBlock[];
    try {
      blocks = JSON.parse(article.content) as ArticleBlock[];
    } catch {
      console.error(`${slug}: content is not JSON — skipped`);
      process.exitCode = 1;
      continue;
    }
    if (!Array.isArray(blocks)) {
      console.error(`${slug}: content is not an array of blocks — skipped`);
      process.exitCode = 1;
      continue;
    }

    const next = [...blocks];
    const notes: string[] = [];

    const first = next[0];
    if (first?.type === "paragraph" && first.text.startsWith(SHORT_ANSWER)) {
      next[0] = {
        type: "quote",
        text: `**${SHORT_ANSWER}**${first.text.slice(SHORT_ANSWER.length)}`,
      };
      notes.push("callout → quote");
      calloutFixed++;
    }

    if (next.some((b) => b.type === "faq")) {
      notes.push("faq already there");
    } else {
      next.push(wanted[slug]);
      notes.push(`+${wanted[slug].items.length} faq pairs`);
      faqAdded++;
    }

    const changed = JSON.stringify(next) !== article.content;
    console.log(`  ${changed ? (WRITE ? "wrote " : "would ") : "same  "} ${slug.padEnd(42)} ${notes.join(" · ")}`);
    if (changed && WRITE) {
      await db.article.update({ where: { id: article.id }, data: { content: JSON.stringify(next) } });
    }
  }

  console.log(
    `\n${WRITE ? "written" : "dry run"}: ${faqAdded} faq blocks, ${calloutFixed} callouts` +
      (WRITE ? "" : " — run with --write to apply"),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
