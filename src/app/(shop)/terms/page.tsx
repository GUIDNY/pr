import type { Metadata } from "next";
import { ContentBlocks } from "@/components/content/content-blocks";
import { TERMS_BLOCKS, TERMS_TITLE, TERMS_UPDATED_AT } from "@/lib/content/terms";

/**
 * The terms, at the address the other two policies already use.
 *
 * /returns and /privacy are pages in this folder; the terms existed only as
 * a CMS row at /page/terms, so the footer and the checkout linked to a
 * differently-shaped URL for one of the three. Same policies, same site,
 * two URL schemes — and /terms itself answered 404. /page/terms is 301'd
 * here in next.config.ts.
 *
 * The content moved out of the CMS and into lib/content/terms.ts; the
 * reasoning is written there. In short: this is the one page where a silent
 * edit is a problem rather than a convenience.
 */
export const metadata: Metadata = {
  title: TERMS_TITLE,
  description:
    "תקנון השימוש והמכר של Buy Today — הזמנות, מחירים, תשלום, משלוחים ואיסוף, ביטול עסקה והחזרים, אחריות, פינוי מוצר ישן וסמכות שיפוט.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-2 text-3xl font-bold">{TERMS_TITLE}</h1>
      {/* Above the text rather than buried at the end: a reader checking
          whether a policy still applies is looking for this date first. */}
      <p className="text-muted-foreground mb-6 text-sm">עודכן לאחרונה: {TERMS_UPDATED_AT}</p>
      <ContentBlocks blocks={TERMS_BLOCKS} />
    </div>
  );
}
