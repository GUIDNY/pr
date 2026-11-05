import { canManageCatalog } from "@/lib/permissions";
import { SINGLES_DAY_END_MS } from "@/lib/campaigns/singles-day-window";

/**
 * Singles' Day, 11.11.2026 — the owner's list, as he wrote it on 5 November.
 *
 * The sale prices are switched in the database, not here: two pg_cron jobs
 * (campaign.singles_day_2026_start / _end) write them at 00:00 on 11.11 and
 * restore each product's previous price at 24:00 — see
 * lib/campaigns/singles-day-window.ts. This file is the plan they were
 * loaded from and the page checks against. Marketing's lane is `Promotion`
 * rows (see the field-ownership table in CLAUDE.md), and the day these go
 * live they go in there — this file is the plan they will be checked
 * against, kept exactly as written so the page can say where the catalogue
 * has since moved away from it.
 *
 * `plannedPrice` and `plannedStock` are what the price list said when the
 * list was made. The page reads the live product beside them, because the
 * sync moves stock twice a day and a price can be re-adopted from the sheet:
 * a deal planned at 15% off 4,900 is a different deal off 5,200, and a
 * product with 3 in stock on Thursday may have none by the 11th.
 *
 * Sale prices are his, not computed. 10% off 8,900 is 8,010 and he wrote
 * 8,000 — round numbers are the point of a sale price, so `discountPct` is
 * the label on the badge and `salePrice` is the number that is charged.
 */

export const SINGLES_DAY_2026 = {
  slug: "singles-day-2026",
  title: "יום הרווקים 11.11",
  date: "2026-11-11",
} as const;

/**
 * When the campaign leaves the back office: the same midnight the public
 * page and the banner end at (singles-day-window.ts). Asked for in those
 * words on 5 November: "ב-12.11 שזה ייעלם". The nav entry and the
 * back-office page read it.
 */
export const SINGLES_DAY_ENDS_AT_MS = SINGLES_DAY_END_MS;

export function singlesDayIsOver(nowMs: number): boolean {
  return nowMs >= SINGLES_DAY_ENDS_AT_MS;
}

/**
 * Who may see the campaign before it is public: the catalog roles, and
 * the sellers. The sellers were added on 5 November, for asaf@buytoday.co.il
 * in particular, because he makes the videos the paid social promotion runs
 * on, so he has to see the list and the page they point at.
 * A seller sees no cost and no margin. The page drops those for any role
 * that cannot manage the catalog, exactly as everywhere else in the back
 * office.
 */
export function canSeeSinglesDay(role: string | null | undefined): boolean {
  return canManageCatalog(role) || role === "SELLER";
}

/**
 * The marketing plan, as the owner gave it on 5 November: paid promotion on
 * social media, built on Asaf's videos, 300 ₪ over two days. The text is
 * his and the numbers are his. The two days are not dated here because he
 * did not date them.
 */
export const SINGLES_DAY_SOCIAL_PLAN = {
  headline: "קידום ממומן ברשתות החברתיות",
  creative: "על בסיס הסרטונים של אסף",
  budgetIls: 300,
  days: 2,
} as const;

export type SinglesDayItem = {
  sku: string;
  label: string;
  plannedPrice: number;
  discountPct: number;
  salePrice: number;
  plannedProfit: number;
  plannedStock: number;
};

export const SINGLES_DAY_ITEMS: SinglesDayItem[] = [
  { sku: "157244", label: "מיקרוגל בנוי Miele M 7244 TC", plannedPrice: 8900, discountPct: 10, salePrice: 8000, plannedProfit: 2157, plannedStock: 5 },
  { sku: "0285", label: "כיריים משולבות AEG HDB95623NB", plannedPrice: 6200, discountPct: 15, salePrice: 5260, plannedProfit: 1620, plannedStock: 8 },
  { sku: "0324", label: "כיריים גז Bertazzoni QB36600X", plannedPrice: 5900, discountPct: 10, salePrice: 5300, plannedProfit: 1500, plannedStock: 4 },
  { sku: "105698", label: "מקרר דלונגי DLR9680X נירוסטה", plannedPrice: 4900, discountPct: 15, salePrice: 4160, plannedProfit: 1460, plannedStock: 3 },
  { sku: "106698", label: "מקרר דלונגי DLR9680DX מושחר", plannedPrice: 4900, discountPct: 15, salePrice: 4160, plannedProfit: 1460, plannedStock: 3 },
  { sku: "0884", label: "כיריים גז Bertazzoni PM365SOX", plannedPrice: 4900, discountPct: 20, salePrice: 3910, plannedProfit: 1296, plannedStock: 4 },
  { sku: "100875", label: "מקרר אינטגרלי SMEG C875TNE", plannedPrice: 7900, discountPct: 10, salePrice: 7100, plannedProfit: 2100, plannedStock: 2 },
  { sku: "0282", label: "כיריים אינדוקציה AEG TK95IN00FB", plannedPrice: 4800, discountPct: 10, salePrice: 4310, plannedProfit: 1320, plannedStock: 3 },
  { sku: "1", label: "מקרר GENERAL GEBFI513RIX", plannedPrice: 4500, discountPct: 15, salePrice: 3820, plannedProfit: 1130, plannedStock: 3 },
  { sku: "140858", label: "מדיח אינטגרלי Bauknecht B8IHT58TIS", plannedPrice: 4500, discountPct: 15, salePrice: 3820, plannedProfit: 1094, plannedStock: 3 },
  { sku: "100427", label: "מקרר SBS KONKA KRF-600WG", plannedPrice: 3600, discountPct: 10, salePrice: 3230, plannedProfit: 1030, plannedStock: 3 },
  { sku: "0561", label: "קולט Faber Eclipse EV8", plannedPrice: 2900, discountPct: 15, salePrice: 2460, plannedProfit: 825, plannedStock: 7 },
  { sku: "108852", label: "מקרר דלונגי DLR8522X", plannedPrice: 3300, discountPct: 15, salePrice: 2800, plannedProfit: 806, plannedStock: 4 },
  { sku: "0887", label: "כיריים גז Gorenje GW951GB", plannedPrice: 2700, discountPct: 15, salePrice: 2290, plannedProfit: 800, plannedStock: 5 },
  { sku: "0305", label: "כיריים גז Bauknecht TGV6955SW", plannedPrice: 2600, discountPct: 10, salePrice: 2330, plannedProfit: 743, plannedStock: 5 },
  { sku: "149332", label: "מדיח Bauknecht 14 מערכות", plannedPrice: 2800, discountPct: 20, salePrice: 2230, plannedProfit: 730, plannedStock: 13 },
  { sku: "0849", label: "מקרר TCL P787TMN 606 ליטר", plannedPrice: 2900, discountPct: 15, salePrice: 2460, plannedProfit: 720, plannedStock: 5 },
  { sku: "106464", label: "מקרר General GE64W 512 ליטר", plannedPrice: 3000, discountPct: 10, salePrice: 2690, plannedProfit: 690, plannedStock: 6 },
  { sku: "0706", label: "כיריים גז Fratelli FRS-905S100N", plannedPrice: 2500, discountPct: 15, salePrice: 2120, plannedProfit: 640, plannedStock: 5 },
  { sku: "0341", label: "כיריים גז Gorenje GW951X", plannedPrice: 2490, discountPct: 15, salePrice: 2110, plannedProfit: 620, plannedStock: 6 },
];

export type LiveProduct = {
  price: number;
  supplierCost: number | null;
  stockQty: number;
  isPublished: boolean;
  missingFromSourceSince: Date | null;
  hasImage: boolean;
};

export type DealCheck = { level: "stop" | "warn"; text: string };

/**
 * What has changed since the list was written, worst first.
 *
 * A "stop" is a deal that must not go out as planned: the product is gone,
 * cannot be bought, or the sale price would sell at or below cost — the
 * owner's rule, "אין אפשרות שמחיר יהיה מתחת לעלות", applies to a sale price
 * exactly as it does to any other. A "warn" is the plan drifting: a price the
 * discount was computed from has moved, stock has dropped, or there is no
 * recorded cost to check the margin against.
 */
export function checkDeal(item: SinglesDayItem, live: LiveProduct | null): DealCheck[] {
  if (!live) return [{ level: "stop", text: "המק\"ט לא נמצא בקטלוג" }];
  const out: DealCheck[] = [];
  if (!live.isPublished) out.push({ level: "stop", text: "המוצר לא מפורסם באתר" });
  if (live.missingFromSourceSince) out.push({ level: "stop", text: "המוצר ירד מהמחירון" });
  if (!live.hasImage) out.push({ level: "stop", text: "אין למוצר תמונה — לא יוצג באתר" });
  if (live.stockQty <= 0) out.push({ level: "stop", text: "אזל מהמלאי" });
  if (live.supplierCost !== null && live.supplierCost > 0 && item.salePrice <= live.supplierCost) {
    out.push({ level: "stop", text: `מחיר המבצע לא מעל העלות (${live.supplierCost.toLocaleString("he-IL")} ₪)` });
  }
  if (live.supplierCost === null || live.supplierCost <= 0) {
    out.push({ level: "warn", text: "אין עלות רשומה — אי אפשר לאמת רווח" });
  }
  // On the day the database holds the sale price itself (pg_cron, 00:00–24:00),
  // which is the plan working, not the plan drifting.
  if (live.price !== item.plannedPrice && live.price !== item.salePrice) {
    out.push({
      level: "warn",
      text: `המחיר באתר השתנה: ${live.price.toLocaleString("he-IL")} ₪ במקום ${item.plannedPrice.toLocaleString("he-IL")} ₪`,
    });
  }
  if (live.stockQty > 0 && live.stockQty < item.plannedStock) {
    out.push({ level: "warn", text: `נשארו ${live.stockQty} במלאי (תוכנן ${item.plannedStock})` });
  }
  return out;
}

/** Profit on one unit at the sale price, from the live cost. Null when there is none. */
export function liveProfit(item: SinglesDayItem, live: LiveProduct | null): number | null {
  if (!live || live.supplierCost === null || live.supplierCost <= 0) return null;
  return item.salePrice - live.supplierCost;
}

/** Whole days from `nowMs` to the morning of the 11th, Israel time (UTC+2 in November). */
export function daysUntilSinglesDay(nowMs: number): number {
  return Math.ceil((new Date(`${SINGLES_DAY_2026.date}T00:00:00+02:00`).getTime() - nowMs) / 86_400_000);
}
