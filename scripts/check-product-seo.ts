// Run: npx tsx scripts/check-product-seo.ts
import { productSearchSnippet } from "../src/lib/seo/product-seo";
let fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  if (got !== want) { fail++; console.error(`FAIL ${name}: ${JSON.stringify(got)} !== ${JSON.stringify(want)}`); }
}
const base = { title: "טלוויזיה Samsung 65S90H 65 אינץ' OLED", model: "QE65S90HAEXXH", seoTitle: null as string | null, seoDesc: null as string | null, shortDescription: "קצר", description: "<p>ארוך</p>" };
// No seoTitle → the plain title and short description.
eq("no seo", productSearchSnippet(base).title, base.title);
eq("no seo desc", productSearchSnippet(base).description, "קצר");
// seoTitle naming the model → used, with its description.
const ok = { ...base, model: "65S90H", seoTitle: "Samsung 65S90H טלוויזיית OLED 65 אינץ'", seoDesc: "תיאור" };
eq("seo used", productSearchSnippet(ok).title, ok.seoTitle);
eq("seo desc used", productSearchSnippet(ok).description, "תיאור");
// Model written with spaces or dots on one side only still matches.
eq("squash", productSearchSnippet({ ...base, model: "KWL91.224.SI", seoTitle: "Kenwood KWL91224SI מיקסר" }).title, "Kenwood KWL91224SI מיקסר");
// seoTitle missing the model → stale, fall back entirely.
const stale = { ...base, model: "LG77C6", seoTitle: "Samsung 65U8000H", seoDesc: "Samsung" };
eq("stale title", productSearchSnippet(stale).title, base.title);
eq("stale desc", productSearchSnippet(stale).description, "קצר");
// No model at all → seoTitle trusted.
eq("no model", productSearchSnippet({ ...base, model: null, seoTitle: "כותרת" }).title, "כותרת");
// Empty seoDesc → short description.
eq("empty seoDesc", productSearchSnippet({ ...ok, seoDesc: "  " }).description, "קצר");
if (fail) process.exit(1);
console.log("check-product-seo: all passed");
