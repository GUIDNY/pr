import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCmsPage } from "@/lib/queries/content";
import { parseArticleContent } from "@/lib/queries/articles";
import { ContentBlocks } from "@/components/content/content-blocks";

/**
 * The terms, at the address the other two policies already use.
 *
 * /returns and /privacy are pages in this folder; the terms existed only as
 * a CMS row at /page/terms, so the footer and the checkout linked to a
 * differently-shaped URL for one of the three. Same policies, same site,
 * two URL schemes — and /terms itself answered 404.
 *
 * The content stays in the CMS, which is where it was written and where it
 * can be corrected without a deploy. Only the address moves; /page/terms is
 * 301'd here in next.config.ts.
 */
export const metadata: Metadata = {
  title: "תקנון האתר",
  description:
    "תקנון השימוש והמכר של Buy Today — תנאי ההזמנה, המחירים, האספקה, האחריות וסמכות השיפוט.",
  alternates: { canonical: "/terms" },
};

export default async function TermsPage() {
  const page = await getCmsPage("terms");
  if (!page) notFound();
  const blocks = parseArticleContent(page.body);

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-6 text-3xl font-bold">{page.title}</h1>
      {blocks.length > 0 ? (
        <ContentBlocks blocks={blocks} />
      ) : (
        <div className="text-muted-foreground leading-relaxed whitespace-pre-line">{page.body}</div>
      )}
    </div>
  );
}
