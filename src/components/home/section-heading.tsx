import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * One heading, used by every band on the homepage.
 *
 * Before this, each section wrote its own: "קטגוריות מובילות" at text-xl,
 * "המותגים המובילים אצלנו" at text-lg and centred, product rails at text-xl
 * with a subtitle, the trust band at text-xl. Four sizes and two alignments
 * for the same job, and the result is a page with no rhythm — every band
 * announces itself at roughly the volume of every other, so nothing leads
 * and the eye has nowhere to rest between them.
 *
 * The eyebrow is what makes the hierarchy work. It is small, brand-coloured
 * and lettered wide, so the heading underneath can be large without the two
 * competing; and it carries a word the heading does not, which is the only
 * reason it earns the line. A section with nothing to add there passes no
 * eyebrow and loses nothing.
 */
export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  href,
  linkLabel = "לכל המוצרים",
  id,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  href?: string;
  linkLabel?: string;
  id?: string;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 sm:mb-8">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-brand mb-1.5 text-xs font-bold tracking-[0.12em]">{eyebrow}</p>
        )}
        <h2 id={id} className="text-2xl font-black tracking-tight text-balance sm:text-3xl">
          {title}
        </h2>
        {subtitle && (
          <p className="text-muted-foreground mt-2 max-w-prose text-sm leading-relaxed">{subtitle}</p>
        )}
      </div>
      {href && (
        <Link
          href={href}
          className="text-brand hover:border-brand border-border shrink-0 rounded-full border px-4 py-2 text-sm font-bold transition-colors"
        >
          {linkLabel}
          <ArrowLeft className="mr-1.5 inline size-3.5" />
        </Link>
      )}
    </div>
  );
}
