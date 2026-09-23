import Link from "next/link";
import type { ArticleBlock } from "@/lib/queries/articles";
import { SITE_URL } from "@/lib/site-url";

/**
 * The structured-content renderer, lifted out of the article page.
 *
 * It was written for the buying guides and lived inside
 * app/(shop)/articles/[slug]/page.tsx, which was fine while articles were
 * the only structured content on the site. The CMS pages are the second
 * caller: /page/about was a single paragraph rendered with
 * `whitespace-pre-line`, and a page long enough to be worth reading is
 * unreadable that way — no headings to scan, no list that looks like a
 * list, one flat run of muted grey.
 *
 * Copying it would have been the quicker move and the wrong one: two
 * renderers for one block format drift, and the FAQ markup here is read by
 * Google as a FAQPage entity, so a divergence is not only cosmetic.
 *
 * The blocks themselves are still typed and documented in
 * lib/queries/articles.ts, which is where the format is decided.
 */
export function ContentBlocks({ blocks }: { blocks: ArticleBlock[] }) {
  return (
    <div className="flex flex-col gap-4 text-base leading-relaxed">
      {blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
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
