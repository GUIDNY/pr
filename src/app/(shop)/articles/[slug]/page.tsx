import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Calendar, ArrowLeft } from "lucide-react";
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { getArticleBySlug, parseArticleContent } from "@/lib/queries/articles";
import { formatDate } from "@/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article) return {};
  const title = article.seoTitle ?? article.title;
  const description = article.seoDesc ?? article.excerpt;
  return {
    title,
    description,
    alternates: { canonical: `/articles/${article.slug}` },
    openGraph: {
      title,
      description,
      type: "article",
      publishedTime: article.publishedAt.toISOString(),
      modifiedTime: article.updatedAt.toISOString(),
      images: article.coverImageUrl ? [{ url: article.coverImageUrl }] : undefined,
    },
  };
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article) notFound();

  const blocks = parseArticleContent(article.content);

  // Structured data for AI/answer-engine and rich-result extraction — the
  // opening paragraph doubles as the schema's description so an engine
  // quoting this article and one reading the JSON-LD land on the same text.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.excerpt,
    image: article.coverImageUrl ? [article.coverImageUrl] : undefined,
    datePublished: article.publishedAt.toISOString(),
    dateModified: article.updatedAt.toISOString(),
    author: { "@type": "Organization", name: "A&I Electronics" },
    publisher: { "@type": "Organization", name: "A&I Electronics" },
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">ראשי</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/articles">מאמרים</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="line-clamp-1">{article.title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <article className="mt-4">
        {article.category && <span className="text-brand text-sm font-semibold">{article.category}</span>}
        <h1 className="mt-1.5 text-2xl leading-tight font-black text-balance sm:text-3xl">{article.title}</h1>
        <div className="text-muted-foreground mt-3 flex items-center gap-1.5 text-sm">
          <Calendar className="size-4" />
          <span>עודכן לאחרונה {formatDate(article.updatedAt)}</span>
        </div>

        {article.coverImageUrl && (
          <div className="bg-muted relative mt-6 aspect-[16/9] overflow-hidden rounded-2xl">
            <Image src={article.coverImageUrl} alt="" fill className="object-cover" sizes="(min-width: 768px) 768px, 100vw" priority />
          </div>
        )}

        <div className="mt-8 flex flex-col gap-4 text-base leading-relaxed">
          {blocks.map((block, i) => {
            if (block.type === "heading") {
              return (
                <h2 key={i} className="mt-4 text-xl font-bold text-balance">
                  {block.text}
                </h2>
              );
            }
            if (block.type === "list") {
              return (
                <ul key={i} className="flex list-disc flex-col gap-1.5 ps-5">
                  {block.items.map((item, j) => (
                    <li key={j}>{item}</li>
                  ))}
                </ul>
              );
            }
            return (
              <p key={i} className="text-foreground/90">
                {block.text}
              </p>
            );
          })}
        </div>
      </article>

      <div className="border-border mt-10 flex flex-col items-start gap-3 rounded-2xl border p-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium">רוצים לראות את המוצרים שמתאימים למה שקראתם?</p>
        <Link
          href={article.relatedCategorySlug ? `/category/${article.relatedCategorySlug}` : "/"}
          className="bg-brand text-brand-foreground flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold"
        >
          {article.relatedCategorySlug ? "לכל המוצרים בקטגוריה" : "לכל הקטגוריות"}
          <ArrowLeft className="size-4 rtl:rotate-180" />
        </Link>
      </div>
    </div>
  );
}
