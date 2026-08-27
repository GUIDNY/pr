import "server-only";
import { db } from "@/lib/db";

// Every article's `content` column is one of these, JSON-encoded — see the
// Article model comment in schema.prisma for why this instead of markdown.
export type ArticleBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] };

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
export async function getArticleByCategorySlug(categorySlug: string) {
  return db.article.findFirst({
    where: { relatedCategorySlug: categorySlug, isPublished: true },
    orderBy: { publishedAt: "desc" },
    select: { slug: true, title: true, excerpt: true },
  });
}
