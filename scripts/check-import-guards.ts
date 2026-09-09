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
  looksLikeMisplacedQuantity,
  looksLikeOffsetStockRow,
  modelsCanBeTheSame,
} from "../src/lib/inventory/import-guards";
import { resolvedPrice } from "../src/lib/inventory/diff-engine";

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

// A price typed into the quantity column. Every REFUSED case below is a real
// row from the white-goods sheet; every ALLOWED one is a quantity the shop
// could plausibly hold, and the guard must not touch a single one of them —
// a stock guard that eats real stock is worse than the typo it prevents.
const REFUSED: [number, number, string][] = [
  [9901, 12900, "Samsung Bespoke RF90A9015 — the row's own notes say sold out"],
  [9900, 11900, "Samsung Bespoke RF70A9115WH"],
  [7901, 8900, "Samsung RF65A9011B1"],
  [6901, 7900, "Samsung RF65A9011SL"],
  [5002, 6000, "Samsung Bespoke RB35A6222BK"],
  [9901, 3600, "Samsung RT53 — the cheapest of them and still ₪35M"],
  [2000, 1390, "Electra water bar RXS390"],
  [1900, 1290, "Sanyo mini bar 1140"],
];
for (const [qty, price, why] of REFUSED) {
  if (!looksLikeMisplacedQuantity(qty, price)) fail(`must be refused — ${why}: ${qty} x ${price}`);
}

const ALLOWED: [number, number, string][] = [
  [2, 12900, "two of a premium fridge, which is what the display column actually says"],
  [74, 4500, "74 air conditioners — the largest real quantity in this catalog"],
  [500, 50, "five hundred cables at fifty shekels is a normal cable order"],
  [1000, 30, "a thousand cheap accessories"],
  [99, 12900, "just under the count floor, so the value test never runs"],
  [150, 5000, "150 units worth 750k — big, and still under the line"],
  [0, 12900, "nothing in stock"],
  [3, 0, "a product with no price yet cannot be judged this way"],
  [5, 0, "same"],
];
for (const [qty, price, why] of ALLOWED) {
  if (looksLikeMisplacedQuantity(qty, price)) fail(`must be allowed — ${why}: ${qty} x ${price}`);
}

// A whole row whose columns are shifted, which the value test above cannot
// see: 990 water bars at ₪708 is worth ₪700,920, under the million, and the
// row went live. The tell is its neighbour — a fraction in a column that holds
// units.
const SHIFTED: [number[], string][] = [
  [[990, 0.2570621468926553], "Sanyo Olympic 1019 — the one that was live at 990"],
  [[2000, 0.29496402877697836], "Electra RXS390, all four colours"],
  [[1900, 0.3875968992248062], "Sanyo 1140"],
  [[0, 0.39], "a shifted row that happens to have landed on zero"],
];
for (const [quantities, why] of SHIFTED) {
  const lines = quantities.map((quantity) => ({ quantity }));
  if (!looksLikeOffsetStockRow(lines)) fail(`must be refused — ${why}: ${quantities.join(", ")}`);
}

const STRAIGHT: [number[], string][] = [
  [[2, 1], "an ordinary two-column row"],
  [[74], "the largest real quantity in this catalog"],
  [[0, 0, 0], "nothing anywhere"],
  [[500, 12, 3], "a cable order across three warehouses"],
];
for (const [quantities, why] of STRAIGHT) {
  const lines = quantities.map((quantity) => ({ quantity }));
  if (looksLikeOffsetStockRow(lines)) fail(`must be allowed — ${why}: ${quantities.join(", ")}`);
}

// ---------------------------------------------------------------------------
// modelsCanBeTheSame. Every pair below is a real one: the SAME half are a
// product and its own sheet row spelled differently, the DIFFERENT half are
// the swaps that were actually found live in the catalog.
// ---------------------------------------------------------------------------
const SAME_MODEL: [string | null, string | null, string][] = [
  ["CUISINE-7310IX", "7310IX", "the sheet drops the series name"],
  ["SJ-9630SL", "9630SL", "the sheet drops the brand prefix"],
  ["DLR393XLEU", "DLR 393XL", "spaces and a region suffix"],
  ["H 2467 BP", "H2467BP", "the same model, spaced"],
  ["BT682W", "BT682", "a colour letter only we carry"],
  ["MWG3434", "MWG3434W", "a colour letter only the sheet carries"],
  [null, "MGH90GB", "no model on the product — the sheet is not contradicting anything"],
  ["CH74BVT", null, "no model in the sheet row"],
  ["CH74BVT", "  ", "a blank model cell"],
];
for (const [product, row, why] of SAME_MODEL) {
  if (!modelsCanBeTheSame(product, row)) fail(`models must match — ${why}: ${product} / ${row}`);
}

// Refused, and refusing is the safe direction. A rejected position match is
// not a lost product: it falls through to the SKU lookup and the content row
// key, both of which still find it. The cost of being too strict is one
// extra lookup; the cost of being too loose is a product silently taking
// another product's stock. So an O typed for a zero stays a mismatch rather
// than being folded away — folding characters to rescue a typo would also
// fold two models that differ only there.
const REFUSED_BUT_HARMLESS: [string, string, string][] = [
  ["PM363I0X", "PM363IOX", "a zero typed as an O in the sheet"],
];
for (const [product, row, why] of REFUSED_BUT_HARMLESS) {
  if (modelsCanBeTheSame(product, row)) fail(`expected a refusal — ${why}: ${product} / ${row}`);
}

const DIFFERENT_MODEL: [string, string, string][] = [
  ["CH74BVT", "MGH90GB", "a Candy ceramic hob bound to a Crystal gas hob's row"],
  ["STK60GHX", "STK70GHX", "60cm bound to the 70cm one row below"],
  ["EP7A6SB95Y", "EP7A6QI40Y", "two Siemens hobs, one row apart"],
  ["WF13314GBC", "WF13314WBC", "one letter apart, two washing machines"],
  ["MER6600BS", "RFN23841B", "an Amcor fridge bound to an Asko row"],
  ["55QNED80T6B", "65NANO80A6A", "a 55\" TV bound to a 65\" row"],
  ["I777", "SCHDC30B", "a hybrid hob bound to a domino ceramic"],
  ["P560CDN", "P540BFN", "the TCL fridge whose price came out at 500 ₪"],
];
for (const [product, row, why] of DIFFERENT_MODEL) {
  if (modelsCanBeTheSame(product, row)) fail(`models must differ — ${why}: ${product} / ${row}`);
}

// ---------------------------------------------------------------------------
// The cost floor in resolvedPrice. Every row below is a real one, copied out
// of the stockBreakdown snapshot the sync persisted for that product.
// [retail, minSale, manager, cost, expected price, why]
// ---------------------------------------------------------------------------
const PRICE_ROWS: [number | null, number | null, number | null, number | null, number | null, string][] = [
  // The two that were live and orderable at the wrong number.
  [6200, 690, 6800, 5790, 6200, "Miele H 2467 BP — 690 is an eighth of cost"],
  [13290, 1400, 11600, 10850, 11600, "LG GR-730BINS — 1,400 against a 10,850 cost"],
  // Its own sibling on the next rows of the same sheet, which was always
  // right and has to stay right: lowest-wins still decides among survivors.
  [5500, 4990, 4890, 4290, 4890, "Miele H 2467 B — manager price is genuinely lowest"],
  // Selling at or under cost is a real thing a shop does, and the floor must
  // not touch any of these. All four are in the catalog today.
  [null, 7400, 6800, 6800, 6800, "Samsung RB35A6222BK — sold at cost"],
  [null, 14900, 12900, 13900, 12900, "Samsung RF90A9015BK — 1,000 under cost"],
  [null, 10700, 7900, 8500, 7900, "Samsung RF65A9011SL — 7% under cost"],
  [null, 150, null, 164, 150, "Hemilton hand mixer — 14 ₪ under cost"],
  // No cost column on the sheet: nothing to compare against, old behaviour.
  [3200, 2890, 2790, null, 2790, "a sheet with no עלות column"],
  // Nothing usable at all.
  [null, null, null, 5790, null, "no price columns at all"],
  [500, 400, null, 9000, null, "every candidate below the floor"],
];
for (const [retailPrice, minSalePrice, managerPrice, internalCost, expected, why] of PRICE_ROWS) {
  const { price } = resolvedPrice({ retailPrice, minSalePrice, managerPrice, internalCost });
  if (price !== expected) fail(`price: expected ${expected} got ${price} — ${why}`);
}

const total =
  SAME_MODEL.length + DIFFERENT_MODEL.length + REFUSED_BUT_HARMLESS.length + PRICE_ROWS.length + SHIFTED.length + STRAIGHT.length +
  HTML_CASES.length + LABEL_URLS.length + PRODUCT_URLS.length + MARKETING_TITLES.length + REAL_TITLES.length +
  SHAPES.length + STOCK_PHRASES.length + REAL_MODELS.length + REFUSED.length + ALLOWED.length;
console.log(
  `${total - failed}/${total} passed  ` +
    `(${LABEL_URLS.length} label urls, ${PRODUCT_URLS.length} photo urls, ` +
    `${MARKETING_TITLES.length} copy titles, ${REAL_TITLES.length} real titles, ${SHAPES.length} shapes, ` +
    `${STOCK_PHRASES.length} stock phrases, ${REAL_MODELS.length} real models, ` +
    `${REFUSED.length} misplaced prices, ${ALLOWED.length} real quantities, ` +
    `${SHIFTED.length} shifted rows, ${STRAIGHT.length} straight rows, ` +
    `${PRICE_ROWS.length} price rows, ` +
    `${SAME_MODEL.length} same models, ${DIFFERENT_MODEL.length} swapped models, ` +
    `${REFUSED_BUT_HARMLESS.length} harmless refusal, ` +
    `${HTML_CASES.length} html descriptions)`,
);
process.exitCode = failed > 0 ? 1 : 0;
