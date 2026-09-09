import { notFound } from "next/navigation";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema } from "@/lib/schema";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Calendar, ArrowLeft } from "lucide-react";
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { getArticleBySlug, parseArticleContent, faqEntities } from "@/lib/queries/articles";
import type { ArticleBlock } from "@/lib/queries/articles";
import { formatDate } from "@/lib/format";
import { SITE_URL } from "@/lib/site-url";

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
  const faq = faqEntities(blocks);

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
    author: { "@type": "Organization", name: "Buy Today" },
    publisher: { "@type": "Organization", name: "Buy Today" },
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <JsonLd data={jsonLd} />
      <JsonLd
        data={breadcrumbSchema([
          { name: "ראשי", path: "/" },
          { name: "מאמרים", path: "/articles" },
          { name: article.title, path: `/articles/${article.slug}` },
        ])}
      />
      {/*
        A separate FAQPage entity rather than a @graph: schema.org allows a
        page to carry several top-level types, and Google reads Article and
        FAQPage independently. Built from the questions the page renders —
        see faqEntities — so the two can never disagree.
      */}
      {faq && <JsonLd data={faq} />}

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
          {blocks.map((block, i) => (
            <Block key={i} block={block} />
          ))}
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

function Block({ block }: { block: ArticleBlock }) {
  switch (block.type) {
    case "heading":
      return <h2 className="mt-4 text-xl font-bold text-balance">{renderInline(block.text)}</h2>;
    case "subheading":
      return <h3 className="mt-2 text-lg font-bold text-balance">{renderInline(block.text)}</h3>;
    case "list":
      return (
        <ul className="flex list-disc flex-col gap-1.5 ps-5">
          {block.items.map((item, j) => (
            <li key={j}>{renderInline(item)}</li>
          ))}
        </ul>
      );
    case "quote":
      // border-s, not border-r: the logical property follows the writing
      // direction, so the rule sits on the reader's starting edge in Hebrew
      // and would sit on the other side in a left-to-right locale.
      return (
        <blockquote className="border-brand bg-muted/40 rounded-e-xl border-s-4 px-4 py-3 text-[15px] font-medium">
          {renderInline(block.text)}
        </blockquote>
      );
    case "table":
      return <Table head={block.head} rows={block.rows} />;
    case "faq":
      return (
        <section className="mt-4 flex flex-col gap-4">
          {block.items.map(({ q, a }, j) => (
            <div key={j}>
              <h3 className="font-bold">{renderInline(q)}</h3>
              <p className="text-foreground/90 mt-1">{renderInline(a)}</p>
            </div>
          ))}
        </section>
      );
    default:
      return <p className="text-foreground/90">{renderInline(block.text)}</p>;
  }
}

/**
 * A comparison table that stays a table on a phone.
 *
 * The scroll container is the whole point. These tables are four and five
 * columns of model, price, rating and capacity, and at 360px the choice is
 * between scrolling the table and scrolling the page — the second one is
 * what happens by default, and it breaks every other element on the page to
 * do it. `w-full` inside a `min-w-max` track lets a narrow table still fill
 * the column and a wide one overflow into its own scroller.
 */
function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="border-border overflow-x-auto rounded-xl border">
      <table className="w-full min-w-max border-collapse text-sm">
        {/* A table whose header row is entirely blank is a label column plus
            data columns — the guides use it for "row header on the start
            edge" layouts — and rendering an empty thead there is noise. */}
        {head.some((cell) => cell.trim() !== "") && (
          <thead className="bg-muted/60">
            <tr>
              {head.map((cell, i) => (
                <th key={i} className="border-border border-b px-3 py-2 text-start font-semibold">
                  {renderInline(cell)}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-border border-b last:border-b-0">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2 align-top">
                  {renderInline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// **bold** and [label](href), and nothing else — see the ArticleBlock comment.
//
// One pass over a single alternation rather than bold-then-links, because
// two sequential passes over a string cannot produce React elements: the
// first would have to hand the second a string, and by then the elements are
// gone. Links are internal for these guides but the check is on the href,
// not on the author remembering: anything off-site opens in a new tab with
// rel="noopener", which is a security property and not a preference.
const INLINE = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;

function renderInline(text: string) {
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index;
    if (at > last) out.push(text.slice(last, at));
    if (m[1] !== undefined) {
      out.push(<strong key={at}>{m[1]}</strong>);
    } else {
      const href = m[3];
      const external = /^https?:\/\//.test(href) && !href.startsWith(SITE_URL);
      out.push(
        <Link
          key={at}
          href={href}
          className="text-brand underline underline-offset-2"
          {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        >
          {m[2]}
        </Link>,
      );
    }
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
