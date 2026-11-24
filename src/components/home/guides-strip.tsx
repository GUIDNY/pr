import Link from "next/link";
import { BookOpen } from "lucide-react";

/**
 * "מדריכי קנייה של אלפרד": a few of the buying guides on the front page.
 * Until 24 November the homepage linked to no guide at all, so the 29
 * articles were reached only from /articles and from a category's own card.
 * Plain links in the HTML, in the order the newest come first; nothing here
 * is invented, every title and excerpt is the article's own.
 */
export function GuidesStrip({ guides }: { guides: { slug: string; title: string; excerpt: string | null }[] }) {
  if (guides.length === 0) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 py-8" aria-labelledby="home-guides-heading">
      <div className="mb-4 flex items-end justify-between gap-3">
        <h2 id="home-guides-heading" className="text-xl font-bold">
          מדריכי קנייה של אלפרד
        </h2>
        <Link href="/articles" className="text-brand text-sm font-medium hover:underline">
          לכל המדריכים
        </Link>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {guides.map((g) => (
          <li key={g.slug}>
            <Link
              href={`/articles/${g.slug}`}
              className="border-border hover:border-brand/40 group flex h-full gap-3 rounded-2xl border p-4 transition-all hover:shadow-md"
            >
              <span className="bg-brand/10 text-brand flex size-10 shrink-0 items-center justify-center rounded-xl">
                <BookOpen className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="group-hover:text-brand block text-sm font-bold leading-snug transition-colors">{g.title}</span>
                {g.excerpt && (
                  <span className="text-muted-foreground mt-1 line-clamp-2 block text-xs leading-relaxed">{g.excerpt}</span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
