// Guided-shopping ("product finder") question sets. Each category owns a
// short list of questions; scoring lives in src/actions/finder.ts and reads
// each question's `attributeKey` to match against ProductAttributeValue rows,
// so adding a new guided category is just: new entry here + matching
// CategoryAttribute rows already seeded for that category.

export type FinderQuestion = {
  id: string;
  question: string;
  attributeKey?: string; // matches CategoryAttribute.key when set
  type: "budget" | "single" | "multi";
  options: { value: string; label: string }[];
};

export type FinderConfig = {
  categorySlug: string;
  title: string;
  icon: string;
  questions: FinderQuestion[];
};

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
        attributeKey: "capacity",
        type: "single",
        options: [
          { value: "small", label: "1-2" },
          { value: "medium", label: "3-4" },
          { value: "large", label: "5+" },
        ],
      },
      {
        id: "freezer_location",
        question: "מיקום מקפיא מועדף",
        attributeKey: "freezer_location",
        type: "single",
        options: [
          { value: "עליון", label: "עליון" },
          { value: "תחתון", label: "תחתון" },
          { value: "any", label: "לא משנה" },
        ],
      },
      {
        id: "color",
        question: "צבע מועדף",
        attributeKey: "color",
        type: "single",
        options: [
          { value: "נירוסטה", label: "נירוסטה" },
          { value: "לבן", label: "לבן" },
          { value: "שחור", label: "שחור" },
          { value: "any", label: "לא משנה" },
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
        type: "single",
        options: [
          { value: "small", label: 'עד 43"' },
          { value: "medium", label: '50"-65"' },
          { value: "large", label: 'מעל 65"' },
        ],
      },
      {
        id: "panel",
        question: "טכנולוגיית מסך מועדפת",
        attributeKey: "panel",
        type: "single",
        options: [
          { value: "OLED", label: "OLED - הניגודיות הטובה ביותר" },
          { value: "QLED", label: "QLED - צבעוניות עשירה" },
          { value: "LED", label: "LED - משתלם" },
          { value: "any", label: "לא משנה" },
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
        attributeKey: "capacity",
        type: "single",
        options: [
          { value: "small", label: "1-2" },
          { value: "medium", label: "3-4" },
          { value: "large", label: "5+" },
        ],
      },
    ],
  },
];
