import { parseProductContent } from "@/lib/product-content";
import { ProductProse, ProductSections } from "@/components/product/product-overview";

// The buying guide on a category page.
//
// Every one of the 53 categories that has a description stores it as HTML —
// `<h2>`, `<p>`, `<h3>`, `<strong>` — and the page printed it into a plain
// text node, so each of those pages showed its own markup: "<h2>מכונות כביסה
// - מדריך בחירה</h2> <p>..." across the top of the screen. The product page
// had exactly this bug and already has the cure: normalizeDescription turns
// the HTML into the parser's own text form, and nothing here ever becomes
// markup the browser executes — no dangerouslySetInnerHTML, one rendering
// path, and text that arrives as markdown reads the same way.
//
// The guides run 900 to 2,700 characters, which is a screenful before a
// shopper reaches a single product. So the opening paragraph stays visible
// and the rest sits behind a native <details> — no client JavaScript, found
// by the browser's own find-in-page, and indexable, since the text is in the
// HTML either way.
//
// The first heading is dropped on purpose: it restates the page's own <h1>
// ("מכונות כביסה" / "מכונות כביסה - מדריך בחירה"), and two titles saying the
// same thing is how a page starts looking automated.
export function CategoryIntro({ description }: { description: string | null }) {
  if (!description?.trim()) return null;
  const { summary, prose, sections } = parseProductContent(description);

  // A guide written with headings parses entirely into sections; one written
  // as flat paragraphs lands in summary/prose. Both shapes are in the
  // catalog, so both are handled rather than assumed.
  const intro = sections.length > 0 ? sections[0].prose : [summary, ...prose].filter(Boolean);
  const rest = sections.slice(1);
  if (intro.length === 0 && rest.length === 0) return null;

  return (
    <div className="mt-3 max-w-[68ch]">
      <ProductProse paragraphs={intro.slice(0, 1)} />
      {(rest.length > 0 || intro.length > 1) && (
        <details className="group mt-2">
          <summary className="text-brand hover:text-brand/80 inline-flex cursor-pointer list-none items-center gap-1 text-sm font-medium marker:content-none">
            <span className="group-open:hidden">קרא עוד על הקטגוריה</span>
            <span className="hidden group-open:inline">הצג פחות</span>
            <span aria-hidden className="transition-transform group-open:rotate-180">⌄</span>
          </summary>
          <div className="mt-4 flex flex-col gap-7">
            <ProductProse paragraphs={intro.slice(1)} />
            <ProductSections sections={rest} />
          </div>
        </details>
      )}
    </div>
  );
}
