/**
 * An article's structured data, as one graph.
 *
 * What an engine has to be able to read off the page without guessing:
 * which entity is the page's main entity, that the FAQ belongs to this
 * page, and that the author and publisher are the Organization the
 * homepage declares. And that an article without a שאלות נפוצות section
 * carries no FAQPage at all — an empty one is the signature of a parser
 * that did not filter. No database.
 *
 *   npm run check:articles
 */
import { articleGraphSchema, organizationSchema, webSiteSchema, ORGANIZATION_ID, WEBSITE_ID } from "../src/lib/schema";
import { faqItems } from "../src/lib/queries/articles";
import { SITE_URL } from "../src/lib/site-url";

let failures = 0;
function is(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${ok ? "" : `\n          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`}`);
}

type Node = Record<string, unknown> & { "@type": string; "@id": string };
const nodes = (g: { "@graph": Record<string, unknown>[] }) => g["@graph"] as Node[];
const byType = (g: { "@graph": Record<string, unknown>[] }, type: string) => nodes(g).find((n) => n["@type"] === type);

console.log("\nthe entities everything points at");
is("Organization carries the shared @id", (organizationSchema() as Record<string, unknown>)["@id"], ORGANIZATION_ID);
is("WebSite carries its @id and names its publisher", [(webSiteSchema() as Record<string, unknown>)["@id"], (webSiteSchema() as Record<string, unknown>).publisher], [WEBSITE_ID, { "@id": ORGANIZATION_ID }]);
is("@ids live on this site", ORGANIZATION_ID.startsWith(SITE_URL) && WEBSITE_ID.startsWith(SITE_URL), true);

const base = {
  path: "/articles/range-hood-buying-guide",
  headline: "איך בוחרים קולט אדים? נוסחת ספיקת האוויר למטבח",
  description: "התשובה הקצרה: …",
  imageUrl: "https://buytoday.co.il/images/x.jpg",
  datePublished: "2026-09-09T00:00:00.000Z",
  dateModified: "2026-10-01T00:00:00.000Z",
};

console.log("\nan article with a FAQ");
const withFaq = articleGraphSchema({ ...base, faq: [{ q: "כמה ספיקה צריך?", a: "נפח המטבח כפול 10." }, { q: "ב?", a: "ת." }] });
const url = `${SITE_URL}${base.path}`;
is("three nodes: WebPage, BlogPosting, FAQPage", nodes(withFaq).map((n) => n["@type"]), ["WebPage", "BlogPosting", "FAQPage"]);
is("page's main entity is the posting", (byType(withFaq, "WebPage") as Node).mainEntity, { "@id": `${url}#article` });
is("posting points back at the page", (byType(withFaq, "BlogPosting") as Node).mainEntityOfPage, { "@id": `${url}#webpage` });
is("posting's author and publisher are the Organization", [(byType(withFaq, "BlogPosting") as Node).author, (byType(withFaq, "BlogPosting") as Node).publisher], [{ "@id": ORGANIZATION_ID }, { "@id": ORGANIZATION_ID }]);
is("page is part of the WebSite", (byType(withFaq, "WebPage") as Node).isPartOf, { "@id": WEBSITE_ID });
is("FAQ is part of the page", (byType(withFaq, "FAQPage") as Node).isPartOf, { "@id": `${url}#webpage` });
is("FAQ carries both questions", ((byType(withFaq, "FAQPage") as Node).mainEntity as unknown[]).length, 2);
is("image travels", (byType(withFaq, "BlogPosting") as Node).image, [base.imageUrl]);

console.log("\nan article without one");
const noFaq = articleGraphSchema({ ...base, imageUrl: null, faq: [] });
is("no FAQPage node, not an empty one", nodes(noFaq).map((n) => n["@type"]), ["WebPage", "BlogPosting"]);
is("no image key when there is no image", "image" in (byType(noFaq, "BlogPosting") as Node), false);

console.log("\nthe FAQ items come from the rendered blocks");
is(
  "faq blocks, stripped of markdown, empty ones dropped",
  faqItems([
    { type: "paragraph", text: "x" },
    { type: "faq", items: [{ q: "**מה** זה [קולט](/category/range-hoods)?", a: "מכשיר." }, { q: "", a: "ריק" }, { q: "ב?", a: "  " }] },
  ] as Parameters<typeof faqItems>[0]),
  [{ q: "מה זה קולט?", a: "מכשיר." }],
);
is("headline is capped at 110 characters", (articleGraphSchema({ ...base, headline: "א".repeat(200), faq: [] })["@graph"][1] as Node).headline, "א".repeat(110));

console.log(failures === 0 ? "\nall good" : `\n${failures} failing`);
process.exit(failures === 0 ? 0 : 1);
