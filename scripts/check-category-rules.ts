// The classifier held to product text taken from the live catalog, not
// invented. Every refrigeration case below is a real title or description
// read out of the database while the rules were being written, including
// the three overlaps whose ordering is the policy decision.
//
//   npm run check:categories
import { classifyProduct, CATEGORY_RULES } from "../src/lib/inventory/category-rules";
import { CATEGORY_TREE } from "../src/lib/category-tree";

let failed = 0;
const fail = (msg: string) => {
  console.log(`FAIL  ${msg}`);
  failed++;
};

// [department, title, description, expected leaf or null, why]
const CASES: [string, string, string, string | null, string][] = [
  // --- refrigeration: titles that name the type outright -----------------
  ["refrigeration", "מקרר GENERAL GE83BIX מקפיא עליון 635 ליטר No Frost", "", "fridge-top-freezer", "title states the type"],
  ["refrigeration", "מקרר האייר HRF5800BS 4 דלתות 504 ליטר No Frost", "", "fridge-4-door", "door count in the title"],
  ["refrigeration", "מקפיא עומד מילה Miele FN 28262 עם NoFrost, 8 מגירות", "", "freezers", "a freezer, with no fridge in the name"],
  ["refrigeration", "מקרר אינטגרלי באוקנכט Bauknecht KGITNIS18F1 נפח 250 ליטר", "", "fridge-integrated", "built-in"],
  ["refrigeration", "מקרר יין קנדי CWC200 EELW/N ל-81 בקבוקים", "", "wine-fridge", "wine"],
  ["refrigeration", "HOMIX HRF40B משרדי שחור", "", "mini-fridge", "office fridge"],

  // --- refrigeration: the title is a model code, the description names it -
  ["refrigeration", "סמסונג RT62K7044BS", "מקרר מקפיא עליון סמסונג RT62K7044BS נירוסטה", "fridge-top-freezer", "description opens with the full name"],
  ["refrigeration", "שטארק RD63BKI", "מקרר מקפיא תחתון הייסנס RD63BKI נירוסטה מושחרת", "fridge-bottom-freezer", "same, bottom freezer"],
  ["refrigeration", "סמסונג RS70F64KET", "מקרר דלת לצד דלת סמסונג RS70F64KET נירוסטה", "fridge-side-by-side", "side by side"],
  ["refrigeration", "Premier PR90GB", "מקרר משרדי לבן בנפח 99 ליטר פרמייר", "mini-fridge", "office fridge from the description"],

  // --- refrigeration: the three overlaps the ordering decides ------------
  ["refrigeration", "סמסונג RF82DG9621SR", "מקרר מקפיא תחתון 4 דלתות סמסונג RF82DG9621SR פלטיניום", "fridge-4-door", "4 doors beats bottom freezer"],
  ["refrigeration", "GENERAL GE71BINFR", "מקרר אינטגרלי (בנוי) GENERAL GE71BINFR משולב מקפיא תחתון", "fridge-integrated", "built-in beats freezer position"],
  ["refrigeration", "אימפריאל JCF58 IX", "מקרר יין אינטגרלי מבית LE IMPERIAL עם מדפי עץ ל-20 בקבוקים", "wine-fridge", "wine beats built-in"],
  ["refrigeration", "מקרר יין אינטגרלי Le Imperial JCF201 נפח", "", "wine-fridge", "same call from the title, so the line stays together"],
  ["refrigeration", "מקרר 5 דלתות סמסונג RF90 נירוסטה", "", "fridge-4-door", "5 doors shares the 4-door leaf — see category-tree.ts"],
  ["refrigeration", "האייר HRF800", "מקרר חמש דלתות האייר HRF800 שחור", "fridge-4-door", "same, spelled out in the description"],
  ["refrigeration", "מקרר 2 דלתות מקפיא עליון LG GR-B", "", "fridge-top-freezer", "a door count the leaf does not cover falls through to the freezer position"],

  // --- refrigeration: must stay put --------------------------------------
  ["refrigeration", "TCL P687TMN", "", null, "a bare model code names nothing"],
  ["refrigeration", "בורמן BU91", "", null, "same"],
  ["refrigeration", "ברטזוני SP30CX", "", null, "same"],

  // --- other departments, from the leaf names and ordinary usage ---------
  ["laundry", "מכונת כביסה משולבת מייבש LG F4V5", "", "washer-dryer-combo", "combo beats washer"],
  ["laundry", "מייבש כביסה פתח חזית 9 ק\"ג ELECTROLUX EDH902R9WC", "", "dryers", "dryer"],
  ["laundry", "מכונת כביסה סמסונג WW90", "", "washing-machines", "washer"],
  ["dishwashers", "מדיח כלים אינטגרלי מלא בוש SMV", "", "dishwasher-fully-integrated", "fully integrated beats plain"],
  ["dishwashers", "מדיח כלים חצי אינטגרלי בוש", "", "dishwasher-semi-integrated", "semi beats plain"],
  ["dishwashers", "מדיח כלים רחב 60 ס\"מ", "", "dishwasher-standard", "plain"],
  ["ovens-cooktops", "קולט אדים תלוי 90 ס\"מ", "", "range-hoods", "hood"],
  ["ovens-cooktops", "כיריים אינדוקציה AEG 60 ס\"מ", "", "induction-cooktops", "induction"],
  ["ovens-cooktops", "כיריים גז 5 להבות", "", "gas-cooktops", "gas needs the cooktop word too"],
  ["air-conditioning", "SOMO קלאסיק 140 נייד", "", "portable-ac", "portable, today filed under split"],
  ["air-conditioning", "מזגן מיני מרכזי אלקטרה", "", "central-ac", "central"],
  ["air-conditioning", "SOMO עילי אינוורטר", "", "split-ac", "split"],
  ["heating-ventilation", "מאוורר תקרה 52 אינץ'", "", "ceiling-fans", "ceiling fan beats fan"],
  ["heating-ventilation", "מפזר חום קרמי", "", "heat-fans", "heat fan beats fan"],
  ["heating-ventilation", "מאוורר עמוד 16 אינץ'", "", "fans", "plain fan"],
  ["personal-care", "מייבש שיער 2300W רמינגטון", "", "hair-dryers", "hair dryer, not a laundry dryer"],
  ["personal-care", "מכונת תספורת פיליפס", "", "hair-clippers", "clippers"],
  ["small-kitchen-appliances", "טוסטר אובן 45 ליטר", "", "toaster-ovens", "toaster oven beats pop-up"],
  ["small-kitchen-appliances", "מטחנת קפה תעשייתית", "", "coffee-grinders", "coffee grinder beats meat grinder"],
  ["small-kitchen-appliances", "מיקרוגל בנוי משולב גריל ELECTROLUX", "", "microwaves", "microwave"],
  ["audio-home-theater", "מקרן קול LG S90TY", "", "soundbars", "soundbar, and never a projector"],
  ["audio-home-theater", "PolkAudio זוג סראונד למקרן קול Magnifi", "", "soundbars", "same"],
  ["tv-multimedia", "מקרן Vivitek DH2661Z", "", "projectors", "projector"],
  ["tv-multimedia", "טלוויזיה חכמה QLED 75 אינץ'", "", "tvs", "tv"],
];

for (const [dept, title, desc, expected, why] of CASES) {
  const got = classifyProduct(dept, title, desc);
  if (got.slug !== expected) {
    fail(`${why}\n        ${dept} · ${title.slice(0, 46)}\n        got ${got.slug ?? "null"}, want ${expected ?? "null"}`);
  }
}

// Every slug a rule can produce must be a real leaf of that department, or
// the runner would silently skip it.
const leavesByDept = new Map(CATEGORY_TREE.map((d) => [d.slug, new Set(d.children.map((c) => c.slug))]));
for (const [dept, rules] of Object.entries(CATEGORY_RULES)) {
  const leaves = leavesByDept.get(dept);
  if (!leaves) {
    fail(`rules exist for "${dept}", which is not a department in category-tree.ts`);
    continue;
  }
  for (const rule of rules) {
    if (!leaves.has(rule.slug)) fail(`rule points at "${rule.slug}", which is not a leaf of ${dept}`);
  }
}

// Which departments still have no rules at all — not a failure, a to-do.
const missing = CATEGORY_TREE.filter((d) => !CATEGORY_RULES[d.slug]).map((d) => d.slug);

console.log(`${CASES.length - failed}/${CASES.length} cases passed`);
console.log(`departments with rules: ${Object.keys(CATEGORY_RULES).length}/${CATEGORY_TREE.length}` +
  (missing.length ? `  (no rules yet: ${missing.join(", ")})` : ""));
process.exitCode = failed > 0 ? 1 : 0;
