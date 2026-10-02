import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCmsPage } from "@/lib/queries/content";
import { parseArticleContent, faqEntities } from "@/lib/queries/articles";
import { ContentBlocks } from "@/components/content/content-blocks";
import { JsonLd } from "@/components/seo/json-ld";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = await getCmsPage(slug);
  return { title: page?.title, alternates: { canonical: `/page/${slug}` } };
}

export default async function CmsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getCmsPage(slug);
  if (!page) notFound();

  /* Two shapes share this column, and which one a row is decides itself.
     Most of these pages are plain text — the terms, the privacy policy, the
     returns policy — and they render as they always have. A body that parses
     as the article block array gets the structured renderer instead:
     headings a reader can scan, lists that look like lists, tables that
     survive a phone.

     Sniffing the content rather than adding a `format` column keeps every
     existing row valid with nothing to migrate, and the legal pages keep
     their line breaks. parseArticleContent already returns [] for anything
     that is not a JSON array, so prose can never fall down this branch —
     and a body that is valid JSON but not blocks (a bare number, an object)
     lands there too. */
  const blocks = parseArticleContent(page.body);
  const faq = blocks.length > 0 ? faqEntities(blocks) : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      {/* Questions a page actually renders, offered to Google as a FAQPage.
          Derived from the blocks rather than stored twice, for the reason
          given in faqEntities: a hand-kept copy disagrees with the page the
          first time somebody edits one of them. */}
      {faq && <JsonLd data={faq} />}
      <h1 className="mb-6 text-3xl font-bold">{page.title}</h1>
      {blocks.length > 0 ? (
        <ContentBlocks blocks={blocks} />
      ) : (
        <div className="text-muted-foreground leading-relaxed whitespace-pre-line">{page.body}</div>
      )}
    </div>
  );
}
