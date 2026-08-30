// Both import guards, held to cases taken from the catalog rather than
// invented. The MUST_ALLOW half is the important half: a guard that also
// rejects real photos and real product names does more damage than the
// thing it was added to prevent.
//
//   npm run check:guards
import {
  looksLikeEnergyLabelUrl,
  looksLikeMarketingTitle,
  hasEnergyLabelShape,
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

const total =
  LABEL_URLS.length + PRODUCT_URLS.length + MARKETING_TITLES.length + REAL_TITLES.length + SHAPES.length;
console.log(
  `${total - failed}/${total} passed  ` +
    `(${LABEL_URLS.length} label urls, ${PRODUCT_URLS.length} photo urls, ` +
    `${MARKETING_TITLES.length} copy titles, ${REAL_TITLES.length} real titles, ${SHAPES.length} shapes)`,
);
process.exitCode = failed > 0 ? 1 : 0;
