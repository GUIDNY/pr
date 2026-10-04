/**
 * The brand under every name it is written by.
 *
 * The supplier sheets name a manufacturer in Hebrew more often than not —
 * בוש, סאוטר, גורניה י.שלום — and the import used to take every spelling
 * it had not seen before as a new manufacturer: a Brand row with the Hebrew
 * name and, since Hebrew yields no ASCII slug, a hash for one. The catalogue
 * ended up with 150 of those, three of them carrying live products under
 * /brand/3d59b03762-3d59b0 instead of /brand/sauter, and the cleanup that
 * deactivated the rows did not stop the next sync creating "גורניה  י.שלום"
 * again (it did, on 2 October, with two spaces).
 *
 * This table is the fix at the source: a name is reduced to its canonical
 * Latin form before the resolver looks it up or creates anything. Alfred
 * reads the same table to understand "בוש" in a customer's message, which
 * is why it lives here and not in either caller.
 *
 * Keys are matched after normalisation (quotes dropped, whitespace
 * collapsed, case folded), so "מורפי ריצ'ארד" and "מורפי ריצארד" are one
 * entry. Values are the Brand row's name exactly as stored.
 */
export const BRAND_ALIASES: Record<string, string> = {
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
  // Spellings the supplier sheets have actually produced, each of which
  // became a Brand row of its own with a hash for a slug.
  "סאווטר": "Sauter",
  "שאוב לורנס": "Schaub Lorenz",
  "שאובלורנס": "Schaub Lorenz",
  "מורפי ריצ'ארד": "Morphy Richards",
  "מורפי רציארד": "Morphy Richards",
  "גורניה י.שלום": "Gorenje",
  "פרטאלי": "Fratelli",
  "פריימיר": "Premier",
  "פרימייר": "Premier",
  "לנקו": "Lenco",
  "הייר": "Haier",
  "באוכנקט": "Bauknecht",
  "סמאג": "SMEG",
  "פילפס": "Philips",
  "פליפס": "Philips",
  "טאפל": "Tefal",
  "גרץ": "Graetz",
  "גרצ": "Graetz",
  "המילטון ביץ'": "Hamilton Beach",
  "הימלטון ביץ'": "Hamilton Beach",
  "ראסל הובס": "Russell Hobbs",
  "קיצנאייד": "KitchenAid",
  "בייביליס": "BaByliss",
  "נורמנדה": "Normande",
  "דיטריש": "De Dietrich",
  "שטארק": "Stark",
  "קיצ'נשף": "Kitchen Chef",
  "קיצ'נשיף": "Kitchen Chef",
  "אימפריאל": "Le Imperial",
  "לקאזה": "LaCasa",
  "ליוונט": "Ly Vent",
  "נוביס": "Novis",
  "סטנלי": "Stanley",
  "סמוראי": "Samurai",
  "דאבו": "DAVO",
  "מייסטר": "Meister",
  "מטריקס": "Matrix",
  "ברוויל": "Breville",
  "טופסון": "Topson",
  "לוקסור": "Luxor",
  "ריצ'טק": "Richtek",
  "באוורס ווילקינס": "Bowers & Wilkins",
  "פולק האודיו": "Polk Audio",
  "פיור אקוסטיק": "Pure Acoustics",
  "אומגה": "Omega",
  "קאסו": "CASO",
  "אופסה": "UFESA",
  "ארטרו": "Artero",
  "איווה": "AIWA",
  "רוזייר": "Rosieres",
};

/** The comparison form of a brand name: quotes dropped, whitespace
    collapsed, case folded. Used for alias lookup and for matching a sheet's
    spelling against the rows that exist. */
export function brandKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/["'״׳`’‘]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const ALIAS_BY_KEY = new Map<string, string>(Object.entries(BRAND_ALIASES).map(([alias, name]) => [brandKey(alias), name]));

/** The name a brand should be filed under. Returns the canonical Latin
    name for a known Hebrew or variant spelling, otherwise the input with
    its whitespace tidied. */
export function canonicalBrandName(raw: string): string {
  const tidy = raw.replace(/\s+/g, " ").trim();
  return ALIAS_BY_KEY.get(brandKey(tidy)) ?? tidy;
}
