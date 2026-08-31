// Both import guards, held to cases taken from the catalog rather than
// invented. The MUST_ALLOW half is the important half: a guard that also
// rejects real photos and real product names does more damage than the
// thing it was added to prevent.
//
//   npm run check:guards
import { normalizeDescription } from "../src/lib/product-content";
import {
  looksLikeEnergyLabelUrl,
  looksLikeMarketingTitle,
  hasEnergyLabelShape,
  looksLikeStockPhrase,
} from "../src/lib/inventory/import-guards";

const LABEL_URLS = [
  "https://www.electra.co.il/media/energy-label-fridge.png",
  "https://shop.example.co.il/img/energylabel_123.jpg",
  "https://a.example.com/p/energy_class_a.jpg",
  "https://site.co.il/uploads/תווית-אנרגיה-1.jpg",
  "https://cdn.example.com/files/EPREL-884422.png",
  "https://eprel.ec.europa.eu/labels/12345.png",
  // %-encoded Hebrew, which is how these actually arrive from a scraper.
  "https://site.co.il/uploads/%D7%AA%D7%95%D7%95%D7%99%D7%AA-%D7%90%D7%A0%D7%A8%D7%92%D7%99%D7%94.jpg",
];

const PRODUCT_URLS = [
  "https://prec.co.il/img/1234.jpg",
  "https://images.samsung.com/is/image/samsung/rt53-front.jpg",
  // "energy" inside a longer word is not the word: an Energy Star badge or
  // an EnergySave model line must not be mistaken for an EU label.
  "https://images.samsung.com/is/image/samsung/energystar-badge.jpg",
  "https://www.lg.com/content/dam/lg-energysave-fridge.jpg",
  // A directory called labels is not a claim about the file in it.
  "https://cdn.example.com/labels/product-front.jpg",
  // The host contains "label"; the image does not say it is one.
  "https://labelstore.example.com/img/dryer.jpg",
  "https://media3.bosch-home.com/Product_Shots/900x/17858242.png",
  // A malformed %-escape must not throw, and must not reject the image.
  "https://site.co.il/img/100%-cotton.jpg",
];

const MARKETING_TITLES = [
  "חיישנים+קונדנסור+אפשרות ניקוז",
  "מנוע אינוורטר+תוף נירוסטה+נעילת ילדים",
];

// Real titles from the live catalog, ugly ones included — the guard has to
// stay off all of them.
const REAL_TITLES = [
  "מקרר מקפיא תחתון 344 ליטר ‎ LGאל ג'י דגם GR-344SD",
  "אלקטרולוקס EW6T4723AM",
  "מסכי טלוויזיה ELECTROLUX RB10548",
  "חדש ECK5401K",
  "מולטיזון91 סמ ניתן לחבר חד פאזי או תלת מגיע ללא כבל",
  "PolkAudio זוג סראונד למקרן קול Magnifi MaxSR AX",
  "שטארק HRF 7100FB",
  "מקרר משרדי הומקס",
  "טוסטר אובן",
  "כיריים גז ומנדף",
];

const SHAPES: [number, number, boolean, string][] = [
  // A real 420x1250 product shot matches the shape rule too (ratio 2.98,
  // width under 500). That is the rule's known false positive and the
  // reason the shape test produces a review list and never a delete: an EU
  // label's artwork is close to 1:2, and a photo this far past that is
  // almost certainly a tall appliance, not a label.
  [420, 1250, true, "tall fridge photo — the rule's documented false positive"],
  [297, 594, true, "EU label artwork, 1:2"],
  [180, 360, true, "small label thumbnail"],
  [1000, 1000, false, "square product shot"],
  [800, 1600, false, "tall but 800px wide — a real photo, not a label"],
  [0, 0, false, "unknown dimensions must never flag"],
];

let failed = 0;
const fail = (msg: string) => {
  console.log(`FAIL  ${msg}`);
  failed++;
};

for (const url of LABEL_URLS) if (!looksLikeEnergyLabelUrl(url)) fail(`should read as a label: ${url}`);
for (const url of PRODUCT_URLS) if (looksLikeEnergyLabelUrl(url)) fail(`should read as a photo: ${url}`);
for (const t of MARKETING_TITLES) if (!looksLikeMarketingTitle(t)) fail(`should read as copy: ${t}`);
for (const t of REAL_TITLES) if (looksLikeMarketingTitle(t)) fail(`should read as a title: ${t}`);
for (const [w, h, expected, why] of SHAPES) {
  if (hasEnergyLabelShape(w, h) !== expected) fail(`${w}x${h} — ${why}`);
}


// ---------------------------------------------------------------------------
// HTML descriptions
// ---------------------------------------------------------------------------
// Straight out of the live Onkyo GX-30ARC description, which is written in
// HTML end to end. The page used to print the tags.
const HTML_CASES: [string, string, string][] = [
  [
    "<h3>מה כלול באריזה</h3>",
    "**מה כלול באריזה:**",
    "a heading becomes the parser's own section-heading form",
  ],
  [
    "<li><strong>שלט IR</strong></li>",
    "**שלט IR**",
    "a list item becomes its own line, its bold preserved",
  ],
  [
    "<p>הדגם הרשמי הוא <strong>Onkyo GX-30ARC</strong> מסדרת <strong>Creator Series</strong>.</p>",
    "הדגם הרשמי הוא **Onkyo GX-30ARC** מסדרת **Creator Series**.",
    "inline bold survives, the paragraph tags do not",
  ],
  [
    "<p><em>הבהרה:</em> נכתב <strong>50W Total System Power</strong>.</p>",
    "הבהרה: נכתב **50W Total System Power**.",
    "em carries no formatting here, so it is unwrapped rather than marked",
  ],
  [
    "<h3>וופר 4 אינץ&#39; וטוויטר 0.75 אינץ&#39;</h3>",
    "**וופר 4 אינץ' וטוויטר 0.75 אינץ':**",
    "numeric entities are decoded",
  ],
  [
    "<h3>USB-C &amp; Bluetooth</h3>",
    "**USB-C & Bluetooth:**",
    "named entities are decoded",
  ],
  [
    "<h2>Onkyo GX-30ARC — זוג רמקולים</h2>\n\n<p>טקסט.</p>",
    "**Onkyo GX-30ARC — זוג רמקולים:**\nטקסט.",
    "blank lines between blocks collapse",
  ],
  [
    "<script>alert(1)</script><p>שלום</p>",
    "שלום",
    "a script tag is removed with its contents, never rendered",
  ],
  [
    "טקסט רגיל בלי שום תגית",
    "טקסט רגיל בלי שום תגית",
    "plain text is left exactly as it is",
  ],
];

for (const [input, expected, why] of HTML_CASES) {
  const got = normalizeDescription(input);
  if (got !== expected) fail(`${why}\n        in:  ${JSON.stringify(input)}\n        got: ${JSON.stringify(got)}\n        want:${JSON.stringify(expected)}`);
}

// A דגם cell that is an availability note, not a model number. The first
// is the one in the catalog: four air conditioners named "SOMO אזל זמנית".
const STOCK_PHRASES = [
  "אזל זמנית",
  "אזל",
  "אזל מהמלאי",
  "חסר במלאי",
  "לא במלאי",
  "אין במלאי",
  "בהזמנה",
  "הופסק ייצור",
  "out of stock",
  "Sold Out",
  "N/A",
  " אזל זמנית ",
  "אזל זמנית.",
];
for (const v of STOCK_PHRASES) {
  if (!looksLikeStockPhrase(v)) fail(`stock phrase not recognised: ${JSON.stringify(v)}`);
}

// Real model codes, including ones that contain a status word. Whole-cell
// only — a model is dropped on evidence, never on a substring.
const REAL_MODELS = [
  "RT62K7044BS",
  "GE83BIX",
  "140 נייד",
  "אזל 200",
  "SOMO אזל זמנית",
  "EZEL-9",
  "NA-127",
  "חסר-4000",
  "",
];
for (const v of REAL_MODELS) {
  if (looksLikeStockPhrase(v)) fail(`real model rejected as a stock phrase: ${JSON.stringify(v)}`);
}

const total =
  HTML_CASES.length + LABEL_URLS.length + PRODUCT_URLS.length + MARKETING_TITLES.length + REAL_TITLES.length +
  SHAPES.length + STOCK_PHRASES.length + REAL_MODELS.length;
console.log(
  `${total - failed}/${total} passed  ` +
    `(${LABEL_URLS.length} label urls, ${PRODUCT_URLS.length} photo urls, ` +
    `${MARKETING_TITLES.length} copy titles, ${REAL_TITLES.length} real titles, ${SHAPES.length} shapes, ` +
    `${STOCK_PHRASES.length} stock phrases, ${REAL_MODELS.length} real models, ` +
    `${HTML_CASES.length} html descriptions)`,
);
process.exitCode = failed > 0 ? 1 : 0;
