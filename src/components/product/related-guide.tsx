import Link from "next/link";
import { BookOpen, ArrowLeft } from "lucide-react";

/**
 * "מדריך קשור" on a product page: the buying guide of the product's own
 * category, when it has one (getArticleByCategorySlug, which walks up the
 * tree). Product pages linked to no guide before 24 November, so a guide's
 * readers went to the products but the products sent nobody back.
 */
export function RelatedGuide({ guide }: { guide: { slug: string; title: string } | null }) {
  if (!guide) return null;
  return (
    <Link
      href={`/articles/${guide.slug}`}
      className="border-border hover:border-brand/40 group mt-8 flex items-center gap-3 rounded-2xl border p-4 transition-all hover:shadow-md"
    >
      <span className="bg-brand/10 text-brand flex size-10 shrink-0 items-center justify-center rounded-xl">
        <BookOpen className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-brand block text-xs font-semibold">מדריך קשור</span>
        <span className="group-hover:text-brand block text-sm font-bold leading-snug transition-colors">{guide.title}</span>
      </span>
      <ArrowLeft className="size-4 shrink-0 rtl:rotate-180" />
    </Link>
  );
}
