// Guided-shopping ("product finder") question sets. Each category owns a short
// list of questions; scoring lives in src/actions/finder.ts.
//
// Every question here has to be answerable from data that actually exists on
// the products in that category. The wizard used to ask which end of the
// fridge the freezer should be on, matched on an attribute key
// ("freezer_location") that no product in the catalog has ever had, and asked
// about capacity against a key ("capacity") that is really stored as
// "capacity_liters" or "capacity_kg" depending on the category. Neither could
// ever match, so both answers were silently discarded and every recommendation
// came back with the same single reason — "במסגרת התקציב שהגדרתם" — under a
// heading promising a personal explanation for each one.
//
// So: a question belongs here only when the attribute it reads is one the
// products in that category carry, and its options say how to recognise an
// answer in the free text those attributes are actually stored as.

export type FinderOptionMatch = {
  // Case-insensitive substrings, any of which identifies this option in a
  // stored value. Attribute values are enriched free text, not a controlled
  // vocabulary: colour comes back as "נירוסטה", "נירוסטה מושחרת" and "פלדה
  // נירוסטה", panel as "LED", "UHD LED", "Crystal UHD LED" and "NanoCell
  // LED". Exact equality matched almost none of them.
  contains: string[];
  // Substrings that disqualify a value even when `contains` hits — "LED"
  // appears inside "QLED" and "OLED", which are the two things a shopper
  // picking plain LED is explicitly not picking.
  excludes?: string[];
};

export type FinderOption = {
  value: string;
  label: string;
  // Numeric attributes: [min, max). The stored value may carry its unit
  // ("9 ק״ג", "עד 7 ק״ג"), so the first number in the string is what counts.
  range?: [number, number];
  match?: FinderOptionMatch;
};

export type FinderQuestion = {
  id: string;
  question: string;
  attributeKey?: string; // matches CategoryAttribute.key when set
  type: "budget" | "single" | "multi";
  // Printed in front of the matched value when explaining a recommendation,
  // e.g. "נפח: 572 ליטר". Falls back to the attribute's own label.
  reasonLabel?: string;
  options: FinderOption[];
};

export type FinderConfig = {
  categorySlug: string;
  title: string;
  icon: string;
  questions: FinderQuestion[];
};

const ANY_OPTION: FinderOption = { value: "any", label: "לא משנה" };

export const FINDER_CATEGORIES: FinderConfig[] = [
  {
    categorySlug: "refrigeration",
    title: "מקררים",
    icon: "Refrigerator",
    questions: [
      {
        id: "budget",
        question: "מה התקציב שלכם?",
        type: "budget",
        options: [
          { value: "0-5000", label: "עד 5,000 ש\"ח" },
          { value: "5000-8000", label: "5,000-8,000 ש\"ח" },
          { value: "8000-100000", label: "מעל 8,000 ש\"ח" },
        ],
      },
      {
        id: "household",
        question: "כמה אנשים גרים בבית?",
        attributeKey: "capacity_liters",
        reasonLabel: "נפח",
        type: "single",
        options: [
          { value: "small", label: "1-2", range: [0, 300] },
          { value: "medium", label: "3-4", range: [300, 450] },
          { value: "large", label: "5+", range: [450, 9999] },
        ],
      },
      {
        id: "doors",
        question: "כמה דלתות?",
        attributeKey: "doors",
        reasonLabel: "דלתות",
        type: "single",
        options: [
          { value: "1", label: "דלת אחת", range: [1, 2] },
          { value: "2", label: "שתי דלתות", range: [2, 3] },
          { value: "4", label: "4 דלתות ומעלה", range: [4, 99] },
          ANY_OPTION,
        ],
      },
      {
        id: "color",
        question: "צבע מועדף",
        attributeKey: "color",
        reasonLabel: "צבע",
        type: "single",
        options: [
          { value: "נירוסטה", label: "נירוסטה", match: { contains: ["נירוסטה", "stainless"] } },
          { value: "לבן", label: "לבן", match: { contains: ["לבן", "white"] } },
          { value: "שחור", label: "שחור", match: { contains: ["שחור", "black"] } },
          ANY_OPTION,
        ],
      },
    ],
  },
  {
    categorySlug: "tv-multimedia",
    title: "טלוויזיות",
    icon: "Tv",
    questions: [
      {
        id: "budget",
        question: "מה התקציב שלכם?",
        type: "budget",
        options: [
          { value: "0-3000", label: "עד 3,000 ש\"ח" },
          { value: "3000-6000", label: "3,000-6,000 ש\"ח" },
          { value: "6000-100000", label: "מעל 6,000 ש\"ח" },
        ],
      },
      {
        id: "size",
        question: "איזה גודל מסך מתאים לסלון שלכם?",
        attributeKey: "screen_size",
        reasonLabel: "גודל מסך",
        type: "single",
        options: [
          { value: "small", label: 'עד 43"', range: [0, 44] },
          { value: "medium", label: '50"-65"', range: [44, 66] },
          { value: "large", label: 'מעל 65"', range: [66, 999] },
        ],
      },
      {
        id: "panel",
        question: "טכנולוגיית מסך מועדפת",
        attributeKey: "panel",
        reasonLabel: "מסך",
        type: "single",
        options: [
          { value: "OLED", label: "OLED - הניגודיות הטובה ביותר", match: { contains: ["oled"] } },
          { value: "QLED", label: "QLED - צבעוניות עשירה", match: { contains: ["qled", "qned"] } },
          {
            value: "LED",
            label: "LED - משתלם",
            match: { contains: ["led"], excludes: ["oled", "qled", "qned"] },
          },
          ANY_OPTION,
        ],
      },
    ],
  },
  {
    categorySlug: "laundry",
    title: "מכונות כביסה",
    icon: "WashingMachine",
    questions: [
      {
        id: "budget",
        question: "מה התקציב שלכם?",
        type: "budget",
        options: [
          { value: "0-2500", label: "עד 2,500 ש\"ח" },
          { value: "2500-4000", label: "2,500-4,000 ש\"ח" },
          { value: "4000-100000", label: "מעל 4,000 ש\"ח" },
        ],
      },
      {
        id: "household",
        question: "כמה אנשים גרים בבית?",
        attributeKey: "capacity_kg",
        reasonLabel: "קיבולת",
        type: "single",
        options: [
          { value: "small", label: "1-2", range: [0, 7] },
          { value: "medium", label: "3-4", range: [7, 9] },
          { value: "large", label: "5+", range: [9, 99] },
        ],
      },
      {
        id: "door_type",
        question: "פתח קדמי או עליון?",
        attributeKey: "door_type",
        reasonLabel: "פתח",
        type: "single",
        options: [
          { value: "front", label: "פתח חזית", match: { contains: ["חזית", "קדמי", "front"] } },
          { value: "top", label: "פתח עליון", match: { contains: ["עליון", "top"] } },
          ANY_OPTION,
        ],
      },
    ],
  },
];
