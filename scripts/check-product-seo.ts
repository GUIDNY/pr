// Run: npx tsx scripts/check-product-seo.ts
import { productSearchSnippet, fitSearchTitle, SEARCH_TITLE_MAX, modelCodes } from "../src/lib/seo/product-seo";
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

// fitSearchTitle: the whole title is meant to fit in 60 with " | Buy Today", so 48 here.
const long1 = "אלקטרולוקס Electrolux EOH6231X תנור בנוי 71 ליטר דיגיטלי";
eq("short title untouched", fitSearchTitle("טלוויזיה Samsung 65S90H", "Samsung"), "טלוויזיה Samsung 65S90H");
eq("48 exactly is untouched", fitSearchTitle("א".repeat(48), "x"), "א".repeat(48));
eq("cut at a word, ends on the measurement", fitSearchTitle(long1, "Electrolux"), "אלקטרולוקס Electrolux EOH6231X תנור בנוי 71 ליטר");
eq("no ellipsis, no cut word", fitSearchTitle("Sol F3GBCE633 כיריים דומינו גז 29 ס\"מ זכוכית שחורה", "SOL"), "Sol F3GBCE633 כיריים דומינו גז 29 ס\"מ");
eq("never ends on a bare number", fitSearchTitle("מזגן תדיראן ALPHA PRO INVERTER 370A WIFI 26,551 BTU", "תדיראן"), "מזגן תדיראן ALPHA PRO INVERTER 370A WIFI");
eq("not inside an English phrase", fitSearchTitle("האייר Haier HOQ-F5AA תנור 72 ליטר Air Fry Full Touch", "Haier"), "האייר Haier HOQ-F5AA תנור 72 ליטר");
eq("template suffix not doubled", fitSearchTitle("כיריים גז סאוטר Sauter SHG7506B 75 ס\"מ שחור | Buy Today", "Sauter"), "כיריים גז סאוטר Sauter SHG7506B 75 ס\"מ שחור");
eq("brand repeated is dropped", fitSearchTitle("Sauter Sauter WK994W קומקום זכוכית 1.7 ליטר 2400W לבן שחור", "Sauter"), "Sauter WK994W קומקום זכוכית 1.7 ליטר 2400W");
// Brand and model are never lost: when they alone do not fit, the title is returned as it was.
const wide = "מוצר-ארוך-במיוחד-בלי-רווחים-בכלל ABCDEFGH12345678 אביזרים נוספים רבים";
eq("model kept even when it cannot fit", fitSearchTitle(wide, "Acme", 20), wide);
// Over a whole set: every model code of the title survives, nothing exceeds the budget unless unavoidable.
for (const t of [long1, "Sol F3GBCE633 כיריים דומינו גז 29 ס\"מ זכוכית שחורה", "מקפיא אינטגרלי קנדי Candy CMT5518EVWF 220 ליטר No Frost", "ASKO RFC526RNBB1 מקרר מקפיא תחתון 409 ליטר No Frost נירוסטה מושחרת"]) {
  const out = fitSearchTitle(t, null);
  for (const c of modelCodes(t)) eq("model survives: " + c, modelCodes(out).includes(c), true);
  eq("within budget: " + t.slice(0, 20), out.length <= SEARCH_TITLE_MAX, true);
}
// productSearchSnippet applies it to the plain and the search title, never to the description.
eq("snippet plain", productSearchSnippet({ title: long1, seoTitle: null, seoDesc: null, shortDescription: "קצר", description: null, brand: { name: "Electrolux" } }).title, "אלקטרולוקס Electrolux EOH6231X תנור בנוי 71 ליטר");
eq("snippet seo", productSearchSnippet({ title: "Electrolux EOH6231X", seoTitle: long1, seoDesc: "seo", shortDescription: null, description: null, brand: { name: "Electrolux" } }).title, "אלקטרולוקס Electrolux EOH6231X תנור בנוי 71 ליטר");
if (fail) process.exit(1);
console.log("check-product-seo: all passed");
