// Which leaf category a product belongs to, read out of the text it already
// carries. This exists because sheet-map.ts maps a whole supplier tab to one
// broad department on purpose — the tabs mix sub-types with no per-row
// category column — so a freshly imported product lands on the department
// and stays there. 224 live products were sitting on a department node when
// this was written, 164 of them refrigerators.
//
// Three rules govern everything here, and they were arrived at by running
// the refrigeration department against real data first:
//
//   1. The title wins. When a title says what the product is ("מקרר GENERAL
//      GE83BIX מקפיא עליון 635 ליטר") that is the author naming it.
//   2. The description is the fallback, and a good one: where the title is a
//      bare model code ("סמסונג RT62K7044BS") the description opens with the
//      full name — "מקרר מקפיא עליון סמסונג RT62K7044BS נירוסטה". 14 of
//      those were checked by hand and every one was right.
//   3. Nothing else is a signal. A product with no type in either field is
//      left where it is. Guessing a category is worse than leaving one
//      unset: the flip is effectively permanent, and a wrong leaf is a
//      wrong spec schema and a customer looking at the wrong shelf.
//
// Order is policy. Within a department the first matching rule wins, so the
// list is written most-specific-first, and where two types genuinely
// co-occur the order encodes the decision. Three of those were decided
// against real products:
//
//   • "מקרר מקפיא תחתון 4 דלתות" — 20 products — goes to 4 דלתות. Door
//     count is the axis people shop on, and of the 50 products already in
//     מקפיא תחתון not one mentions 4 doors, so that category already means
//     the classic 2-door in practice. Freezer position survives as a spec.
//   • "מקרר אינטגרלי עם מקפיא תחתון" goes to אינטגרלי: built-in is a
//     kitchen-cabinet constraint and it decides the purchase.
//   • "מקרר יין אינטגרלי" goes to יינות, which also keeps the Le Imperial
//     line together — its JCF201 had already landed there from its title.

export type CategoryRule = { slug: string; match: RegExp };

export type Classification = {
  /** null when nothing in the text names a type. */
  slug: string | null;
  from: "title" | "description" | null;
  /** Other leaves whose rules also matched, lower priority. Worth a look. */
  alsoMatched: string[];
};

// Written from the real leaf names in category-tree.ts plus the wording that
// actually turns up in this catalog. Only refrigeration has been validated
// against live product text; the rest are a first pass, which is exactly
// what the script's dry run is for.
export const CATEGORY_RULES: Record<string, CategoryRule[]> = {
  refrigeration: [
    { slug: "wine-fridge", match: /מקרר יין|יינות/ },
    { slug: "mini-fridge", match: /משרדי|מיני ?בר|מקרר קובייה/ },
    { slug: "fridge-integrated", match: /אינטגרלי/ },
    { slug: "fridge-side-by-side", match: /side by side|דלת לצד דלת|\bSBS\b/i },
    { slug: "fridge-4-door", match: /4 דלתות|ארבע דלתות/ },
    { slug: "fridge-3-door", match: /3 דלתות|שלוש דלתות/ },
    { slug: "fridge-top-freezer", match: /מקפיא עליון/ },
    { slug: "fridge-bottom-freezer", match: /מקפיא תחתון/ },
    // Only a freezer when it is not also a fridge — "מקפיא עומד מילה".
    { slug: "freezers", match: /^(?![\s\S]*מקרר)[\s\S]*מקפיא/ },
  ],

  laundry: [
    { slug: "washer-dryer-combo", match: /משולבת? מייבש|כביסה ומייבש|washer.?dryer/i },
    { slug: "dryers", match: /מייבש כביסה|מייבש פתח/ },
    { slug: "washing-machines", match: /מכונ(ת|ות) כביסה/ },
  ],

  dishwashers: [
    { slug: "dishwasher-fully-integrated", match: /אינטגרלי מלא|אינטגרלי לחלוטין/ },
    { slug: "dishwasher-semi-integrated", match: /חצי אינטגרלי|סמי.?אינטגרלי/ },
    { slug: "dishwasher-standard", match: /מדיח/ },
  ],

  "ovens-cooktops": [
    { slug: "range-hoods", match: /קולט(י)? אדים|מנדף/ },
    { slug: "induction-cooktops", match: /אינדוקציה/ },
    { slug: "ceramic-cooktops", match: /קרמי(ות|ת)?/ },
    { slug: "gas-cooktops", match: /כיריים[\s\S]*גז|גז[\s\S]*כיריים/ },
    { slug: "combi-oven", match: /תנור משולב|משולב מיקרוגל/ },
    { slug: "built-in-oven", match: /תנור בנוי|תנור אפייה|\bתנור\b/ },
  ],

  "air-conditioning": [
    { slug: "portable-ac", match: /נייד/ },
    { slug: "central-ac", match: /מיני.?מרכזי|מרכזי/ },
    { slug: "split-ac", match: /עילי|מזגן/ },
  ],

  "heating-ventilation": [
    { slug: "ceiling-fans", match: /מאוורר(י)? תקרה/ },
    { slug: "heat-fans", match: /מפזר(י)? חום/ },
    { slug: "fans", match: /מאוורר/ },
    { slug: "radiators", match: /רדיאטור/ },
    { slug: "heating-blankets", match: /סדין חימום|שמיכה חשמלית|מזרן חימום/ },
    { slug: "heaters", match: /תנור(י)? חימום|תנור הסקה/ },
  ],

  "personal-care": [
    { slug: "hair-dryers", match: /מייבש שיער|מפוח שיער/ },
    { slug: "hair-straighteners", match: /מחליק שיער|מייש(ר|ב) שיער/ },
    { slug: "hair-curlers", match: /מסלסל/ },
    { slug: "epilators", match: /מסיר שיער|אפילטור/ },
    { slug: "hair-clippers", match: /מכונ(ת|ות) תספורת|טרימר|קוצץ שיער|מכונת גילוח לגוף/ },
    { slug: "shavers", match: /מכונ(ת|ות) גילוח|מכונת גילוח/ },
  ],

  "small-kitchen-appliances": [
    { slug: "toaster-ovens", match: /טוסטר אובן/ },
    { slug: "sandwich-toasters", match: /טוסטר לחיצה|סנדוויץ/ },
    { slug: "pop-up-toasters", match: /טוסטר קופץ|מצנם/ },
    { slug: "coffee-grinders", match: /מטחנ(ת|ות) (קפה|תבלינים)/ },
    { slug: "meat-grinders", match: /מטחנ(ת|ות) בשר/ },
    { slug: "milk-frothers", match: /מקציף חלב/ },
    { slug: "coffee-machines", match: /מכונ(ת|ות) (אספרסו|קפה)|אספרסו/ },
    { slug: "microwaves", match: /מיקרוגל/ },
    { slug: "kettles", match: /קומקום|מיחם/ },
    { slug: "hot-plates", match: /פלט(ה|ת) ל?שבת|כירה חשמלית|פלטה חשמלית|כירה אינדוקציה/ },
    { slug: "air-fryers", match: /אייר ?פריי?ר|air ?fryer|סיר טיגון|סיר בישול/i },
    { slug: "bread-makers", match: /אופה לחם|נפת קמח/ },
    { slug: "juicers", match: /מסחט(ה|ת)/ },
    { slug: "food-processors", match: /מעבד(י)? מזון|קוצץ/ },
    { slug: "blenders", match: /בלנדר/ },
    { slug: "mixers", match: /מיקסר/ },
  ],

  "home-appliances": [
    { slug: "vacuum-cleaners", match: /שואב(י)? אבק|מכונ(ת|ות) שטיפה/ },
    { slug: "irons", match: /מגהץ|גיהוץ/ },
    { slug: "mosquito-killers", match: /קטל(ן|י)? יתושים/ },
    { slug: "water-dispensers", match: /בר מים/ },
    { slug: "smart-lighting", match: /\bHue\b|תאורה חכמה/i },
  ],

  "tv-multimedia": [
    { slug: "projector-screens", match: /מסך למקרן|מסכים למקרנים|מסך הקרנה/ },
    { slug: "tv-mounts", match: /מתקן(י)? תלי{1,2}ה|זרוע לטלוויזיה/ },
    { slug: "tv-stands", match: /שולחן טלוויזיה|מעמד לטלוויזיה/ },
    { slug: "projectors", match: /מקרן(?! קול)/ },
    { slug: "tvs", match: /טלוויזיה|טלוויזיות|\bTV\b/i },
  ],

  "audio-home-theater": [
    { slug: "soundbars", match: /מקרן קול|סאונד ?בר|sound ?bar/i },
    { slug: "subwoofers", match: /סאב ?וופר|subwoofer/i },
    { slug: "portable-speakers", match: /רמקול נייד|בידורית/ },
    { slug: "receivers-amplifiers", match: /רסיבר|מגבר/ },
    { slug: "headphones", match: /אוזניות/ },
    { slug: "bluray-streamers", match: /בלו.?ריי|blu.?ray|סטרימר|\bDVD\b/i },
    { slug: "cables", match: /\bכבל|חיווט/ },
    { slug: "speakers", match: /רמקול/ },
  ],

  "computers-communication": [
    { slug: "gaming-consoles", match: /קונסול|playstation|פלייסטיישן|xbox|nintendo/i },
    { slug: "security-cameras", match: /מצלמ(ת|ות) אבטחה/ },
    { slug: "cordless-phones", match: /טלפון(ים)? אלחוטי/ },
    { slug: "landline-phones", match: /טלפון(ים)? שולחני/ },
    { slug: "tablets", match: /טאבלט/ },
  ],
};

export function classifyProduct(
  departmentSlug: string,
  title: string,
  description: string,
): Classification {
  const rules = CATEGORY_RULES[departmentSlug];
  if (!rules) return { slug: null, from: null, alsoMatched: [] };

  for (const source of ["title", "description"] as const) {
    const text = source === "title" ? title : description;
    if (!text) continue;
    const hits = rules.filter((r) => r.match.test(text)).map((r) => r.slug);
    if (hits.length > 0) {
      return { slug: hits[0], from: source, alsoMatched: hits.slice(1) };
    }
  }
  return { slug: null, from: null, alsoMatched: [] };
}
