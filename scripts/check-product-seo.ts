// Run: npx tsx scripts/check-product-seo.ts
import { productSearchSnippet } from "../src/lib/seo/product-seo";
let fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  if (got !== want) { fail++; console.error(`FAIL ${name}: ${JSON.stringify(got)} !== ${JSON.stringify(want)}`); }
}
const p = (title: string, seoTitle: string | null, seoDesc: string | null = "seo") =>
  productSearchSnippet({ title, seoTitle, seoDesc, shortDescription: "קצר", description: "<p>ארוך</p>" });

// No seoTitle → plain title and short description.
eq("no seo", p("טלוויזיה Samsung 65S90H", null).title, "טלוויזיה Samsung 65S90H");
eq("no seo desc", p("טלוויזיה Samsung 65S90H", null).description, "קצר");
// The founding case: title code, search title leads with it.
eq("model first", p("טלוויזיה Samsung 65S90H 65 אינץ' OLED", "Samsung 65S90H טלוויזיית OLED 65 אינץ'").title, "Samsung 65S90H טלוויזיית OLED 65 אינץ'");
eq("desc travels", p("טלוויזיה Samsung 65S90H", "Samsung 65S90H").description, "seo");
// Dots and spaces don't matter.
eq("dots", p("מיקסר Kenwood KWL91.224.SI", "Kenwood KWL91224SI מיקסר").title, "Kenwood KWL91224SI מיקסר");
// Shortened code (colour suffix dropped) still counts.
eq("prefix", p("קומקום SMEG KLF03RDEU 1.7 ליטר", "קומקום SMEG KLF03 1.7 ליטר").title, "קומקום SMEG KLF03 1.7 ליטר");
// Units are not model codes: 2400W in both must not make a stale title pass.
eq("unit", p("קומקום SMEG KLF03RDEU 2400W", "קומקום Bosch TWK3A011 2400W").title, "קומקום SMEG KLF03RDEU 2400W");
// Stale: search title names another product → plain title and description.
eq("stale", p("טלוויזיה LG OLED77C6 77 אינץ'", "Samsung 65U8000H", "Samsung").title, "טלוויזיה LG OLED77C6 77 אינץ'");
eq("stale desc", p("טלוויזיה LG OLED77C6 77 אינץ'", "Samsung 65U8000H", "Samsung").description, "קצר");
// Title with no code at all → search title trusted.
eq("no code", p("סט סכו\"ם 24 חלקים שחור", "סט סכו\"ם לשישה סועדים").title, "סט סכו\"ם לשישה סועדים");
// Blank seoDesc → short description.
eq("blank desc", p("Samsung 65S90H", "Samsung 65S90H", "  ").description, "קצר");
if (fail) process.exit(1);
console.log("check-product-seo: all passed");
