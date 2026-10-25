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
  looksLikeSupplierSku,
  looksLikeMisplacedQuantity,
  looksLikeOffsetStockRow,
  modelsCanBeTheSame,
  modelsAreTheSame,
  modelsAreTheSameAllowingTypedZero,
  rowBindingLooksForeign,
  alertEvidenceStillStands,
  rowModelWasReassigned,
  titleNamesAnotherModel,
  rowStillNamesThisProduct,
} from "../src/lib/inventory/import-guards";
import { resolvedPrice } from "../src/lib/inventory/diff-engine";
import { parseSheetRows } from "../src/lib/inventory/excel-parser";

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

// The last comparison in findExistingProductWithPath, where a refusal costs
// the product its row in the price list rather than one extra lookup. Only a
// letter O typed where a zero belongs is folded — see the note on the
// function. The pairs below are real: each is one product spelled both ways
// across the sheet and the catalogue.
const TYPED_ZERO_SAME: [string, string, string][] = [
  ["CMA583MB0", "CMA583MBO", "the Bosch oven dropped from the price list on 11 October"],
  ["PM363I0X", "PM363IOX", "the pair modelsCanBeTheSame still refuses, on purpose"],
  ["O181235", "181235", "a letter O leading a numeric code"],
  ["HB317GTS0", "HB317GTSO", "a Siemens oven, both spellings in the sheet"],
];
for (const [product, row, why] of TYPED_ZERO_SAME) {
  if (!modelsAreTheSameAllowingTypedZero(product, row)) {
    fail(`typed-zero models must match — ${why}: ${product} / ${row}`);
  }
  // And the position guard must be unaffected: its refusal is recorded above
  // and this must not have loosened it.
  if (product === "PM363I0X" && modelsCanBeTheSame(product, row)) {
    fail("the typed-zero fold leaked into modelsCanBeTheSame");
  }
}

// Still refused by the fold, because it is a substitution and not an edit
// distance. Two models one letter apart are two products.
const TYPED_ZERO_DIFFERENT: [string, string, string][] = [
  ["WF13314GBC", "WF13314WBC", "one letter apart, two washing machines"],
  ["STK60GHX", "STK70GHX", "60cm and 70cm"],
  ["EP7A6SB95Y", "EP7A6QI40Y", "two Siemens hobs"],
  ["S70ROLLER", "S70ROLER", "a doubled letter is not a typed zero"],
];
for (const [product, row, why] of TYPED_ZERO_DIFFERENT) {
  if (modelsAreTheSameAllowingTypedZero(product, row)) {
    fail(`typed-zero fold must still refuse — ${why}: ${product} / ${row}`);
  }
}

// What the row said about this product last time, which is the comparison
// that decides identity on a position or content-key match — see
// rowStillNamesThisProduct in lib/inventory/sync.ts.
//
// Every pair below is a real product the 12 October 04:30 run took off the
// site and replaced with a blank record on the same sheet row, the same row
// index and the same content hash. The first column is what the catalogue
// holds, the second is what the sheet's row says, the third is what the same
// row said on the previous run. The sheet never changed its mind: column two
// and column three are identical in all fourteen. What changed was the
// catalogue, because enrichment writes the manufacturer's real code over the
// supplier's shorthand — which is a correction somebody made on purpose, and
// comparing the row against it makes a successful enrichment look like a
// different product.
const ROW_MODEL_UNCHANGED: [string, string, string, string][] = [
  ["CTAC8780AFSNE", "8780IN", "8780IN", "Bauknecht hob, the full manufacturer code"],
  ["SHI8080", "SIH 8080", "SIH 8080", "Sauter hob, two letters transposed"],
  ["65QNED70B6T", "65QN70B6", "65QN70B6", "an LG TV the sheet abbreviates"],
  ["86QNED85B6T", "85QNED85B", "85QNED85B", "and the 86\" one"],
  ["DLW1059T3B", "DLW1095B", "DLW1095B", "a DeLonghi washing machine"],
  ["CMA583MB0", "CMA583MBO", "CMA583MBO", "a Bosch oven, letter O for a zero"],
  ["H 2861 B Grey", "H2861 Bgray", "H2861 Bgray", "the Miele oven, Grey against Bgray"],
  ["HB317GTS0", "HB317GTSO", "HB317GTSO", "a Siemens oven, letter O for a zero"],
  ["HGN9333Z", "HGN9335Z", "HGN9335Z", "a Blomberg range, one digit"],
  ["HGN8333", "HGN8335", "HGN8335", "and the white one"],
  ["HGN8433X", "HGN8435X", "HGN8435X", "and the stainless one"],
  ["JCF-88S", "JCF88 IX", "JCF88 IX", "a Le Imperial wine fridge"],
  ["BO-660GIV ICE", "BO660IV", "BO660IV", "a Bompani fridge the sheet abbreviates"],
  ["FNT3676X", "3676X NF", "3676X NF", "a Blomberg freezer"],
];
for (const [model, rowModel, lastRowModel, why] of ROW_MODEL_UNCHANGED) {
  if (!rowStillNamesThisProduct({ model, lastRowModel }, rowModel)) {
    fail(`the row has not changed its mind — ${why}: ${model} / ${rowModel}`);
  }
  // The point of the pairs: the product's own model is NOT the answer here.
  // If one of these ever starts matching on it, the fixture has gone stale
  // and stopped testing anything.
  if (modelsCanBeTheSame(model, rowModel)) {
    fail(`fixture is stale, the models now match directly — ${why}: ${model} / ${rowModel}`);
  }
}

// The same fourteen pairs again, against the price guard this time.
//
// rowModelWasReassigned has to be silent on every one of them. These are the
// corrections enrichment made on purpose — the row never moved, column two
// and column three are the same string — and a guard that read them as the
// price list reassigning a SKU would freeze the price of every product that
// has ever been enriched properly. That is the opposite of the failure it
// exists for, and the more expensive one: 1,300 products would stop tracking
// the price list to protect against 20.
for (const [model, rowModel, lastRowModel, why] of ROW_MODEL_UNCHANGED) {
  if (rowModelWasReassigned({ model, lastRowModel }, rowModel)) {
    fail(`an enrichment correction is not a reassignment — ${why}: ${model} / ${rowModel}`);
  }
}

// The price list moving a SKU onto a different appliance: the row's own model
// changes, into something the product's model contradicts.
//
// The first is the one this was written for. On 12 October the shop offered a
// Samsung RT53DG7A14WW — a 530-litre top-freezer — at 6,200 ₪, because SKU
// 107012 in מקררים row 550 had become a RF60C7012SL, a 660-litre four-door
// costing 5,700, and 6,200 is that row's קוד מנכ"ל. The fridge's own record,
// holding row 536 whose model does say RT53DG7A14WW, was hidden at 3,600 ₪.
// Nothing reported it: the SKU matched, and a matching SKU was the whole test.
//
// The rest are live pairs found by the same sweep, written here as the
// transition — what the row said before it moved, and what it says now. Each
// one's price is a different appliance's price if the move is real.
const ROW_MODEL_REASSIGNED: [string, string, string, string][] = [
  ["RT53DG7A14WW", "RF60C7012SL", "RT53DG7A14WW", "SKU 107012, the 6,200 ₪ fridge"],
  ["KG49NSBBF", "RB34J3000B", "KG49NSBBF", "SKU 108336, a Siemens holding a Samsung's row"],
  ["LFS-9021SBL", "SSA91MABL2", "LFS-9021SBL", "SKU 160913, a 10,900 ₪ range"],
  ["PRO905LGGVXT", "MAS95CMFNNE", "PRO905LGGVXT", "SKU 161095, a 9,900 ₪ range"],
  ["HRF825FW", "RWB640VRSGS", "HRF825FW", "SKU 105340, a Haier four-door"],
  ["SR23HI48KE", "SN87TX02CE", "SR23HI48KE", "SKU 149703, two different Siemens dishwashers"],
  ["FSK93727P", "FBF9443SBA", "FSK93727P", "SKU 0799, eleven units of it"],
  ["HOR38G5FT", "HBMW28GB", "HOR38G5FT", "SKU 150026, an oven whose row names a microwave"],
  ["HO-9903S", "HB237GBB3", "HO-9903S", "SKU 150238, a SOL oven on a Bosch row"],
  ["CUISINE-7310LIX", "7300IX", "CUISINE-7310LIX", "SKU 157312, one digit apart and not the same oven"],
  ["MWS5023W", "MW5235W", "MWS5023W", "SKU 185233, the white microwave"],
  ["MX-Athens-WH", "MX-KU1801R", "MX-Athens-WH", "SKU 750070, a kettle"],
];
for (const [model, rowModel, lastRowModel, why] of ROW_MODEL_REASSIGNED) {
  if (!rowModelWasReassigned({ model, lastRowModel }, rowModel)) {
    fail(`the row was reassigned — ${why}: ${model} / ${rowModel} (was ${lastRowModel})`);
  }
}

// And silence is never a reassignment. Each of these would be a price frozen
// for no reason, which is the cost of guessing in the other direction.
const ROW_MODEL_NOT_REASSIGNED: [string | null, string | null, string | null, string][] = [
  ["RT53DG7A14WW", "RF60C7012SL", null, "a first run, with no previous row model to compare"],
  ["RT53DG7A14WW", null, "RT53DG7A14WW", "a row with no model column"],
  [null, "RF60C7012SL", "RT53DG7A14WW", "a product with no model of its own"],
  ["RT53DG7A14WW", "RT53", "RT53DG7A14WW", "a row model too short to assert anything"],
  ["P65", "NB P9", "P65", "a product model too short to assert anything"],
  ["CMA583MB0", "CMA583MBO", "CMA583MB0", "a letter O typed where a zero belongs"],
  ["HB317GTS0", "HB317GTSO", "HB317GTS0", "and the other way round"],
  ["RT53DG7A14WW", "RT53DG7A14WW", "RF60C7012SL", "a row that has moved back onto us"],
  ["8780IN", "CTAC8780AFSNE", "CTAC8780AFSNE", "the row carrying the longer code, us the short one"],
];
for (const [model, rowModel, lastRowModel, why] of ROW_MODEL_NOT_REASSIGNED) {
  if (rowModelWasReassigned({ model, lastRowModel }, rowModel)) {
    fail(`silence is not a reassignment — ${why}: ${model} / ${rowModel} (was ${lastRowModel})`);
  }
}

// rowBindingLooksForeign, over the whole catalogue as it stood on
// 12 October. The sweep returned 61 products whose row model shares no
// three-character run with their own; 20 of those are real and the other 41
// are the three shapes the filters know about. Every row here is a live
// product, SKU and all, so when a filter stops working the fixture says which.
const FOREIGN_BINDING: [string, string, string, string][] = [
  ["107012", "RT53DG7A14WW", "RF60C7012SL", "the 6,200 ₪ fridge, 2,600 over its real price"],
  ["108336", "KG49NSBBF", "RB34J3000B", "a Siemens iQ700 reading a Samsung's row"],
  ["160913", "LFS-9021SBL", "SSA91MABL2", "a 10,900 ₪ range cooker"],
  ["161095", "PRO905LGGVXT", "MAS95CMFNNE", "a 9,900 ₪ range cooker"],
  ["105340", "HRF825FW", "RWB640VRSGS", "a Haier four-door at 8,200, twin of one at 7,500"],
  ["149703", "SR23HI48KE", "SN87TX02CE", "two different Siemens dishwashers"],
  ["109321", "RQ72", "HRF7100FW", "a 5,600 ₪ fridge"],
  ["0799", "FSK93727P", "FBF9443SBA", "eleven units of a 4,800 ₪ dishwasher"],
  ["150500", "NR-7520C", "73TSI500G", "a built-in at 2,900"],
  ["157312", "CUISINE-7310LIX", "7300IX", "one digit apart and not the same oven"],
  ["150238", "HO-9903S", "HB237GBB3", "a SOL oven on a Bosch row, twin of one at 1,300"],
  ["151780", "CUISINE-7850B", "7800B", "a built-in oven at 2,300"],
  ["150026", "HOR38G5FT", "HBMW28GB", "an oven whose row names a microwave"],
  ["830653", "BN653", "EN85-B", "a coffee machine"],
  ["180654", "AM9P022MX-B", "65009", "a microwave whose row prints another's code"],
  ["180653", "MM9P022KG-S", "65008", "and the one beside it"],
  ["185234", "MWS5023B", "MW5235B", "the black microwave"],
  ["185233", "MWS5023W", "MW5235W", "and the white one"],
  ["270004", "P65", "NB P9", "a TV mount whose own code is too short to assert"],
  ["270064", "AL-55", "AL45", "two different mounts, four characters each"],
  ["750070", "MX-Athens-WH", "MX-KU1801R", "a kettle at 150 against a cost of 58"],
  ["157131", "OKW9440X", "BKS7131LX", "correctly bound, and flagged anyway — see the note in the guard"],
];
for (const [sku, model, lastRowModel, why] of FOREIGN_BINDING) {
  const expected = !why.includes("too short to assert");
  if (rowBindingLooksForeign({ sku, model, lastRowModel }) !== expected) {
    fail(`foreign binding: expected ${expected} — ${why}: ${sku} ${model} / ${lastRowModel}`);
  }
}

// The 41 the filters have to clear, by shape. A false positive here is an
// afternoon somebody spends on a correctly bound product.
const FAMILIAR_BINDING: [string, string, string, string][] = [
  // A brand or marketing name sitting in the model column.
  ["710008", "KM 1800 Black-E", "CASO", "brand name"],
  ["770603", "ES603", "Ninja", "brand name"],
  ["840003", "TB501EU", "GRAEF", "brand name"],
  ["490043", "73179-2848", "Talia", "a product line"],
  ["815624", "HD16", "SUPERSONIC", "the Dyson's marketing name"],
  ["0927", "AM-1", "Bowers", "half of Bowers & Wilkins"],
  ["750067", "MX-CHRL-BK", "Charleston", "the kettle's name, not its code"],
  ["750069", "MX-CHLT-BK", "Charlotte", "and the other one"],
  ["930043", "OM-8016S", "SNOW", "a winter line"],
  ["930044", "OM-7010M", "WIND", "and the other"],
  ["920014", "IK612-2X18W", "OM", "the brand, two letters"],
  ["490086", "72422", "MAUNTTAINE", "a misspelt product line"],
  // A wattage.
  ["846811", "MSM6M8X1", "1200W", "wattage, not a model"],
  ["846810", "MSM6M810", "1200W", "wattage"],
  ["840421", "MSM4W421", "800W", "wattage"],
  // The supplier's shorthand for a SKU we already agree on.
  ["106356", "MDRF632FIF22D", "6356", "last four of the SKU"],
  ["106368", "MDRT866FGL46", "6368", "last four of the SKU"],
  ["126441", "MF100T70B/W-IL", "6441", "last four of the SKU"],
  ["126442", "MF100T80B/W-IL", "6442", "last four of the SKU"],
  ["157810", "MWB5634", "7810B", "SKU tail with a colour letter"],
  /* The one shorthand row the SKU-tail filter does not clear: at 9
     characters the tail is 44% of it, under the half the filter asks for.
     Kept here, and expected to be flagged, so that nobody loosens the rule
     back to "contains the SKU" — which is what let the 6,200 ₪ fridge
     through the first draft. */
  ["108911", "SJ-3850WH", "8911BK", "SKU tail with a colour"],
  ["186567", "EM823A2GU-Silver", "6567", "last four of the SKU"],
  ["196571", "60F49-SS", "6571", "last four of the SKU"],
  ["186646", "MWB5634", "MW6646B", "SKU tail inside a code"],
  ["155546", "MWB5634", "MW5546", "SKU tail inside a code"],
  ["185634", "MW6623B", "MW5634X", "SKU tail inside a code"],
  // And the fourteen enrichment corrections, which keep the stem.
  ["0883", "CTAC8780AFSNE", "8780IN", "the stem 8780 survives the correction"],
  ["0897", "SHI8080", "SIH 8080", "8080 survives two transposed letters"],
  ["0909", "H 2861 B Grey", "H2861 Bgray", "Grey against Bgray"],
  ["0910", "CMA583MB0", "CMA583MBO", "letter O for a zero"],
  ["0911", "HB317GTS0", "HB317GTSO", "letter O for a zero"],
  ["0912", "65QNED70B6T", "65QN70B6", "an LG the sheet abbreviates"],
  ["0913", "86QNED85B6T", "85QNED85B", "and the 86-inch"],
  ["0914", "DLW1059T3B", "DLW1095B", "a DeLonghi washer"],
  ["0915", "HGN9333Z", "HGN9335Z", "one digit"],
  ["0916", "HGN8333", "HGN8335", "one digit"],
  ["0917", "HGN8433X", "HGN8435X", "one digit"],
  ["0918", "JCF-88S", "JCF88 IX", "a wine fridge"],
  ["0919", "BO-660GIV ICE", "BO660IV", "a Bompani the sheet abbreviates"],
  ["0920", "FNT3676X", "3676X NF", "a Blomberg freezer"],
];
for (const [sku, model, lastRowModel, why] of FAMILIAR_BINDING) {
  if (rowBindingLooksForeign({ sku, model, lastRowModel })) {
    fail(`a correctly bound row must not be flagged — ${why}: ${sku} ${model} / ${lastRowModel}`);
  }
}

// titleNamesAnotherModel, over the catalogue as it read on 13 October.
//
// Sixteen live products whose Hebrew title prints a model code their own
// model field does not know. The first entry is the one the rule was written
// for: a page titled "Samsung Crystal UHD 65U8000H" at 10,500 ₪ whose model,
// row, brand, specs and photograph were all an LG OLED evo 77". Its price was
// correct the whole time — what was wrong was the name on it.
const TITLE_NAMES_ANOTHER: [string, string, string, string][] = [
  ["OLED77C66LA", "טלוויזיה סמסונג Samsung Crystal UHD 65U8000H 65 אינץ' 4K", "65U8000H", "an LG OLED 77 titled as a Samsung 65"],
  ["55UA80006LC", "טלוויזיה חכמה LG UHD 55 אינץ' 4K webOS 25 דגם 55UA73006LA", "55UA73006LA", "UA7300 in the title, UA8000 in the field and the row"],
  ["R-WB700VRS2GS", "מקרר היטאצ'י Hitachi R-WB640VRS 4 דלתות", "R-WB640VRS", "the Hitachi before its model was corrected"],
  ["HGN9333Z", "תנור אפייה משולב Blomberg HGN9335Z - שחור", "HGN9335Z", "title and row both say 9335, the field says 9333"],
  ["HGN8333", "תנור אפייה משולב Blomberg HGN8335 - לבן", "HGN8335", "and the white one"],
  ["HGN8433X", "תנור אפייה משולב Blomberg HGN8435X - נירוסטה", "HGN8435X", "and the stainless one"],
  ["ZOPKD7XA", "תנור בנוי זנוסי Zanussi ZOPKD7X1A 75 ליטר", "ZOPKD7X1A", "one character apart"],
  ["GET45IX", "מקרר General GE45IX NF - נירוסטה", "GE45IX", "a T that is in one and not the other"],
  ["SDWi1040", "מדיח כלים Sauter SDW1040 - 7 תוכניות", "SDW1040", "an i that is in one and not the other"],
  ["Ninja", "מכונת קפה אספרסו אוטומטית נינג'ה Ninja AutoBrew AE1001", "AE1001", "the model field holds the brand name"],
  ["MWP-MM20 WH", "מיקרוגל Toshiba MWP-MM20P(WH)-IL מכני 20 ליטר", "MWP-MM20P", "the title carries the fuller code"],
  ["CS5200JN", "מעבד מזון מגימיקס Magimix CS5200XL Premium 11 ליטר", "CS5200XL", "a colour suffix against a marketing suffix"],
  ["R-V660 BBK", "מקרר היטאצ'י Hitachi R-V660PRS8 BBK מקפיא עליון", "R-V660PRS8", "the title adds PRS8"],
  ["CTAC8780AFSNE", "כיריים אינדוקציה Bauknecht 8780IN - שחור", "8780IN", "the title kept the supplier's shorthand"],
];
for (const [model, title, expected, why] of TITLE_NAMES_ANOTHER) {
  const got = titleNamesAnotherModel({ title, model });
  if (got !== expected) {
    fail(`title names another model — ${why}: expected ${expected}, got ${got}`);
  }
}

// And the shapes that must stay quiet. Each of these was a false positive in
// a draft of the rule, found by running it over the catalogue rather than by
// thinking about it.
const TITLE_AGREES: [string, string, string][] = [
  ["65U8000H 4K", "טלוויזיה Samsung 65U8000H 65 אינץ' UHD LED 4K 120Hz", "the field has a suffix the title spreads out"],
  ["M 7244 TC CLST", "מיקרוגל בנוי מילה Miele M 7244 TC CleanSteel 46 ליטר", "a model written with spaces, matched across them by the first draft"],
  ["R-WB640VRS (GMG)", "מקרר 4 דלתות היטאצ'י Hitachi R-WB640VRS (GMG) 569 ליטר", "brackets and a finish code"],
  ["SMART 30 INV לבן", "מזגן עילי אינוורטר טורנדו SMART-INV-30 X WIFI 20,543BTU", "the same code reordered, plus a BTU fragment"],
  ["SMART 22 INV לבן", "מזגן עילי אינוורטר טורנדו SMART-INV-22 X WIFI 19,084BTU", "and the 22"],
  ["DAV-BOWL-8L", "קערת נירוסטה 8 ליטר למיקסר DAVO – DSM5740, DSM5750, DSM5760", "a compatibility list, not a mistake"],
  ["RQ58S", "הייסנס Hisense מקרר 4 דלתות RQ58S בנפח 483 ליטר NoFrost", "NoFrost is not a model code"],
  ["S90QY", "LG מקרן קול 5.1.3 ערוצים 570W עם Dolby Atmos", "Dolby Atmos is not a model code"],
  ["KQD1622GB", "מקרר Blomberg KQD1622GB 572 ליטר - זכוכית שחורה", "the title does name it"],
  ["CMA583MB0", "תנור בנוי Bosch CMA583MBO 45 ס\"מ", "a letter O typed where a zero belongs"],
  ["LFS-9021SBL", "תנור משולב לנקו Lenco LFS-9021SBL 90 ס\"מ 5 מבערי גז", "an ordinary agreeing title"],
];
for (const [model, title, why] of TITLE_AGREES) {
  const got = titleNamesAnotherModel({ title, model });
  if (got !== null) {
    fail(`a title that names its own product must stay quiet — ${why}: got ${got}`);
  }
}

// And it must not become a way in for a shifted block, which is the whole
// reason the model guard is on those two paths. A row that has moved carries
// its neighbour's model, which matches neither the product's model nor what
// this product's row said last run.
const ROW_MODEL_MOVED: [string, string, string, string][] = [
  ["CH74BVT", "MGH90GB", "CH74BVT", "a Candy ceramic hob at a Crystal gas hob's row"],
  ["STK60GHX", "STK70GHX", "STK60GHX", "60cm at the 70cm row below it"],
  ["65U8000H", "OLED77C66LA", "65U8000H", "the Samsung holding an LG OLED row's key"],
  ["WF13314GBC", "WF13314WBC", "WF13314GBC", "one letter apart, two washing machines"],
];
for (const [model, rowModel, lastRowModel, why] of ROW_MODEL_MOVED) {
  if (rowStillNamesThisProduct({ model, lastRowModel }, rowModel)) {
    fail(`a moved row must still be refused — ${why}: ${model} / ${rowModel}`);
  }
}

// Silence is not a yes on this path either: it is only consulted after the
// product's own model has already refused, so an empty or unreadable
// lastRowModel must not rescue the match.
const ROW_MODEL_SILENT: [string | null, string, string | null, string][] = [
  ["CMA583MB0", "CMA583MBO", null, "no previous row model recorded"],
  ["CMA583MB0", "CMA583MBO", "", "an empty previous row model"],
  ["CMA583MB0", "CMA583MBO", "MB0", "a previous row model too short to assert"],
];
for (const [model, rowModel, lastRowModel, why] of ROW_MODEL_SILENT) {
  if (rowStillNamesThisProduct({ model, lastRowModel }, rowModel)) {
    fail(`silence must not vouch for a row — ${why}: ${model} / ${rowModel}`);
  }
}

/* The row-collision page asserts "same product" from these, so the pairs it
   actually holds are fixtures. The first two are why: a model column in
   Hebrew and an empty one both read as empty after bareModel, and
   modelsCanBeTheSame answers true to each — which put a SOMO air
   conditioner and a Tornado SUMO-INV-12X-EU at the top of that page under a
   badge saying they are the same product. */
const NOT_ASSERTABLY_SAME: [string, string, string][] = [
  ["עילי אינוורטר", "SUMO-INV-12X-EU", "a Hebrew model column is not a model"],
  ["", "1010BLACK", "an empty model asserts nothing"],
  ["85", "65", "two screen sizes are not a model"],
  ["STK60GHX", "CH74BVT", "two real models that disagree"],
  ["NV7B5755SAK", "MWB5634", "a Samsung oven against a Sauter microwave"],
];
for (const [a, b, why] of NOT_ASSERTABLY_SAME) {
  if (modelsAreTheSame(a, b)) fail(`must not assert sameness — ${why}: "${a}" / "${b}"`);
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
  // These four used to assert the opposite — that selling at or under cost is
  // a real thing a shop does and the floor must not touch them. The owner's
  // rule, stated twice and on 13 October as a description of the row itself
  // ("the lowest number is our cost, the next one is what we sell at"), is
  // that nothing is sold at or under cost. So each now resolves to the
  // cheapest candidate strictly above it, and the one row whose only
  // candidate is the cost resolves to no price at all.
  [null, 7400, 6800, 6800, 7400, "Samsung RB35A6222BK — was live at cost"],
  [null, 14900, 12900, 13900, 14900, "Samsung RF90A9015BK — manager code 1,000 under cost"],
  [null, 10700, 7900, 8500, 10700, "Samsung RF65A9011SL — manager code 7% under cost"],
  [null, 150, null, 164, null, "Hemilton hand mixer — 14 ₪ under cost, nothing above it"],
  // The three that were live at exactly their own cost on 13 October, with
  // the supplier having written the cost into a price column as well. Half
  // of cost cannot see any of them.
  [7200, 6800, 6900, 6800, 6900, "Bosch PXV975DV1E — מינימום למכירה repeats the cost"],
  [2400, 2200, 1900, 1900, 2200, "LG 55UA8000 — קוד מנכ\"ל repeats the cost"],
  [1790, 1290, null, 1290, 1790, "Kenwood kMix KMX753ABK — מחיר מינ' repeats the cost"],
  // מיקסרים row 115: one cell, `1`, and no price column at all. A Sauter
  // grinder attachment was live and orderable at one shekel, four in stock.
  [null, 1, null, 1, null, "a row carrying only a cost of 1 ₪ has no price"],
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

// ---------------------------------------------------------------------------
// Block-footer rows. parseSheetRows sets hasProductSignal on a SKU *or any
// numeric field*, and the stock columns are numeric, so a footer that sums
// the brand's units and carries nothing else reads as a product. Ten in the
// three current workbooks do, and the one on מדיחים 165 became SKU 0812 — a
// Schulthess dishwasher with 157 units at 3,800 ₪, ₪596,600 of stock the
// back office reported as sitting off the site and which does not exist.
//
// The grid below is copied out of מיקסרים: a real priced row, the unpriced
// Burman line beside it that must survive, and the footer shapes that must
// not. Built without a worksheet argument on purpose — the highlight and
// brand-fill paths need one and are not what this is testing.
// ---------------------------------------------------------------------------
const FOOTER_HEADER = ["מק'ט", "תאור מוצר", "עלות ללא מע\"מ", "מחיר מינ'", "מוצג", "מלאי חדרה"];
const FOOTER_GRID: [unknown[], boolean, string][] = [
  [["820082", "בוש קוצץ ירקות דגם MMR08R2 אדום", 179, 240, 290, 6], true, "a priced row with a SKU"],
  [[null, "בורמן קוצץ ירקות 6 סכינים  דגם MMR08R2 אדום", null, null, null, 2], true,
    "מיקסרים 153 — no SKU, no price, but its own text names MMR08R2"],
  [[null, "קומקום לבן", 58, 150, 190, 6], true, "no SKU and no model, but it carries money"],
  [[null, "שולטס", null, null, null, 157], false, "מדיחים 165 — the Schulthess block total"],
  [[null, "TCL", null, null, null, 65], false, "מזגנים 91 — a brand name and a sum"],
  [[null, "שאוב לורנס", null, null, null, 355], false, "כיריים 283 — the biggest of them"],
  [[null, null, null, null, null, 30], false, "רמקולים 230 — not even a brand, just the number"],
  [[null, "דגם 6 סכינים", null, null, null, 4], false, "a digit alone is not a model code"],
];
{
  const grid: unknown[][] = [FOOTER_HEADER, ...FOOTER_GRID.map(([cells]) => cells)];
  const parsed = parseSheetRows("מיקסרים מעבדי מזון בלנדרים קוצצ", grid);
  if (!parsed) fail("footer grid: the header row was not recognised at all");
  else {
    const accepted = new Set(parsed.rows.map((r) => r.rowIndex));
    FOOTER_GRID.forEach(([, shouldPass, why], i) => {
      const got = accepted.has(i + 1);
      if (got !== shouldPass) {
        fail(`footer row: expected ${shouldPass ? "accepted" : "dropped"}, got ${got ? "accepted" : "dropped"} — ${why}`);
      }
    });
  }
}


// A SKU cell that is really the importer's rep and their service number. The
// sheets keep 168 of these on rows of their own, and five `סה"כ` block
// totals besides; until the catalog opened to stock-less rows they were held
// out only because they also carry no stock.
const REAL_SKUS = [
  "109208",
  "0120813", //  a genuine leading zero
  "O180235", //  a genuine leading letter
  "O151251",
  "9158610",
  "100825",
  "730006",
];
const NOT_SKUS = [
  "אל גי-חזי ברימאג--0506660374    שירות--1700700909   *8404",
  "סמסונג מ.כביסה--אריה ניופרו--0503018588    שירות--*6963     התקנות *3049",
  "אריה טכנאי להתקנות מסכים--0522822240 --התקנה סטנדרטית למסך אחד-150/250שח",
  "בקו --שגיא ברימאג--0523685252    שירות--1700700909   *8404",
  'סה"כ',
  "חדש",
  "י שלום",
  // Placeholders a person typed. Eleven rows carry one, and each names a real
  // model and a real price, so the row survives on those — it simply stops
  // claiming that its SKU column holds a SKU.
  "0",
  "1",
  "3",
  ";",
  ";;",
  "",
  "  ",
];
for (const sku of REAL_SKUS) {
  if (!looksLikeSupplierSku(sku)) fail(`looksLikeSupplierSku("${sku}") should be true`);
}
for (const sku of NOT_SKUS) {
  if (looksLikeSupplierSku(sku)) fail(`looksLikeSupplierSku("${sku.slice(0, 40)}") should be false`);
}

// --------------------------------------------- closing a question properly --
//
// SKU 270064 sold as an "Audio Line AL-55" for twelve days off a row that
// reads AL45, because the CRITICAL alert saying so was cleared in a batch of
// 36 the evening after it was raised — 34 of which genuinely were false
// alarms. Resolving it released the quarantine, and the sweep that found it
// asks once per product and never again.
//
// So an alert whose evidence is still readable cannot be marked resolved
// while it still reads. The two halves below are the whole rule: the types
// whose evidence IS checkable must refuse, and every other type must go on
// resolving exactly as before, because most alerts here record a judgement
// no column holds.
const MUST_REFUSE: [string, string, { sku: string; model: string | null; lastRowModel: string }][] = [
  ["the Audio Line stand that started this", "ROW_NAMES_ANOTHER_MODEL",
    { sku: "270064", model: "AL-55", lastRowModel: "AL45" }],
  ["a ₪10,900 Lenco oven on a Smeg row", "ROW_NAMES_ANOTHER_MODEL",
    { sku: "160913", model: "LFS-9021SBL", lastRowModel: "SSA91MABL2" }],
  ["the founding fridge", "ROW_NAMES_ANOTHER_MODEL",
    { sku: "107012", model: "RT53DG7A14WW", lastRowModel: "RF60C7012SL" }],
];
const MUST_ALLOW: [string, string, { sku: string; model: string | null; lastRowModel: string } | null][] = [
  // The contradiction is gone — somebody did the work.
  ["the same alert once the model is corrected", "ROW_NAMES_ANOTHER_MODEL",
    { sku: "270064", model: "AL45", lastRowModel: "AL45" }],
  // Enrichment's ordinary corrections, which share the manufacturer's stem.
  ["an enrichment correction", "ROW_NAMES_ANOTHER_MODEL",
    { sku: "0883", model: "CTAC8780AFSNE", lastRowModel: "8780IN" }],
  // Everything else resolves on a person's say-so, as it always did.
  /* The same contradicting pair under a different alert type. A missing
     photograph is a person's errand, not a claim about identity, and must
     resolve on their say-so even while the identity question is open
     elsewhere — which is also what keeps this rule from spreading to every
     type the moment somebody simplifies it. */
  ["a missing image on a product whose row does disagree", "MISSING_IMAGE",
    { sku: "160913", model: "LFS-9021SBL", lastRowModel: "SSA91MABL2" }],
  ["a stale sync", "SYNC_STALE", null],
  ["an alert with no product behind it", "ROW_NAMES_ANOTHER_MODEL", null],
];
for (const [label, type, product] of MUST_REFUSE) {
  if (!alertEvidenceStillStands(type, product)) {
    fail(`closing is still allowed while the evidence stands: ${label}`);
  }
}
for (const [label, type, product] of MUST_ALLOW) {
  if (alertEvidenceStillStands(type, product)) {
    fail(`closing is blocked when it should not be: ${label}`);
  }
}

const total =
  NOT_ASSERTABLY_SAME.length + FOOTER_GRID.length + SAME_MODEL.length + DIFFERENT_MODEL.length + REFUSED_BUT_HARMLESS.length + PRICE_ROWS.length + SHIFTED.length + STRAIGHT.length +
  HTML_CASES.length + LABEL_URLS.length + PRODUCT_URLS.length + MARKETING_TITLES.length + REAL_TITLES.length +
  SHAPES.length + STOCK_PHRASES.length + REAL_MODELS.length + REFUSED.length + ALLOWED.length +
  /* These five were asserted but never counted, so the summary under-reported
     by eight before the row-model cases were added to it. */
  TYPED_ZERO_SAME.length + TYPED_ZERO_DIFFERENT.length +
  ROW_MODEL_UNCHANGED.length + ROW_MODEL_MOVED.length + ROW_MODEL_SILENT.length +
  /* The price guard, over the same fourteen corrections plus its own cases. */
  ROW_MODEL_UNCHANGED.length + ROW_MODEL_REASSIGNED.length + ROW_MODEL_NOT_REASSIGNED.length +
  FOREIGN_BINDING.length + FAMILIAR_BINDING.length +
  TITLE_NAMES_ANOTHER.length + TITLE_AGREES.length + REAL_SKUS.length + NOT_SKUS.length +
  MUST_REFUSE.length + MUST_ALLOW.length;

console.log(
  `${total - failed}/${total} passed  ` +
    `(${LABEL_URLS.length} label urls, ${PRODUCT_URLS.length} photo urls, ` +
    `${MARKETING_TITLES.length} copy titles, ${REAL_TITLES.length} real titles, ${SHAPES.length} shapes, ` +
    `${STOCK_PHRASES.length} stock phrases, ${REAL_MODELS.length} real models, ` +
    `${REFUSED.length} misplaced prices, ${ALLOWED.length} real quantities, ` +
    `${SHIFTED.length} shifted rows, ${STRAIGHT.length} straight rows, ` +
    `${PRICE_ROWS.length} price rows, ` +
    `${SAME_MODEL.length} same models, ${DIFFERENT_MODEL.length} swapped models, ` +
    `${TYPED_ZERO_SAME.length} typed zeros, ${TYPED_ZERO_DIFFERENT.length} refused folds, ` +
    `${REFUSED_BUT_HARMLESS.length} harmless refusal, ` +
    `${ROW_MODEL_UNCHANGED.length} unchanged rows, ${ROW_MODEL_MOVED.length} moved rows, ` +
    `${ROW_MODEL_REASSIGNED.length} reassigned rows, ${ROW_MODEL_NOT_REASSIGNED.length} not reassigned, ` +
    `${FOREIGN_BINDING.length} foreign bindings, ${FAMILIAR_BINDING.length} familiar bindings, ` +
    `${TITLE_NAMES_ANOTHER.length} titles naming another model, ${TITLE_AGREES.length} titles agreeing, ` +
    `${ROW_MODEL_SILENT.length} silent rows, ` +
    `${HTML_CASES.length} html descriptions, ` +
    `${REAL_SKUS.length} real skus, ${NOT_SKUS.length} contact lines and placeholders, ` +
    `${MUST_REFUSE.length} alerts that cannot be closed, ${MUST_ALLOW.length} that can)`,
);
process.exitCode = failed > 0 ? 1 : 0;
