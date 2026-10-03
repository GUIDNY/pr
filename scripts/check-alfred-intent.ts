/**
 * Alfred reads the customer's words before it searches.
 *
 * Every case here is a conversation that went wrong on the live site, or
 * the obvious neighbour of one. "מקרן" returned soundbars and heaters, and
 * Alfred told a customer the shop sells no projectors; "the cheapest
 * fridge", asked a turn later, searched the whole conversation's words at
 * once and answered with range hoods. The resolver in lib/alfred/intent.ts
 * is what decides the shelf now, and this is the file that keeps it
 * deciding right as the lexicon grows.
 *
 * No database and no network.
 *
 *   npm run check:alfred
 */

import { resolveIntent, detectSort, stem } from "../src/lib/alfred/intent";
import { parseShoppingQuery } from "../src/lib/shopping-query";

let failures = 0;

function is(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  const ok = g === w;
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${ok ? "" : `\n          got  ${g}\n          want ${w}`}`);
}

const brands = [
  { name: "Bosch" },
  { name: "בוש" },
  { name: "Samsung" },
  { name: "LG" },
  { name: "Sauter" },
  { name: "סאוטר" },
  { name: "Morphy Richards" },
  { name: "SOL" },
  { name: "3i" },
  { name: "VIVITEK" },
];

/* newest message first, like the route hands them over */
const resolve = (...messages: string[]) => resolveIntent({ userMessages: messages, brands });

console.log("\nstems");
is("plural", stem("מקרנים"), stem("מקרן"));
is("construct", stem("מקרני"), stem("מקרן"));
is("feminine forms", [stem("מכונת"), stem("מכונות")], [stem("מכונה"), stem("מכונה")]);
is("tv forms", stem("טלוויזיות"), stem("טלוויזיה"));
is("projector and fridge stay apart", stem("מקרן") === stem("מקרר"), false);

console.log("\nthe projector conversation");
is("מקרן is a projector, not a soundbar", resolve("מקרן").categorySlugs, ["projectors"]);
is("with a budget", resolve("אני מחפש מקרן לסרטים בתקציב של 1,990 ₪").maxPrice, 1990);
is("…still a projector", resolve("אני מחפש מקרן לסרטים בתקציב של 1,990 ₪").categorySlugs, ["projectors"]);
is("plural", resolve("יש לכם מקרנים?").categorySlugs, ["projectors"]);
is("prefixed", resolve("כמה עולה המקרן הזול?").categorySlugs, ["projectors"]);
is("english", resolve("projector").categorySlugs, ["projectors"]);
is("transliterated", resolve("פרוז'קטור לסלון").categorySlugs, ["projectors"]);
is("מקרן קול is a soundbar", resolve("מקרן קול").categorySlugs, ["soundbars", "speakers"]);
is("מקרני קול too", resolve("אילו מקרני קול יש?").categorySlugs, ["soundbars", "speakers"]);
is("מקרן חום is a heater", resolve("מקרן חום לחצר").categorySlugs, ["heaters", "heat-fans", "radiators"]);

console.log("\nthe cheapest fridge, asked after the projector");
const fridge = resolve("אני רוצה את המקרר הכי זול שלכם", "אני מחפש מקרן לסרטים בתקציב של 1,990 ₪");
is("topic switched to fridges", fridge.categoryLabel, "מקררים וקירור");
is("every fridge shelf", fridge.categorySlugs.includes("fridge-4-door") && fridge.categorySlugs.includes("mini-fridge"), true);
is("sorted cheapest", fridge.sort, "cheapest");
is("projector budget does not leak", fridge.maxPrice, null);
is("no stray words", fridge.words, []);

console.log("\nnarrowing down without repeating the product");
const narrowed = resolve("עד 5000 שקל וחשוב לי שיהיה שקט", "4 דלתות", "אני מחפש מקרר");
is("category from the newest turn that named one", narrowed.categorySlugs, ["fridge-4-door"]);
is("budget from the latest turn", narrowed.maxPrice, 5000);
is("descriptive word kept for scoring", narrowed.words, ["שקט"]);

console.log("\nbrands");
is("Hebrew alias finds both Brand rows", resolve("מדיח של בוש").brandNames.sort(), ["Bosch", "בוש"]);
is("…and the dishwashers", resolve("מדיח של בוש").categorySlugs, ["dishwasher-standard", "dishwasher-fully-integrated", "dishwasher-semi-integrated"]);
is("latin brand", resolve("samsung 65 אינץ").brandNames, ["Samsung"]);
is("…65 and אינץ survive as words", resolve("samsung טלוויזיה 65 אינץ").words, ["65", "אינץ"]);
is("two-word brand", resolve("קומקום morphy richards").brandLabel, "Morphy Richards");
is("lg exactly", resolve("טלוויזיה lg").brandNames, ["LG"]);
is("3i is too short to be a brand by accident", resolve("מקרר 3i").brandNames, []);
is("brand name as stored, not the alias", resolve("מכונת כביסה סאוטר").brandLabel, "Sauter");

console.log("\nsort");
is("cheapest", detectSort("מה המקרר הכי זול שלכם?"), "cheapest");
is("cheapest, feminine", detectSort("מכונת כביסה הזולה ביותר"), "cheapest");
is("plain זול", detectSort("משהו זול"), "cheapest");
is("priciest", detectSort("הכי יקר"), "priciest");
is("popular", detectSort("מה הכי נמכר אצלכם?"), "popular");
is("best", detectSort("הטלוויזיה הכי טובה"), "popular");
is("none", detectSort("יש לכם מקרנים?"), null);

console.log("\nbudgets");
is("עד", parseShoppingQuery("מקרר עד 5000 שח").maxPrice, 5000);
is("תקציב של", parseShoppingQuery("מקרן בתקציב של 1,990 ₪").maxPrice, 1990);
is("יש לי X ₪", parseShoppingQuery("יש לי 2000 ₪").maxPrice, 2000);
is("₪ before", parseShoppingQuery("₪1,500 מקסימום").maxPrice, 1500);
is("a model number is not a budget", parseShoppingQuery("DX330").maxPrice, null);
is("an inch count is not a budget", parseShoppingQuery("טלוויזיה 65 אינץ").maxPrice, null);

console.log("\nnot shopping");
is("a delivery question has no category", resolve("מה זמן המשלוח שלכם?").categorySlugs, []);
is("…and no words to search", resolve("מה זמן המשלוח שלכם?").words, []);
is("greeting", resolve("היי").words, []);
is("'חדש לבית' is filler", resolve("אני רוצה מקרר חדש לבית").words, []);

console.log("\nthe rest of the shop");
is("washing machine", resolve("מכונת כביסה").categorySlugs, ["washing-machines"]);
is("כביסה alone is the department", resolve("כביסה").categoryLabel, "כביסה, ייבוש ומדיחים");
is("tv", resolve("טלוויזיה").categorySlugs, ["tvs"]);
is("oven", resolve("תנור בנוי").categorySlugs, ["built-in-oven"]);
is("heater beats oven", resolve("תנור חימום").categorySlugs, ["heaters", "heat-fans", "radiators"]);
is("gas cooktop", resolve("כיריים גז").categorySlugs, ["gas-cooktops"]);
is("any cooktop", resolve("כיריים").categorySlugs.length, 4);
is("air fryer", resolve("אייר פרייר").categorySlugs, ["air-fryers"]);
is("vacuum", resolve("שואב אבק אלחוטי").categorySlugs, ["vacuum-cleaners"]);
is("ac", resolve("מזגן לחדר שינה").categoryLabel, "מיזוג אוויר");
is("coffee", resolve("מכונת קפה").categorySlugs, ["coffee-machines"]);
is("range hood", resolve("קולט אדים").categorySlugs, ["range-hoods"]);
is("soundbar english", resolve("soundbar").categorySlugs, ["soundbars", "speakers"]);
is("mini fridge", resolve("מקרר קטן למשרד").categorySlugs, ["mini-fridge"]);
is("wine", resolve("מקרר יינות").categorySlugs, ["wine-fridge"]);
is("hair dryer", resolve("מייבש שיער").categorySlugs, ["hair-dryers"]);
is("'מפני ש' is not a hair dryer", resolve("מפני שאין לי מקום").categorySlugs, []);

console.log(failures === 0 ? "\nall good" : `\n${failures} failing`);
process.exit(failures === 0 ? 0 : 1);
