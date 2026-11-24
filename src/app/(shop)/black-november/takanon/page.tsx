import Link from "next/link";
import type { Metadata } from "next";
import { ContentBlocks } from "@/components/content/content-blocks";
import { BLACK_NOVEMBER_TERMS_BLOCKS, TERMS_UPDATED_AT } from "@/lib/content/terms";

/**
 * The campaign's terms on a page of their own, for the "תקנון המבצע" link in
 * the strip, on the campaign page and at the price. The text is the section
 * of the site's terms (lib/content/terms.ts), not a copy of it.
 */
export const metadata: Metadata = {
  title: "תקנון מבצע בלאק נובמבר 2026",
  description: "תקנון מבצע בלאק נובמבר 2026 של Buy Today: תוקף המבצע, מלאי, ביטול עסקה ומשלוחים.",
  alternates: { canonical: "/black-november/takanon" },
};

export default function BlackNovemberTermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-2 text-3xl font-bold">תקנון מבצע בלאק נובמבר 2026</h1>
      <p className="text-muted-foreground mb-6 text-sm">עודכן לאחרונה: {TERMS_UPDATED_AT}</p>
      <ContentBlocks blocks={BLACK_NOVEMBER_TERMS_BLOCKS} />
      <p className="mt-8 text-sm">
        <Link href="/black-november" className="text-brand font-medium hover:underline">
          לדף המבצע
        </Link>
        {" · "}
        <Link href="/terms" className="text-brand font-medium hover:underline">
          תקנון האתר המלא
        </Link>
      </p>
    </div>
  );
}
