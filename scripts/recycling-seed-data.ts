/**
 * The equipment groups for old-appliance removal, and which shop categories
 * belong to which.
 *
 * Data only, with no side effects, because two things read it: the runner in
 * recycling-categories.ts, and check-removal-rules.ts — which must be able to
 * import the lists without a script running against the database.
 *
 * WHY A SEED AND NOT A CONSTANT. The database is the source of truth from the
 * moment this has run once: the admin screen edits those rows, and a rerun
 * must not undo somebody's decision. So this only ever fills blanks — it
 * creates groups that do not exist and maps categories that are unmapped, and
 * it never re-points a category that already has an answer. The one thing it
 * is for is the first run and the category somebody adds next year.
 *
 * WHAT IS DELIBERATELY NOT HERE. Roughly a third of the tree is unmapped and
 * that is the answer, not an omission:
 *
 *   things that are not electrical equipment at all — wall mounts, TV
 *   stands, cables, projector screens, kitchen accessories, taps, grills;
 *
 *   departments whose products are a mixture. "מוצרי חשמל למטבח" holds
 *   twenty-seven products filed straight on the department because the
 *   supplier's sheet maps a whole tab to one broad category. There is no
 *   single old appliance those buyers are entitled to hand over, and
 *   inventing one would put the wrong noun on the checkbox. They are listed
 *   by the report so somebody can set them product by product;
 *
 *   equipment whose group is genuinely arguable — a warming drawer, a
 *   security-camera kit, smart bulbs. The brief is explicit that an unclear
 *   match is left for a person to make in the admin rather than decided
 *   here, and this is what that looks like in practice.
 *
 * ON `oldLabel`: it is the whole phrase, already agreeing. Hebrew inflects
 * the adjective, so "מכונת כביסה" cannot be turned into "מכונת כביסה ישן" by
 * appending a word, and "כיריים" needs "ישנות".
 *
 * ON `isLargeAppliance`: the removal procedure's own test — at least one side
 * longer than 50cm — and it is what makes an exceptional removal chargeable
 * at all. It is NOT the same question as lib/bulky.ts, which asks whether a
 * courier can leave the NEW one at a shop counter. A television is bulky and
 * large; a vacuum cleaner is bulky for the counter and small for the stairs.
 */

export type RecyclingGroupSeed = {
  key: string;
  label: string;
  oldLabel: string;
  isLargeAppliance: boolean;
  asksExceptional: boolean;
  sortOrder: number;
};

/* The order is the order the admin screen lists them in: the big white goods
   a customer is most likely to be replacing first, small kitchen appliances
   after, personal care and audio last. */
export const RECYCLING_GROUPS: RecyclingGroupSeed[] = [
  { key: "refrigerator", label: "מקרר", oldLabel: "מקרר ישן", isLargeAppliance: true, asksExceptional: true, sortOrder: 10 },
  { key: "freezer", label: "מקפיא", oldLabel: "מקפיא ישן", isLargeAppliance: true, asksExceptional: true, sortOrder: 20 },
  { key: "washing_machine", label: "מכונת כביסה", oldLabel: "מכונת כביסה ישנה", isLargeAppliance: true, asksExceptional: true, sortOrder: 30 },
  { key: "dryer", label: "מייבש כביסה", oldLabel: "מייבש כביסה ישן", isLargeAppliance: true, asksExceptional: true, sortOrder: 40 },
  { key: "dishwasher", label: "מדיח כלים", oldLabel: "מדיח כלים ישן", isLargeAppliance: true, asksExceptional: true, sortOrder: 50 },
  { key: "oven", label: "תנור", oldLabel: "תנור ישן", isLargeAppliance: true, asksExceptional: true, sortOrder: 60 },
  { key: "cooktop", label: "כיריים", oldLabel: "כיריים ישנות", isLargeAppliance: true, asksExceptional: true, sortOrder: 70 },
  { key: "range_hood", label: "קולט אדים", oldLabel: "קולט אדים ישן", isLargeAppliance: true, asksExceptional: true, sortOrder: 80 },
  { key: "television", label: "טלוויזיה", oldLabel: "טלוויזיה ישנה", isLargeAppliance: true, asksExceptional: true, sortOrder: 90 },
  { key: "air_conditioner", label: "מזגן", oldLabel: "מזגן ישן", isLargeAppliance: true, asksExceptional: true, sortOrder: 100 },
  { key: "water_dispenser", label: "בר מים", oldLabel: "בר מים ישן", isLargeAppliance: true, asksExceptional: true, sortOrder: 110 },

  /* Below the line: carried by one person, down stairs, without a
     conversation. They are still electrical equipment the law covers — the
     brief names the kettle and the toaster explicitly — they simply cannot
     produce an exceptional removal, so the access questions are off and the
     removal is always free. */
  { key: "microwave", label: "מיקרוגל", oldLabel: "מיקרוגל ישן", isLargeAppliance: false, asksExceptional: false, sortOrder: 200 },
  { key: "toaster_oven", label: "טוסטר אובן", oldLabel: "טוסטר אובן ישן", isLargeAppliance: false, asksExceptional: false, sortOrder: 210 },
  { key: "vacuum_cleaner", label: "שואב אבק", oldLabel: "שואב אבק ישן", isLargeAppliance: false, asksExceptional: false, sortOrder: 220 },
  { key: "iron", label: "מגהץ", oldLabel: "מגהץ ישן", isLargeAppliance: false, asksExceptional: false, sortOrder: 230 },
  { key: "kettle", label: "קומקום", oldLabel: "קומקום ישן", isLargeAppliance: false, asksExceptional: false, sortOrder: 240 },
  { key: "coffee_machine", label: "מכונת קפה", oldLabel: "מכונת קפה ישנה", isLargeAppliance: false, asksExceptional: false, sortOrder: 250 },
  { key: "coffee_grinder", label: "מטחנת קפה", oldLabel: "מטחנת קפה ישנה", isLargeAppliance: false, asksExceptional: false, sortOrder: 260 },
  { key: "food_processor", label: "מעבד מזון", oldLabel: "מעבד מזון ישן", isLargeAppliance: false, asksExceptional: false, sortOrder: 270 },
  { key: "blender", label: "בלנדר", oldLabel: "בלנדר ישן", isLargeAppliance: false, asksExceptional: false, sortOrder: 280 },
  { key: "mixer", label: "מיקסר", oldLabel: "מיקסר ישן", isLargeAppliance: false, asksExceptional: false, sortOrder: 290 },
  { key: "juicer", label: "מסחטת מיץ", oldLabel: "מסחטת מיץ ישנה", isLargeAppliance: false, asksExceptional: false, sortOrder: 300 },
  { key: "meat_grinder", label: "מטחנת בשר", oldLabel: "מטחנת בשר ישנה", isLargeAppliance: false, asksExceptional: false, sortOrder: 310 },
  { key: "air_fryer", label: "סיר טיגון", oldLabel: "סיר טיגון ישן", isLargeAppliance: false, asksExceptional: false, sortOrder: 320 },
  { key: "hot_plate", label: "פלטה חשמלית", oldLabel: "פלטה חשמלית ישנה", isLargeAppliance: false, asksExceptional: false, sortOrder: 330 },
  { key: "bread_maker", label: "אופה לחם", oldLabel: "אופה לחם ישן", isLargeAppliance: false, asksExceptional: false, sortOrder: 340 },
  { key: "toaster", label: "טוסטר", oldLabel: "טוסטר ישן", isLargeAppliance: false, asksExceptional: false, sortOrder: 350 },
  { key: "milk_frother", label: "מקציף חלב", oldLabel: "מקציף חלב ישן", isLargeAppliance: false, asksExceptional: false, sortOrder: 360 },

  { key: "heater", label: "תנור חימום", oldLabel: "תנור חימום ישן", isLargeAppliance: false, asksExceptional: false, sortOrder: 400 },
  { key: "radiator", label: "רדיאטור", oldLabel: "רדיאטור ישן", isLargeAppliance: false, asksExceptional: false, sortOrder: 410 },
  { key: "fan", label: "מאוורר", oldLabel: "מאוורר ישן", isLargeAppliance: false, asksExceptional: false, sortOrder: 420 },

  { key: "hair_dryer", label: "מייבש שיער", oldLabel: "מייבש שיער ישן", isLargeAppliance: false, asksExceptional: false, sortOrder: 500 },
  { key: "hair_straightener", label: "מחליק שיער", oldLabel: "מחליק שיער ישן", isLargeAppliance: false, asksExceptional: false, sortOrder: 510 },
  { key: "hair_curler", label: "מסלסל שיער", oldLabel: "מסלסל שיער ישן", isLargeAppliance: false, asksExceptional: false, sortOrder: 520 },
  { key: "hair_clipper", label: "מכונת תספורת", oldLabel: "מכונת תספורת ישנה", isLargeAppliance: false, asksExceptional: false, sortOrder: 530 },
  { key: "shaver", label: "מכונת גילוח", oldLabel: "מכונת גילוח ישנה", isLargeAppliance: false, asksExceptional: false, sortOrder: 540 },
  { key: "epilator", label: "מסיר שיער", oldLabel: "מסיר שיער ישן", isLargeAppliance: false, asksExceptional: false, sortOrder: 550 },

  { key: "speakers", label: "רמקולים", oldLabel: "רמקולים ישנים", isLargeAppliance: false, asksExceptional: false, sortOrder: 600 },
  { key: "amplifier", label: "מגבר", oldLabel: "מגבר או רסיבר ישן", isLargeAppliance: false, asksExceptional: false, sortOrder: 610 },
  { key: "headphones", label: "אוזניות", oldLabel: "אוזניות ישנות", isLargeAppliance: false, asksExceptional: false, sortOrder: 620 },
  { key: "projector", label: "מקרן", oldLabel: "מקרן ישן", isLargeAppliance: false, asksExceptional: false, sortOrder: 630 },
];

/**
 * Category slug → group key.
 *
 * Leaves mostly, and one department: `refrigeration` carries fifty-nine
 * products filed straight on it, and every one of them is a cooling
 * appliance, so leaving it blank would deny the removal to the largest single
 * block of products in the shop. The other departments are not like that —
 * see the header.
 */
export const CATEGORY_RECYCLING_MAP: Record<string, string> = {
  // מקררים וקירור
  refrigeration: "refrigerator",
  "fridge-top-freezer": "refrigerator",
  "fridge-bottom-freezer": "refrigerator",
  "fridge-3-door": "refrigerator",
  "fridge-4-door": "refrigerator",
  "fridge-side-by-side": "refrigerator",
  "fridge-integrated": "refrigerator",
  "mini-fridge": "refrigerator",
  "wine-fridge": "refrigerator",
  freezers: "freezer",

  // כביסה, ייבוש ומדיחים
  "washing-machines": "washing_machine",
  "washer-dryer-combo": "washing_machine",
  dryers: "dryer",
  "dishwasher-standard": "dishwasher",
  "dishwasher-fully-integrated": "dishwasher",
  "dishwasher-semi-integrated": "dishwasher",

  // תנורים וכיריים
  "built-in-oven": "oven",
  "combi-oven": "oven",
  "gas-cooktops": "cooktop",
  "ceramic-cooktops": "cooktop",
  "induction-cooktops": "cooktop",
  "hybrid-cooktops": "cooktop",
  "range-hoods": "range_hood",

  // מיזוג אוויר
  "split-ac": "air_conditioner",
  "central-ac": "air_conditioner",
  "portable-ac": "air_conditioner",

  // טלוויזיות ומולטימדיה
  tvs: "television",
  projectors: "projector",

  // מוצרי חשמל לבית
  "vacuum-cleaners": "vacuum_cleaner",
  irons: "iron",
  "water-dispensers": "water_dispenser",

  // חימום ואוורור
  heaters: "heater",
  "heat-fans": "heater",
  radiators: "radiator",
  fans: "fan",
  "ceiling-fans": "fan",

  // מוצרי חשמל למטבח
  microwaves: "microwave",
  "toaster-ovens": "toaster_oven",
  kettles: "kettle",
  "coffee-machines": "coffee_machine",
  "coffee-grinders": "coffee_grinder",
  "food-processors": "food_processor",
  blenders: "blender",
  mixers: "mixer",
  juicers: "juicer",
  "meat-grinders": "meat_grinder",
  "air-fryers": "air_fryer",
  "hot-plates": "hot_plate",
  "bread-makers": "bread_maker",
  "pop-up-toasters": "toaster",
  "sandwich-toasters": "toaster",
  "milk-frothers": "milk_frother",

  // טיפוח אישי
  "hair-dryers": "hair_dryer",
  "hair-straighteners": "hair_straightener",
  "hair-curlers": "hair_curler",
  "hair-clippers": "hair_clipper",
  shavers: "shaver",
  epilators: "epilator",

  // סטריאו וקולנוע ביתי
  speakers: "speakers",
  subwoofers: "speakers",
  "portable-speakers": "speakers",
  soundbars: "speakers",
  "receivers-amplifiers": "amplifier",
  headphones: "headphones",
};

/** Escapes a value for a single-quoted SQL literal. */
function lit(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * The seed as SQL, so it can be applied from a session that can reach the
 * database console but has no DATABASE_URL — which is every cloud container
 * here, secrets living in the Vercel dashboard only.
 *
 * ON CONFLICT DO NOTHING on the groups and a WHERE ... IS NULL on the
 * mapping: the same fill-the-blanks rule the TypeScript path follows, so the
 * two cannot drift into different behaviour.
 */
export function seedSql(): string {
  const lines: string[] = [];
  for (const g of RECYCLING_GROUPS) {
    lines.push(
      `INSERT INTO "RecyclingCategory" ("id","key","label","oldLabel","isLargeAppliance","asksExceptional","isEnabled","sortOrder","createdAt","updatedAt") ` +
        `VALUES (${lit("rc_" + g.key)}, ${lit(g.key)}, ${lit(g.label)}, ${lit(g.oldLabel)}, ${g.isLargeAppliance}, ${g.asksExceptional}, true, ${g.sortOrder}, now(), now()) ` +
        `ON CONFLICT ("key") DO NOTHING;`,
    );
  }
  for (const [slug, key] of Object.entries(CATEGORY_RECYCLING_MAP)) {
    lines.push(
      `UPDATE "Category" SET "recyclingCategoryId" = (SELECT "id" FROM "RecyclingCategory" WHERE "key" = ${lit(key)}) ` +
        `WHERE "slug" = ${lit(slug)} AND "recyclingCategoryId" IS NULL;`,
    );
  }
  return lines.join("\n");
}

