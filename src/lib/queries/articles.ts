import "server-only";
import { db } from "@/lib/db";

// Every article's `content` column is one of these, JSON-encoded — see the
// Article model comment in schema.prisma for why this instead of markdown.
//
// The first three were enough while an article was prose. The buying guides
// are not prose: their argument lives in comparison tables (this dryer at
// this price against that one) and their reach lives in the questions at the
// end, which is what an answer engine quotes. A table flattened to
// paragraphs is not a smaller version of the table, it is unreadable, and a
// question list that is only paragraphs is invisible to the FAQPage schema.
//
// `text` in every block is inline markdown, restricted to exactly two forms:
// **bold** and [label](href). Anything else is shown literally. Two, not a
// markdown parser, because the blocks are already the structure — inline
// syntax only has to carry emphasis and links, and a real parser here would
// be a second, weaker renderer for headings and lists that this file already
// models properly. See renderInline in the article page.
export type ArticleBlock =
  | { type: "heading"; text: string }
  | { type: "subheading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  // The answer-up-front callout each guide opens with: the short version, for
  // a reader who wants the number and not the essay.
  | { type: "quote"; text: string }
  | { type: "table"; head: string[]; rows: string[][] }
  | { type: "faq"; items: { q: string; a: string }[] };

// The FAQPage entities for an article, taken from the questions it actually
// renders rather than from a second copy stored beside them.
//
// The brief for these guides supplied a hand-written FAQPage block to paste
// into the head. Pasting it would have worked on the day and drifted by the
// first correction: Google penalises structured data that disagrees with the
// visible page, and the way that happens is never a decision — it is someone
// fixing a number in the prose and not knowing a JSON copy exists. Deriving
// it means the two cannot disagree.
//
// Marked-up text is stripped: schema.org wants the answer, not the emphasis.
export function faqEntities(blocks: ArticleBlock[]) {
  const items = blocks.flatMap((b) => (b.type === "faq" ? b.items : []));
  if (items.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: "he-IL",
    mainEntity: items.map(({ q, a }) => ({
      "@type": "Question",
      name: stripInline(q),
      acceptedAnswer: { "@type": "Answer", text: stripInline(a) },
    })),
  };
}

export function stripInline(text: string): string {
  return text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\*\*(.+?)\*\*/g, "$1");
}

export function parseArticleContent(raw: string): ArticleBlock[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function getPublishedArticles() {
  return db.article.findMany({
    where: { isPublished: true },
    orderBy: { publishedAt: "desc" },
    select: {
      slug: true,
      title: true,
      excerpt: true,
      coverImageUrl: true,
      category: true,
      publishedAt: true,
    },
  });
}

export async function getArticleBySlug(slug: string) {
  return db.article.findFirst({ where: { slug, isPublished: true } });
}

// The reverse direction of an article's own relatedCategorySlug CTA — shown
// on the category page itself so the linking goes both ways (article ->
// category, category -> article), not just one. Takes the most recently
// published match if more than one article ever points at the same
// category, so this never has to pick among several with no signal.
//
// Falls back up the category tree when the exact category has no guide of
// its own. One dishwasher guide is the right guide for /dishwashers and for
// all three of fully-integrated, semi-integrated and standard underneath it
// — the buying advice does not change per leaf — and pinning a copy to each
// would be four articles competing for the same query and three of them to
// forget when a price changes. Walks up rather than down because a
// department's guide generalises to its leaves and a leaf's does not
// generalise to its siblings.
export async function getArticleByCategorySlug(categorySlug: string) {
  let slug: string | null = categorySlug;
  // Bounded: a cycle in parentId would otherwise spin here forever, and the
  // tree is three deep.
  for (let depth = 0; slug && depth < 5; depth++) {
    const article = await db.article.findFirst({
      where: { relatedCategorySlug: slug, isPublished: true },
      orderBy: { publishedAt: "desc" },
      select: { slug: true, title: true, excerpt: true },
    });
    if (article) return article;
    const category: { parent: { slug: string } | null } | null = await db.category.findUnique({
      where: { slug },
      select: { parent: { select: { slug: true } } },
    });
    slug = category?.parent?.slug ?? null;
  }
  return null;
}
