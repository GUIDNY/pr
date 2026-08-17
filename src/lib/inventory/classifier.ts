import type { ClassifiedField } from "./types";

// Real Israeli wholesale price-list headers are inconsistent across sheets —
// same concept, different wording, different order, sometimes typo'd (מק'ט
// vs מקט vs מק"ט). This classifies by keyword rather than position/exact
// match so it generalizes across sheets without a hand-written map per tab.
// Order matters: rules are checked top-to-bottom, first match wins.

type Rule = { test: (t: string) => boolean; field: ClassifiedField };

const RULES: Rule[] = [
  { test: (t) => /מק["'׳]?ט/.test(t), field: "SKU" },
  { test: (t) => /תאור|תיאור/.test(t) && !/הערות/.test(t), field: "DESCRIPTION" },
  { test: (t) => /^(מותג|חברה|יצרן)$/.test(t), field: "BRAND" },
  { test: (t) => /דגם/.test(t), field: "MODEL" },
  { test: (t) => /^צבע/.test(t), field: "COLOR" },
  { test: (t) => /אחריות/.test(t), field: "WARRANTY" },
  { test: (t) => /תמונה|image|img|photo/i.test(t), field: "IMAGE_URL" },
  { test: (t) => /עלות|מחיר קניה/.test(t), field: "INTERNAL_COST" },
  { test: (t) => /קוד מנכ/.test(t), field: "MANAGER_PRICE" },
  { test: (t) => /מינ|מנימום/.test(t), field: "MIN_SALE_PRICE" }, // incl. the "מנימום" typo seen in real sheets
  { test: (t) => /מזומן/.test(t), field: "CASH_PRICE" },
  { test: (t) => /מוצג|באתר|מחירון|מחיר עד \d+/.test(t), field: "RETAIL_PRICE" },
  { test: (t) => /אחוז/.test(t), field: "MARGIN_PERCENT" },
  { test: (t) => /בונדד/.test(t) && /ספק/.test(t), field: "SUPPLIER_STOCK" },
  { test: (t) => /בונדד/.test(t), field: "BONDED_STOCK" },
  { test: (t) => /תצוג/.test(t), field: "SHOWROOM_STOCK" }, // תצוגה/תצוגת/תצוגות
  { test: (t) => /יתרה/.test(t), field: "SELLABLE_STOCK" },
  { test: (t) => /טובים/.test(t), field: "WAREHOUSE_STOCK" },
  { test: (t) => /^מלאי/.test(t), field: "WAREHOUSE_STOCK" },
  { test: (t) => /שמור|תאריך|חתימה|שירות|אספקה|^פרטים$/.test(t), field: "IGNORED" },
  { test: (t) => /הערות|המלצה|דף מוצר|מפרט/.test(t), field: "NOTES" },
];

function normalize(label: string) {
  return String(label ?? "").trim();
}

export function classifyHeader(label: string): ClassifiedField {
  const t = normalize(label);
  if (!t) return "IGNORED";
  for (const rule of RULES) {
    if (rule.test(t)) return rule.field;
  }
  return "UNKNOWN";
}

// A row counts as a plausible header row if enough of its cells classify to
// known product-data fields (SKU/MODEL/DESCRIPTION/price/stock) — used to
// auto-locate the header among sheets that have a title row above it.
export function headerScore(cells: unknown[]): number {
  let score = 0;
  for (const cell of cells) {
    if (cell === null || cell === undefined || String(cell).trim() === "") continue;
    const field = classifyHeader(String(cell));
    if (field !== "UNKNOWN" && field !== "IGNORED") score++;
  }
  return score;
}
