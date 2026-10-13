import { getSession } from "@/lib/auth";
import { canManageCatalog } from "@/lib/permissions";
import { db } from "@/lib/db";
import { parseWorkbook } from "@/lib/inventory/excel-parser";
import { normalizeRow } from "@/lib/inventory/normalizer";
import { resolvedPrice } from "@/lib/inventory/diff-engine";
import { downloadInventoryFile, isStorageConfigured } from "@/lib/inventory/storage";
import type { SourceKey } from "@/lib/inventory/sheet-map";

/**
 * Every product the price list carries, with the price the site is showing
 * for it, as a spreadsheet.
 *
 * The owner asked for a list he could take off the site and compare against
 * the מחירון himself, and the question behind it is the right one: this
 * session found a 530-litre fridge priced as a 660-litre one by reading a
 * page, not by reading the catalogue. Every automatic check here was written
 * after a failure, which means the next one is unwritten, and the only reader
 * who has ever caught a wrong price first is the person who knows the
 * products. He should not have to ask an agent for the data to do it.
 *
 * So: one row per product, and the columns are chosen for that comparison
 * rather than for a general-purpose dump.
 *
 * - `לשונית` and `שורה` are first after the identifiers, because the whole
 *   job is finding this row in the workbook. Without them a disagreement is
 *   a search.
 * - `דגם בשורה` is `lastRowModel` — the model the row itself printed on the
 *   last sync, written by the sync and by nothing else. Beside `דגם אצלנו`
 *   it is the comparison that found the 6,200 ₪ fridge, done by eye.
 * - `עלות` and `מרווח` are here because a price is only wrong relative to
 *   something. 1.29 is the normal figure across the catalogue; 2.89 was the
 *   Siemens reading a Samsung's row.
 * - `באתר` and `למה לא` because "the list of prices on the site" and "the
 *   list of products" are not the same list, and a column is cheaper than
 *   two exports.
 *
 * Deliberately not restricted to what is live. A product that is off the site
 * still has a price, and a price that is wrong on a hidden product becomes
 * wrong on a live one the moment somebody adds a photograph.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * One CSV field.
 *
 * The leading-character guard is not pedantry. These titles come from a
 * supplier sheet and are opened in Excel, and a cell that starts with `=`,
 * `+`, `-` or `@` is a formula to Excel — a title like "-20% הנחה" would be
 * evaluated, and a crafted one can read other cells or shell out. Prefixing
 * a tab keeps the text and stops it being a formula; `WEEK` quoting handles
 * the rest.
 */
function field(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const raw = String(value);
  const safe = /^[=+\-@\t\r]/.test(raw) ? `\t${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

/**
 * What the price list says each row's selling price is, right now.
 *
 * The export answered "what do we charge" and stopped there, which is half
 * a comparison. The question the owner actually asks of this file is whether
 * the two agree, and on 13 October answering it meant sending the three
 * workbooks into a chat and reconciling them by hand. That found exactly one
 * stale price in 1,326 — worth knowing, and not worth repeating by hand.
 *
 * The sync already reads these workbooks out of storage every run, so the
 * server has them; this walks them through the same parser and the same
 * resolvedPrice the sync uses, so the number in the column is the number the
 * sync would adopt, not a second opinion about the sheet.
 *
 * Failure is silent on purpose. Storage can be unconfigured, a download can
 * fail, a workbook can be mid-upload — none of that should cost the person
 * the export they asked for. The columns come back empty and the rest of the
 * file is exactly as useful as it was before.
 */
type SheetPrice = { price: number | null; cost: number | null; model: string | null };

async function priceListByRow(): Promise<Map<string, SheetPrice>> {
  const out = new Map<string, SheetPrice>();
  if (!isStorageConfigured()) return out;

  const sources = await db.inventorySource.findMany({
    where: { sourceType: "EXCEL", isActive: true, storagePath: { not: null } },
    select: { id: true, key: true, storagePath: true },
  });

  for (const src of sources) {
    try {
      const buffer = await downloadInventoryFile(src.storagePath!);
      const { sheets } = parseWorkbook(buffer, src.key as SourceKey);
      for (const sheet of sheets) {
        for (const row of sheet.rows) {
          const n = normalizeRow(src.key, sheet.sheetName, row, sheet.columns);
          const { price } = resolvedPrice({
            retailPrice: n.retailPrice,
            minSalePrice: n.minSalePrice,
            managerPrice: n.managerPrice,
            internalCost: n.internalCost,
          });
          out.set(`${sheet.sheetName.trim()}\u0000${n.rowIndex}`, {
            price,
            cost: n.internalCost,
            model: n.model,
          });
        }
      }
    } catch {
      /* This source contributes nothing to the comparison; the others still do. */
    }
  }
  return out;
}

export async function GET() {
  const session = await getSession();
  if (!session || !canManageCatalog(session.role)) {
    return new Response("unauthorized", { status: 401 });
  }

  const sheetPrices = await priceListByRow();

  const products = await db.product.findMany({
    where: { source: { is: { sourceType: "EXCEL", isActive: true } } },
    select: {
      sku: true,
      title: true,
      slug: true,
      model: true,
      lastRowModel: true,
      sourceSheet: true,
      sourceRowRef: true,
      price: true,
      supplierCost: true,
      stockQty: true,
      stockStatus: true,
      isPublished: true,
      priceManualAt: true,
      compareAtPrice: true,
      missingFromSourceSince: true,
      enrichmentStatus: true,
      _count: { select: { images: true } },
      alerts: {
        where: {
          isResolved: false,
          type: { in: ["ROW_NAMES_ANOTHER_MODEL", "INVALID_PRICE", "PRICE_BELOW_COST"] },
        },
        select: { type: true },
      },
    },
    orderBy: [{ sourceSheet: "asc" }, { sourceRowRef: "asc" }],
  });

  const header = [
    "מק״ט",
    "שם המוצר",
    "לשונית",
    "שורה",
    "דגם אצלנו",
    "דגם בשורה",
    "מחיר באתר",
    "המחיר במחירון",
    "פער",
    "הסבר לפער",
    "עלות ספק",
    "מרווח",
    "מלאי",
    "באתר",
    "למה לא באתר",
    "מחיר נעול",
    "תקלת מחיר פתוחה",
    "קישור",
  ];

  const lines = [header.map(field).join(",")];

  for (const p of products) {
    /* PUBLIC_PRODUCT_WHERE, field by field. The source condition is already
       in the query above. Spelled out rather than imported because this has
       to report the reason as well as the verdict, and one boolean cannot. */
    const reasons: string[] = [];
    if (p.price <= 0) reasons.push("אין מחיר");
    if (p.stockQty <= 0) reasons.push("אין מלאי");
    if (p._count.images === 0) reasons.push("אין תמונה");
    if (p.stockStatus === "NEEDS_REVIEW") reasons.push("נתוני מלאי לא עקביים");
    if (p.missingFromSourceSince !== null) reasons.push("לא במחירון יותר");
    if (!p.isPublished) reasons.push("לא מפורסם");

    /* The price list's figure for the row this product is bound to, and why
       ours differs when it does. The order of the reasons is the order
       adoptPrice refuses in, so the column names the actual rule that held
       the price rather than guessing at one. */
    const sheet = sheetPrices.get(`${(p.sourceSheet ?? "").trim()}\u0000${p.sourceRowRef ?? -1}`);
    const gap = sheet?.price != null ? p.price - sheet.price : null;
    const gapReason = !gap
      ? ""
      : p.priceManualAt
        ? "מחיר שנקבע ידנית"
        : p.compareAtPrice !== null
          ? "מבצע רץ"
          : sheet?.cost != null && sheet.cost > 0 && sheet.price! < sheet.cost
            ? "המחירון מתחת לעלות של עצמו"
            : "לא מוסבר — לבדוק";

    const fault = p.alerts.length
      ? p.alerts.some((a) => a.type === "ROW_NAMES_ANOTHER_MODEL")
        ? "השורה מדפיסה דגם אחר"
        : p.alerts.some((a) => a.type === "PRICE_BELOW_COST")
          ? "מתחת לעלות"
          : "מחיר לא תקין"
      : "";

    lines.push(
      [
        field(p.sku),
        field(p.title),
        field(p.sourceSheet),
        field(p.sourceRowRef),
        field(p.model),
        field(p.lastRowModel),
        field(p.price),
        field(sheet?.price ?? null),
        field(gap === null ? null : gap),
        field(gapReason),
        field(p.supplierCost),
        /* Two decimals, and blank rather than zero when there is no cost:
           a margin column that reads 0.00 on 5 products with no cost figure
           invites exactly the wrong conclusion about them. */
        field(
          p.supplierCost && p.supplierCost > 0
            ? (p.price / p.supplierCost).toFixed(2)
            : null,
        ),
        field(p.stockQty),
        field(reasons.length === 0 ? "כן" : "לא"),
        field(reasons.join(" + ")),
        field(p.priceManualAt ? "כן" : ""),
        field(fault),
        field(`https://buytoday.co.il/product/${p.slug}`),
      ].join(","),
    );
  }

  /* A BOM, or Excel reads UTF-8 Hebrew as mojibake — the one thing that makes
     the difference between a usable file and a support call. CRLF for the
     same reason. */
  const csv = `﻿${lines.join("\r\n")}\r\n`;
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="buytoday-prices-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
