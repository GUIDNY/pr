// The five buying guides, from content/buying-guides/*.json into the Article
// table. Idempotent: re-running updates in place and never duplicates a slug.
//
// The guides live as files rather than as rows typed into the admin because
// every number in them was checked against the catalog before publishing —
// the price on a product page, the count of models in a category, the median
// of a spec — and a claim that was verified once has to be re-verifiable
// later. A file diffs; a textarea does not.
//
// `content` is the JSON block array the article page renders (ArticleBlock in
// lib/queries/articles.ts). `slug` is never rewritten after the first run:
// it is the public URL.
//
//   npm run seed:guides
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { db } from "../src/lib/db";

const DIR = join(process.cwd(), "content", "buying-guides");

type Guide = {
  slug: string;
  title: string;
  seoTitle: string;
  seoDesc: string;
  excerpt: string;
  category: string;
  relatedCategorySlug: string;
  blocks: unknown[];
};

async function main() {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".json"));
  for (const file of files) {
    const guide = JSON.parse(readFileSync(join(DIR, file), "utf8")) as Guide;
    const content = JSON.stringify(guide.blocks);
    const common = {
      title: guide.title,
      excerpt: guide.excerpt,
      content,
      category: guide.category,
      relatedCategorySlug: guide.relatedCategorySlug,
      seoTitle: guide.seoTitle,
      seoDesc: guide.seoDesc,
      isPublished: true,
    };
    await db.article.upsert({
      where: { slug: guide.slug },
      // publishedAt only on create: a correction is not a new publication,
      // and moving the date would reorder the article list and change the
      // datePublished in the page's Article schema for no reason.
      create: { slug: guide.slug, ...common },
      update: common,
    });
    console.log(`${guide.slug}  ${guide.blocks.length} blocks`);
  }
  console.log(`${files.length} guides`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
