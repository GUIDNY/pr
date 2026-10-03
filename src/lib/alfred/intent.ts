/**
 * What is the customer actually shopping for?
 *
 * Alfred's product search used to be a substring match over titles, and a
 * substring has no idea what a word means. Asked for a מקרן (projector) it
 * found eight soundbars (מקרן קול), three patio heaters (מקרן חום) and the
 * two real projectors, ranked the biggest group first, and the model —
 * handed six soundbars as "examples" — told the customer the shop sells no
 * projectors. Asked next for "the cheapest fridge", it searched the whole
 * conversation's words at once and answered with range hoods.
 *
 * This file is the step that was missing: read the customer's words and
 * decide, before any query runs, which shelf of the shop they mean, which
 * brand if they named one, what they are willing to spend, and whether they
 * asked for the cheapest or the most popular thing on that shelf. The search
 * then runs inside that answer instead of across the whole catalogue.
 *
 * It is a lexicon, not a model call. Every entry below is a real category
 * slug from CATEGORY_TREE, and the Hebrew next to it is how customers write
 * that category: singular, plural, construct form, with a ו/ה/ל/ב/מ/ש prefix
 * glued on, in English, misspelled the usual way. Resolving it is a table
 * lookup, which means it is instant, it costs nothing per message, and when
 * it is wrong the fix is one line here rather than a prompt to re-tune.
 *
 * The rules of the match:
 *
 *   - Longest phrase wins. "מקרן קול" is two words and names a soundbar;
 *     "מקרן" alone is a projector; "מקרן חום" is a heater. A one-word entry
 *     never beats a two-word one that also matched.
 *   - The latest message decides. A customer who asked about projectors and
 *     then says "actually, the cheapest fridge" has changed the subject, and
 *     nothing from the projector turn is allowed to leak into the fridge
 *     answer. Only when the latest message names no category at all does the
 *     resolver look back — because a shopper narrowing down ("4 דלתות",
 *     "עד 5000 שקל") does not repeat what they are shopping for.
 *   - Words are compared by stem. Hebrew glues prefixes to the front
 *     (לטלוויזיה, ומקרר, שהמדיח) and endings to the back (מכונת/מכונה/
 *     מכונות, מקרן/מקרנים/מקרני). Both sides are reduced the same way before
 *     they are compared, so the lexicon lists one form and matches them all.
 *
 * `npm run check:alfred` runs the cases that have gone wrong in production,
 * with no database and no network.
 */

import { CATEGORY_TREE } from "@/lib/category-tree";
import { parseShoppingQuery } from "@/lib/shopping-query";

export type ChatSort = "cheapest" | "priciest" | "popular";

export type ShoppingIntent = {
  /** Category slugs to search within — a leaf, or every leaf of a
      department. Empty when no category could be read from the words. */
  categorySlugs: string[];
  /** The customer-facing name of what was resolved ("מקרנים"), for the
      prompt. */
  categoryLabel: string | null;
  /** Brand names exactly as stored on Brand rows, when a brand was named. */
  brandNames: string[];
  brandLabel: string | null;
  maxPrice: number | null;
  sort: ChatSort | null;
  /** The words left after category, brand, price and filler are removed —
      what the row scorer still has to work with ("65", "אינץ", "שקט"). */
  words: string[];
};

/* ------------------------------------------------------------------------
   The lexicon. Slug → the phrases customers use for it.

   A phrase may map to more than one slug when the shop files the thing in
   more than one place: soundbars have a category of their own and are also
   sold under רמקולים, so "סאונדבר" searches both and the scorer sorts them
   out. Department slugs (refrigeration, laundry…) expand to all their leaves.
   ------------------------------------------------------------------------ */
type LexiconEntry = { slugs: string[]; phrases: string[] };

const LEXICON: LexiconEntry[] = [
  // --- טלוויזיות ומולטימדיה
  {
    slugs: ["tvs"],
    phrases: [
      "טלוויזיה", "טלויזיה", "טלוויזיות", "טלוויזיא", "טלביזיה", "מסך טלוויזיה", "מסכי טלוויזיה",
      "סמארט טיוי", "סמארט tv", "tv", "television", "oled", "qled", "אולד", "מסך",
    ],
  },
  {
    slugs: ["projectors"],
    phrases: [
      "מקרן", "מקרנים", "מקרן וידאו", "מקרן ביתי", "מקרן קולנוע", "מקרן לסרטים", "מקרן סרטים",
      "פרוג'קטור", "פרוז'קטור", "פרוגקטור", "פרוזקטור", "projector", "beamer",
    ],
  },
  { slugs: ["projector-screens"], phrases: ["מסך הקרנה", "מסך למקרן", "מסכים למקרנים", "מסך מקרן", "projector screen"] },
  {
    slugs: ["tv-mounts"],
    phrases: ["מתקן תליה", "מתקני תליה", "מתקן תלייה", "זרוע", "זרוע לטלוויזיה", "מתקן קיר", "מתקן לטלוויזיה", "wall mount", "mount"],
  },
  { slugs: ["tv-stands"], phrases: ["שולחן טלוויזיה", "שולחנות טלוויזיה", "מעמד טלוויזיה", "מעמד", "מזנון"] },

  // --- סטריאו וקולנוע ביתי
  {
    slugs: ["soundbars", "speakers"],
    phrases: ["מקרן קול", "מקרני קול", "סאונדבר", "סאונד בר", "סאונדבאר", "soundbar", "sound bar"],
  },
  { slugs: ["speakers", "portable-speakers"], phrases: ["רמקול", "רמקולים", "speaker", "speakers", "בידורית", "רמקול נייד", "רמקול בלוטוס", "רמקול bluetooth"] },
  { slugs: ["subwoofers", "speakers"], phrases: ["סאב", "סאבוופר", "סאב וופר", "סאב-וופר", "subwoofer", "sub"] },
  { slugs: ["receivers-amplifiers"], phrases: ["רסיבר", "רסיברים", "מגבר", "מגברים", "receiver", "amplifier", "amp"] },
  { slugs: ["headphones"], phrases: ["אוזניות", "אוזניה", "headphones", "earbuds", "אירפודס"] },
  { slugs: ["bluray-streamers"], phrases: ["סטרימר", "בלוריי", "blu-ray", "bluray", "dvd", "נגן dvd", "נגן"] },
  { slugs: ["cables", "av-accessories"], phrases: ["כבל", "כבלים", "hdmi", "חיווט", "מפצל", "מתאם"] },
  { slugs: ["microphones"], phrases: ["מיקרופון", "מיקרופונים", "microphone", "mic"] },

  // --- מקררים וקירור
  { slugs: ["refrigeration"], phrases: ["מקרר", "מקררים", "fridge", "refrigerator", "קירור"] },
  { slugs: ["freezers"], phrases: ["מקפיא", "מקפיאים", "freezer", "ארון קפאון"] },
  { slugs: ["fridge-top-freezer"], phrases: ["מקפיא עליון", "מקרר מקפיא עליון", "top freezer"] },
  { slugs: ["fridge-bottom-freezer"], phrases: ["מקפיא תחתון", "מקרר מקפיא תחתון", "bottom freezer"] },
  { slugs: ["fridge-side-by-side"], phrases: ["דלת לצד דלת", "side by side", "sbs", "מקרר sbs"] },
  { slugs: ["fridge-4-door"], phrases: ["4 דלתות", "ארבע דלתות", "5 דלתות", "חמש דלתות", "french door", "מקרר צרפתי"] },
  { slugs: ["fridge-3-door"], phrases: ["3 דלתות", "שלוש דלתות"] },
  { slugs: ["fridge-integrated"], phrases: ["מקרר אינטגרלי", "אינטגרלי", "מקרר מובנה", "built in fridge"] },
  { slugs: ["wine-fridge"], phrases: ["מקרר יין", "מקרר יינות", "יין", "יינות", "wine"] },
  { slugs: ["mini-fridge"], phrases: ["מקרר משרדי", "מקרר למשרד", "מיני בר", "מיניבר", "מקרר קטן", "מקרר מיני", "minibar", "mini bar"] },

  // --- כביסה, ייבוש ומדיחים
  { slugs: ["laundry"], phrases: ["כביסה"] },
  { slugs: ["washing-machines"], phrases: ["מכונת כביסה", "מכונות כביסה", "מכונה לכביסה", "washing machine", "washer", "פתח עליון", "פתח קדמי"] },
  { slugs: ["dryers"], phrases: ["מייבש", "מייבשים", "מייבש כביסה", "מיבש", "dryer"] },
  { slugs: ["washer-dryer-combo", "washing-machines"], phrases: ["משולבת מייבש", "מכונה משולבת", "כביסה ומייבש", "washer dryer"] },
  {
    slugs: ["dishwasher-standard", "dishwasher-fully-integrated", "dishwasher-semi-integrated"],
    phrases: ["מדיח", "מדיחים", "מדיח כלים", "מדיחי כלים", "dishwasher"],
  },
  { slugs: ["dishwasher-fully-integrated", "dishwasher-semi-integrated"], phrases: ["מדיח אינטגרלי", "מדיח מובנה"] },

  // --- תנורים וכיריים
  { slugs: ["built-in-oven", "combi-oven"], phrases: ["תנור", "תנורים", "תנור אפיה", "תנור אפייה", "oven"] },
  { slugs: ["built-in-oven"], phrases: ["תנור בנוי", "תנור מובנה", "built in oven"] },
  { slugs: ["combi-oven"], phrases: ["תנור משולב", "תנור משולב כיריים", "תנור עם כיריים"] },
  { slugs: ["gas-cooktops", "induction-cooktops", "ceramic-cooktops", "hybrid-cooktops"], phrases: ["כיריים", "כירים", "cooktop", "hob"] },
  { slugs: ["gas-cooktops"], phrases: ["כיריים גז", "גז", "כיריים גאז"] },
  { slugs: ["induction-cooktops"], phrases: ["אינדוקציה", "כיריים אינדוקציה", "induction"] },
  { slugs: ["ceramic-cooktops"], phrases: ["כיריים קרמיות", "קרמיות", "קרמי", "ceramic"] },
  { slugs: ["hybrid-cooktops"], phrases: ["גז ואינדוקציה", "משולבות גז"] },
  { slugs: ["range-hoods"], phrases: ["קולט אדים", "קולטי אדים", "קולט", "hood", "range hood"] },
  { slugs: ["warming-drawers"], phrases: ["מגירת חימום", "מגירות חימום", "warming drawer"] },

  // --- מוצרי חשמל למטבח
  { slugs: ["microwaves"], phrases: ["מיקרוגל", "מיקרוגלים", "מיקרו", "microwave"] },
  { slugs: ["kettles"], phrases: ["קומקום", "קומקומים", "מיחם", "מיחמים", "kettle"] },
  { slugs: ["toaster-ovens", "pop-up-toasters", "sandwich-toasters"], phrases: ["טוסטר", "טוסטרים", "toaster"] },
  { slugs: ["toaster-ovens"], phrases: ["טוסטר אובן", "טוסטר אופן", "toaster oven"] },
  { slugs: ["pop-up-toasters"], phrases: ["מצנם", "טוסטר קופץ"] },
  { slugs: ["sandwich-toasters"], phrases: ["טוסטר לחיצה", "טוסטר טוסטים"] },
  { slugs: ["coffee-machines"], phrases: ["מכונת קפה", "מכונות קפה", "מכונת אספרסו", "אספרסו", "קפה", "נספרסו", "coffee", "espresso", "nespresso"] },
  { slugs: ["coffee-grinders"], phrases: ["מטחנת קפה", "מטחנת תבלינים", "coffee grinder"] },
  { slugs: ["blenders", "food-processors"], phrases: ["בלנדר", "בלנדרים", "blender", "שייקר", "נוטריבולט"] },
  { slugs: ["food-processors"], phrases: ["מעבד מזון", "מעבדי מזון", "קוצץ", "קוצץ ירקות", "food processor", "chopper", "מרסק"] },
  { slugs: ["mixers", "food-processors"], phrases: ["מיקסר", "מיקסרים", "mixer", "מיקסר ידני"] },
  { slugs: ["juicers"], phrases: ["מסחטה", "מסחטת מיץ", "מסחטות", "מסחטת הדרים", "juicer"] },
  { slugs: ["meat-grinders"], phrases: ["מטחנת בשר", "מטחנות בשר", "meat grinder"] },
  { slugs: ["air-fryers"], phrases: ["סיר טיגון", "סירי טיגון", "אייר פרייר", "אירפרייר", "אייר-פרייר", "air fryer", "airfryer", "טיגון ללא שמן", "סיר בישול"] },
  { slugs: ["milk-frothers"], phrases: ["מקציף חלב", "מקציף", "milk frother"] },
  { slugs: ["hot-plates"], phrases: ["פלטה", "פלטת שבת", "פלטה חשמלית", "כירה", "כירה חשמלית", "hot plate"] },
  { slugs: ["bread-makers"], phrases: ["אופה לחם", "נפת קמח", "bread maker"] },

  // --- מוצרי חשמל לבית
  {
    slugs: ["vacuum-cleaners"],
    phrases: ["שואב אבק", "שואבי אבק", "שואב", "רובוט שואב", "שואב רובוטי", "שואב אלחוטי", "מכונת שטיפה", "שוטף רצפות", "vacuum", "robot vacuum"],
  },
  { slugs: ["irons"], phrases: ["מגהץ", "מגהצים", "גיהוץ", "מגהץ אדים", "iron", "steam iron"] },
  { slugs: ["water-dispensers", "water-taps"], phrases: ["בר מים", "ברי מים", "מתקן מים", "ברז מים", "ברז", "תמי 4", "water bar", "water dispenser"] },
  { slugs: ["tabuns"], phrases: ["טאבון", "טאבונים", "tabun"] },
  { slugs: ["grills"], phrases: ["מנגל", "גריל", "מטבח חוץ", "bbq", "grill"] },
  { slugs: ["smart-lighting"], phrases: ["תאורה חכמה", "נורה חכמה", "נורות חכמות", "hue", "תאורה"] },
  { slugs: ["mosquito-killers"], phrases: ["קוטל יתושים", "יתושים", "mosquito"] },

  // --- חימום ואוורור
  { slugs: ["fans", "ceiling-fans"], phrases: ["מאוורר", "מאווררים", "מאורר", "fan"] },
  { slugs: ["ceiling-fans"], phrases: ["מאוורר תקרה", "מאווררי תקרה", "ceiling fan"] },
  {
    slugs: ["heaters", "heat-fans", "radiators"],
    phrases: ["תנור חימום", "תנורי חימום", "מחמם", "חימום", "מקרן חום", "מקרן חימום", "מקרני חום", "heater", "מחמם חלל"],
  },
  { slugs: ["heat-fans"], phrases: ["מפזר חום", "מפזרי חום", "fan heater"] },
  { slugs: ["radiators"], phrases: ["רדיאטור", "רדיאטורים", "radiator"] },
  { slugs: ["heating-blankets"], phrases: ["סדין חימום", "שמיכה חשמלית", "שמיכת חימום", "heating blanket"] },

  // --- מיזוג אוויר
  { slugs: ["air-conditioning"], phrases: ["מזגן", "מזגנים", "מיזוג", "מיזוג אוויר", "air conditioner", "ac"] },
  { slugs: ["portable-ac"], phrases: ["מזגן נייד", "מזגנים ניידים", "portable ac"] },
  { slugs: ["central-ac"], phrases: ["מיני מרכזי", "מזגן מרכזי", "מיני-מרכזי"] },
  { slugs: ["split-ac"], phrases: ["מזגן עילי", "מזגנים עיליים", "עילי", "split"] },

  // --- טיפוח אישי
  { slugs: ["personal-care"], phrases: ["טיפוח", "שיער"] },
  { slugs: ["shavers"], phrases: ["מכונת גילוח", "מכונות גילוח", "גילוח", "shaver", "מגלח"] },
  { slugs: ["hair-clippers"], phrases: ["מכונת תספורת", "מכונות תספורת", "תספורת", "קוצץ זקן", "טרימר", "trimmer", "clipper"] },
  { slugs: ["hair-straighteners"], phrases: ["מחליק שיער", "מחליק", "מחליקים", "straightener"] },
  { slugs: ["hair-dryers"], phrases: ["מייבש שיער", "מייבשי שיער", "פן לשיער", "hair dryer"] },
  { slugs: ["hair-curlers"], phrases: ["מסלסל", "מסלסל שיער", "curler"] },
  { slugs: ["epilators"], phrases: ["מסיר שיער", "אפילטור", "epilator"] },

  // --- מחשבים ותקשורת
  { slugs: ["tablets"], phrases: ["טאבלט", "טאבלטים", "tablet", "אייפד", "ipad"] },
  { slugs: ["gaming-consoles"], phrases: ["קונסולה", "קונסולת משחק", "קונסולות", "פלייסטיישן", "playstation", "ps5", "xbox", "נינטנדו", "nintendo", "switch"] },
  { slugs: ["security-cameras"], phrases: ["מצלמת אבטחה", "מצלמות אבטחה", "מצלמה", "security camera"] },
  { slugs: ["cordless-phones"], phrases: ["טלפון אלחוטי", "טלפונים אלחוטיים"] },
  { slugs: ["landline-phones"], phrases: ["טלפון שולחני", "טלפון קווי"] },

  // --- אביזרים לרכב
  { slugs: ["car-accessories"], phrases: ["לרכב", "רכב", "לאוטו", "אוטו"] },
];

/* Brands as customers type them in Hebrew → the Latin name on the Brand
   row. Rows whose own name is Hebrew (טורנדו, אמקור) match directly and
   need no entry. */
const BRAND_ALIASES: Record<string, string> = {
  "בוש": "Bosch",
  "סמסונג": "Samsung",
  "סאמסונג": "Samsung",
  "אלג'י": "LG",
  "אל ג'י": "LG",
  "אלגי": "LG",
  "סימנס": "Siemens",
  "זימנס": "Siemens",
  "מילה": "Miele",
  "מיאלה": "Miele",
  "האייר": "Haier",
  "הייסנס": "Hisense",
  "אלקטרולוקס": "Electrolux",
  "גורנייה": "Gorenje",
  "גורניה": "Gorenje",
  "בלומברג": "Blomberg",
  "סאוטר": "Sauter",
  "דייסון": "Dyson",
  "שארפ": "Sharp",
  "יונדאי": "Hyundai",
  "נינג'ה": "NINJA",
  "נינגה": "NINJA",
  "דלונגי": "De'Longhi",
  "דה לונגי": "De'Longhi",
  "סוני": "Sony",
  "פיליפס": "Philips",
  "מידאה": "Midea",
  "סמג": "SMEG",
  "קנווד": "Kenwood",
  "בראון": "Braun",
  "טפאל": "Tefal",
  "היטאצ'י": "Hitachi",
  "היטאצי": "Hitachi",
  "בקו": "Beko",
  "ליבהר": "Liebherr",
  "לייבהר": "Liebherr",
  "קונסטרוקטה": "Constructa",
  "באוקנכט": "Bauknecht",
  "זנוסי": "Zanussi",
  "מורפי ריצ'רדס": "Morphy Richards",
  "מורפי ריצארדס": "Morphy Richards",
  "מורפי": "Morphy Richards",
  "מורפי ריצארד": "Morphy Richards",
  "פראטלי": "Fratelli",
  "שיאומי": "Xiaomi",
  "רובורוק": "roborock",
  "ג'נרל": "GENERAL",
  "גנרל": "GENERAL",
  "ברטזוני": "Bertazzoni",
  "אליקה": "Elica",
  "פאבר": "FABER",
  "וסטינגהאוס": "Westinghouse",
  "שארק": "Shark",
  "דרים": "Dreame",
  "ג'יי בי אל": "JBL",
  "קליפש": "Klipsch",
  "אונקיו": "ONKYO",
  "דנון": "Denon",
  "וויויטק": "VIVITEK",
  "ויויטק": "VIVITEK",
  "רמינגטון": "Remington",
  "קיצ'נאייד": "KitchenAid",
  "מג'ימיקס": "Magimix",
  "מולינקס": "Moulinex",
  "רוונטה": "Rowenta",
  "טקה": "TEKA",
  "קנדי": "CANDY",
  "אסקו": "ASKO",
  "לופרה": "Lofra",
};

/* The same filler the route used to strip, kept in one place now. Words
   that describe the shopper's situation, never the thing they want. Any of
   these surviving into the scorer matches most of a catalogue full of
   "חדש בקטלוג" and "מוצרי חשמל לבית". */
const FILLER = new Set([
  "משלוח", "המשלוח", "משלוחים", "המשלוחים", "לשלוח", "שליח", "שילוח",
  "אחריות", "האחריות", "אחריותה", "תשלום", "התשלום", "לשלם", "תשלומים",
  "החזרה", "החזרות", "להחזיר", "ביטול", "לבטל", "זיכוי", "החלפה", "להחליף",
  "הזמנה", "ההזמנה", "הזמנות", "להזמין", "מחיר", "המחיר", "מחירים",
  "חשבונית", "קבלה", "מבצע", "מבצעים", "הנחה", "הנחות", "קופון",
  "חנות", "החנות", "סניף", "סניפים", "כתובת", "הכתובת", "טלפון", "הטלפון",
  "שעות", "פתוח", "סגור", "שירות", "השירות", "לקוחות", "עסקים",
  "שלכם", "שלכן", "שלנו", "אצלכם", "איפה", "מתי", "כמה", "למה", "איך",
  "אפשר", "אפשרי", "רוצה", "רציתי", "מחפש", "מחפשת", "צריך", "צריכה",
  "תוכל", "תוכלי", "יכול", "יכולה", "בבקשה", "תודה", "שלום", "היי",
  "שאלה", "שאלות", "לשאול", "לדעת", "להבין", "עוזר", "לעזור", "עזרה",
  "יום", "ימים", "שבוע", "שבועות", "חודש", "חודשים", "היום", "מחר",
  "זמן", "הזמן", "זמנים", "זמני", "לוקח", "לוקחת", "מגיע", "מגיעה", "מגיעים",
  "עולה", "עולים", "עולות", "כולל", "כוללת", "נמצא", "קיים", "זמין", "זמינות",
  "חדש", "חדשה", "חדשים", "ישן", "ישנה", "לבית", "בבית", "הבית", "לדירה",
  "בשביל", "עבור", "טוב", "טובה", "טובים", "הכי", "ממליץ", "ממליצים", "המלצה",
  "משהו", "כזה", "כזאת", "איזה", "איזו", "בערך", "אולי", "צריכים", "רוצים",
  "אני", "אתה", "אתם", "הוא", "היא", "זה", "זאת", "את", "של", "עם", "על", "גם",
  "אבל", "או", "לא", "כן", "יש", "אין", "מה", "מי", "רק", "עוד", "כבר", "שוב",
  "זול", "זולה", "זולים", "זולות", "יקר", "יקרה", "ביותר", "הזול", "היקר",
  "לסלון", "לחדר", "למטבח", "למשרד", "לילדים", "שקל", "שקלים", "תקציב", "בתקציב",
  "קטן", "קטנה", "גדול", "גדולה", "בינוני", "איכותי", "איכותית", "מומלץ", "מומלצת",
  "לקנות", "קנייה", "לרכוש", "רכישה", "מעוניין", "מעוניינת", "מתאים", "מתאימה",
  "חשוב", "חשובה", "לי", "לך", "לנו", "להם", "שלי", "שלך", "יהיה", "תהיה", "היה", "להיות",
  "אם", "כי", "מאוד", "ממש", "קצת", "הרבה", "בדיוק", "בכלל", "אז", "אח", "נראה", "לראות",
  "תראה", "תראי", "תגיד", "תני", "תן", "אשמח", "מעדיף", "מעדיפה", "יותר", "פחות", "בין",
  "מומלצים", "מומלצות", "הזולים", "היקרים", "בטח", "סבבה", "אוקיי", "אוקי", "ok",
]);

/* ------------------------------------------------------------------------
   Hebrew word handling
   ------------------------------------------------------------------------ */

const FINAL_LETTERS: Record<string, string> = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };
const HEBREW = /[א-ת]/;

/** Lower-case, drop quotes, niqqud and punctuation, keep letters/digits. */
export function cleanToken(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[֑-ׇ]/g, "")
    .replace(/["'״׳`’‘]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

export function tokenize(text: string): string[] {
  return text
    .split(/[\s,.;:!?()\[\]{}/\\|<>]+/)
    .map(cleanToken)
    .filter((t) => t.length > 0);
}

/** Reduce a Hebrew word to a stem that its singular, plural, feminine and
    construct forms share: מכונת/מכונה/מכונות → מכונ, מקרן/מקרנים/מקרני →
    מקרנ. Latin words are returned as they are. */
export function stem(token: string): string {
  if (!HEBREW.test(token)) return token;
  /* Endings first, finals after: "מקרנים" ends in a final mem, and
     normalising it to a plain one before looking for "ים" would hide the
     very ending being looked for. */
  let t = token;
  const cut = (suffixes: string[]) => {
    for (const s of suffixes) {
      if (t.endsWith(s) && t.length - s.length >= 2) {
        t = t.slice(0, -s.length);
        return;
      }
    }
  };
  cut(["יים", "ים", "ות", "יות"]);
  cut(["ה", "ת"]);
  cut(["י"]);
  return t.replace(/[ךםןףץ]/g, (ch) => FINAL_LETTERS[ch]);
}

/** Every reading of a customer's word once the glued-on prefixes are
    considered: "ולמקרר" is also "למקרר", "מקרר". The bare word always
    comes first. */
function prefixVariants(token: string): string[] {
  if (!HEBREW.test(token)) return [token];
  const out = [token];
  let t = token;
  if (t.startsWith("ו") && t.length > 2) {
    t = t.slice(1);
    out.push(t);
  }
  if (/^[הלבמשכ]/.test(t) && t.length > 2) {
    t = t.slice(1);
    out.push(t);
  }
  if (t.startsWith("ה") && t.length > 2) {
    out.push(t.slice(1));
  }
  return out;
}

type Phrase = { stems: string[]; entry: number };

function phraseStems(phrase: string): string[] {
  return tokenize(phrase).map(stem);
}

const CATEGORY_PHRASES: Phrase[] = LEXICON.flatMap((entry, i) =>
  entry.phrases.map((p) => ({ stems: phraseStems(p), entry: i }))
);

/** Does the lexicon phrase sit at position `at` of the customer's words? */
function phraseAt(tokenStems: string[][], at: number, phrase: string[]): boolean {
  if (at + phrase.length > tokenStems.length) return false;
  for (let k = 0; k < phrase.length; k++) {
    if (!tokenStems[at + k].includes(phrase[k])) return false;
  }
  return true;
}

type Match = { entry: number; start: number; length: number };

/** Every lexicon phrase found in the text, longest first, earliest first. */
function findCategoryMatches(tokens: string[]): Match[] {
  const tokenStems = tokens.map((t) => prefixVariants(t).map(stem));
  const matches: Match[] = [];
  for (const phrase of CATEGORY_PHRASES) {
    for (let i = 0; i < tokens.length; i++) {
      if (phraseAt(tokenStems, i, phrase.stems)) {
        matches.push({ entry: phrase.entry, start: i, length: phrase.stems.length });
      }
    }
  }
  return matches.sort((a, b) => b.length - a.length || a.start - b.start);
}

/* Department slug → its leaves, so "מקרר" searches every fridge shelf. */
const DEPARTMENT_LEAVES = new Map<string, string[]>(
  CATEGORY_TREE.map((d) => [d.slug, d.children.map((c) => c.slug)])
);
const CATEGORY_NAMES = new Map<string, string>(
  CATEGORY_TREE.flatMap((d) => [[d.slug, d.name] as [string, string], ...d.children.map((c) => [c.slug, c.name] as [string, string])])
);

function expandSlugs(slugs: string[]): string[] {
  const out = new Set<string>();
  for (const s of slugs) {
    const leaves = DEPARTMENT_LEAVES.get(s);
    if (leaves) leaves.forEach((l) => out.add(l));
    else out.add(s);
  }
  return [...out];
}

function labelFor(slugs: string[]): string {
  return CATEGORY_NAMES.get(slugs[0]) ?? slugs[0];
}

/* ------------------------------------------------------------------------
   Sort, brand
   ------------------------------------------------------------------------ */

/* \b does not understand Hebrew letters in JS, so boundaries are spaces. */
const SORT_PATTERNS: { sort: ChatSort; re: RegExp }[] = [
  { sort: "cheapest", re: /(^|\s)(הכי זול|הזול(ה|ים|ות)? ביותר|זול(ה|ים|ות)? ביותר|במחיר הנמוך|הנמוך ביותר|הכי זולה|הכי זולים|הכי זולות|הזול(ה)?|זול(ה)?|cheapest|cheap)(?=\s|$)/ },
  { sort: "priciest", re: /(^|\s)(הכי יקר(ה)?|היקר(ה)? ביותר|יקר(ה)? ביותר|הכי משובח(ת)?|הכי מתקדם|הכי מתקדמת|premium|most expensive)(?=\s|$)/ },
  { sort: "popular", re: /(^|\s)(הכי נמכר(ת|ים)?|נמכר(ת|ים)? ביותר|פופולרי(ת)?|הכי מבוקש(ת)?|הכי טוב(ה|ים)?|הטוב(ה)? ביותר|מומלץ|מומלצת|best ?seller|the best)(?=\s|$)/ },
];

export function detectSort(text: string): ChatSort | null {
  const flat = text.toLowerCase().replace(/["'״׳]/g, "").replace(/[^\p{L}\p{N}\s]+/gu, " ").replace(/\s+/g, " ").trim();
  for (const { sort, re } of SORT_PATTERNS) if (re.test(flat)) return sort;
  return null;
}

export type BrandRef = { name: string };

type BrandPhrase = { stems: string[]; names: string[]; label: string };

function brandPhrases(brands: BrandRef[]): BrandPhrase[] {
  const byClean = new Map<string, string[]>();
  for (const b of brands) {
    const key = tokenize(b.name).join(" ");
    if (!key) continue;
    byClean.set(key, [...(byClean.get(key) ?? []), b.name]);
  }
  /* Keyed by the phrase, so a Hebrew alias and a Hebrew Brand row that
     happen to be the same word ("בוש" the alias for Bosch, and a stray
     "בוש" brand row with one product) become one phrase that searches
     both rows — not two phrases where the one-product row wins. */
  const byPhrase = new Map<string, BrandPhrase>();
  for (const [key, names] of byClean) {
    byPhrase.set(key, { stems: key.split(" ").map(stem), names, label: names[0] });
  }
  for (const [alias, canonical] of Object.entries(BRAND_ALIASES)) {
    const canonicalKey = tokenize(canonical).join(" ");
    const aliasKey = tokenize(alias).join(" ");
    const names = [...new Set([...(byClean.get(canonicalKey) ?? []), ...(byPhrase.get(aliasKey)?.names ?? [])])];
    if (names.length === 0) continue;
    const label = byClean.get(canonicalKey)?.[0] ?? names[0];
    byPhrase.set(aliasKey, { stems: aliasKey.split(" ").map(stem), names, label });
  }
  return [...byPhrase.values()];
}

/* ------------------------------------------------------------------------
   The resolver
   ------------------------------------------------------------------------ */

export type IntentInput = {
  /** The customer's own messages, newest first. The model's replies are
      never read — one wrong guess would otherwise feed itself. */
  userMessages: string[];
  brands?: BrandRef[];
};

type TurnReading = {
  tokens: string[];
  matches: Match[];
  brand: BrandPhrase | null;
  brandSpan: { start: number; length: number } | null;
  maxPrice: number | null;
};

function readTurn(text: string, brands: BrandPhrase[]): TurnReading {
  const { text: withoutPrice, maxPrice } = parseShoppingQuery(text);
  const tokens = tokenize(withoutPrice);
  const matches = findCategoryMatches(tokens);
  const tokenStems = tokens.map((t) => prefixVariants(t).map(stem));
  let brand: BrandPhrase | null = null;
  let brandSpan: TurnReading["brandSpan"] = null;
  /* Longest brand phrase first, so "morphy richards" beats "morphy". A
     single-letter or two-letter Latin token is never a brand on its own
     ("lg" is the exception and is checked exactly). */
  const ordered = [...brands].sort((a, b) => b.stems.length - a.stems.length);
  outer: for (const b of ordered) {
    for (let i = 0; i < tokens.length; i++) {
      if (phraseAt(tokenStems, i, b.stems)) {
        const joined = b.stems.join("");
        if (!HEBREW.test(joined) && joined.length < 3 && joined !== "lg") continue;
        brand = b;
        brandSpan = { start: i, length: b.stems.length };
        break outer;
      }
    }
  }
  return { tokens, matches, brand, brandSpan, maxPrice };
}

export function resolveIntent(input: IntentInput): ShoppingIntent {
  const brands = brandPhrases(input.brands ?? []);
  const turns = input.userMessages.map((m) => readTurn(m, brands));

  /* The current topic: the newest turn that names a category, and every
     turn after it. Older turns belong to whatever the customer was asking
     before and are not read at all. */
  let topicEnd = turns.findIndex((t) => t.matches.length > 0);
  if (topicEnd === -1) topicEnd = turns.length - 1;
  const topic = turns.slice(0, topicEnd + 1);

  const categoryTurn = topic[topicEnd];
  const best = categoryTurn?.matches[0] ?? null;
  const entry = best ? LEXICON[best.entry] : null;
  const categorySlugs = entry ? expandSlugs(entry.slugs) : [];

  const brandTurn = topic.find((t) => t.brand);
  const brandNames = brandTurn?.brand?.names ?? [];

  const maxPrice = topic.find((t) => t.maxPrice !== null)?.maxPrice ?? null;
  const sort = input.userMessages[0] ? detectSort(input.userMessages[0]) : null;

  /* What is left for the scorer: the topic's words minus the category
     phrase, the brand, filler and anything shorter than two letters. The
     same phrase may sit in several turns ("מקרר" asked twice), so every
     lexicon hit in the topic is removed, not only the winning one. */
  const seen = new Set<string>();
  const words: string[] = [];
  for (const t of topic) {
    const drop = new Set<number>();
    for (const m of t.matches) for (let k = 0; k < m.length; k++) drop.add(m.start + k);
    if (t.brandSpan) for (let k = 0; k < t.brandSpan.length; k++) drop.add(t.brandSpan.start + k);
    t.tokens.forEach((tok, i) => {
      if (drop.has(i) || tok.length < 2 || seen.has(tok)) return;
      /* "וחשוב", "שיהיה", "לי": filler with a prefix glued on is still filler. */
      if (prefixVariants(tok).some((v) => FILLER.has(v))) return;
      if (/^\d+$/.test(tok) && tok.length > 4) return; // a phone number, an order number
      seen.add(tok);
      words.push(tok);
    });
  }

  return {
    categorySlugs,
    categoryLabel: entry ? labelFor(entry.slugs) : null,
    brandNames,
    brandLabel: brandTurn?.brand?.label ?? null,
    maxPrice,
    sort,
    words: words.slice(0, 6),
  };
}
