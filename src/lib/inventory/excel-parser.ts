import * as XLSX from "xlsx";
import { classifyHeader, headerScore } from "./classifier";
import { isProductSheet, type SourceKey } from "./sheet-map";
import { isPlausibleBrandCell } from "./brand-extractor";
import { looksLikeSupplierSku } from "./import-guards";
import type { ClassifiedColumn, ParsedRow, ParsedSheet, ParsedWorkbook } from "./types";

const HEADER_SEARCH_ROWS = 5;
const MIN_HEADER_SCORE = 3;
const DIVIDER_FILL_RGB = "FFFF00"; // solid bright yellow — the convention every source sheet uses for section dividers

function isBlankRow(cells: unknown[]) {
  return cells.every((c) => c === null || c === undefined || String(c).trim() === "");
}

// Real price lists format numbers inconsistently — "1,234", "₪120", "50%".
// Strip the decoration rather than let Number() silently turn it into NaN
// and drop the value.
export function parseNumericCell(cell: unknown): number {
  if (typeof cell === "number") return cell;
  const cleaned = String(cell).trim().replace(/[₪,%\s]/g, "");
  return cleaned ? Number(cleaned) : NaN;
}

function findHeaderRow(rows: unknown[][]): number | null {
  let best = { index: -1, score: 0 };
  for (let i = 0; i < Math.min(HEADER_SEARCH_ROWS, rows.length); i++) {
    const score = headerScore(rows[i] ?? []);
    if (score > best.score) best = { index: i, score };
  }
  return best.score >= MIN_HEADER_SCORE ? best.index : null;
}

function classifyColumns(headerRow: unknown[]): { columns: ClassifiedColumn[]; unknownLabels: string[] } {
  const columns: ClassifiedColumn[] = [];
  const unknownLabels: string[] = [];
  headerRow.forEach((cell, index) => {
    const label = cell === null || cell === undefined ? "" : String(cell).trim();
    if (!label) return;
    const field = classifyHeader(label);
    columns.push({ index, label, field });
    if (field === "UNKNOWN") unknownLabels.push(label);
  });
  return { columns, unknownLabels };
}

// A row is highlighted solid yellow AND carries no SKU/price/stock data —
// that combination (color + absence of product data) is what distinguishes
// a real "אוזניות" / "GAGGIA" section header from a product row that
// happens to have a yellow note cell for some other reason.
function rowDividerText(cells: unknown[], sheet: XLSX.WorkSheet | undefined, rowIndex: number): string | null {
  if (!sheet) return null;
  let isYellow = false;
  let text: string | null = null;
  for (let c = 0; c < cells.length; c++) {
    const ref = XLSX.utils.encode_cell({ r: rowIndex, c });
    const cell = sheet[ref];
    if (cell?.s?.fgColor?.rgb === DIVIDER_FILL_RGB) isYellow = true;
    if (!text && typeof cell?.v === "string" && cell.v.trim()) text = cell.v.trim();
  }
  return isYellow ? text : null;
}

export function parseSheetRows(sheetName: string, rows: unknown[][], sheet?: XLSX.WorkSheet): ParsedSheet | null {
  const headerRowIndex = findHeaderRow(rows);
  if (headerRowIndex === null) return null;

  const { columns, unknownLabels } = classifyColumns(rows[headerRowIndex] ?? []);
  const parsedRows: ParsedRow[] = [];
  let currentSectionLabel: string | null = null;

  // Some sheets write the brand once per block in a real BRAND column and
  // leave it blank for every row underneath (AEG on row 1, then 4 more AEG
  // rows with nothing in that column) — same yellow-highlight convention as
  // section dividers, just written directly on a product row instead of a
  // separate header row above it. Track the last confirmed value in that
  // column and forward-fill it onto the rows that leave it blank.
  //
  // The fill has to expire, and originally it never did: currentBrand was
  // set by a yellow cell and then survived to the end of the sheet, so the
  // moment a sheet stopped colouring its block headers — which real sheets
  // do partway down — every remaining row was stamped with a brand from an
  // arbitrary distance above it. That is how Bauknecht and TCL fridges
  // ended up filed under AEG, Bosch models under Beko, and Gorenje under
  // Imperial. It ends at a section divider (the divider is the block
  // boundary) and at any row that names a different, plausible brand of its
  // own — an uncoloured block header is still a block header.
  const brandColIndex = columns.find((c) => c.field === "BRAND")?.index;
  let currentBrand: string | null = null;

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const cells = rows[r] ?? [];
    if (isBlankRow(cells)) continue;

    if (sheet && brandColIndex !== undefined) {
      const ref = XLSX.utils.encode_cell({ r, c: brandColIndex });
      const cell = sheet[ref];
      if (cell?.s?.fgColor?.rgb === DIVIDER_FILL_RGB && typeof cell.v === "string" && cell.v.trim()) {
        currentBrand = cell.v.trim();
      }
    }

    const values: ParsedRow["values"] = {};
    const raw: ParsedRow["raw"] = {};
    let hasProductSignal = false; // any SKU, price, or stock value — distinguishes a real row from a section divider

    for (const col of columns) {
      const cell = cells[col.index];
      if (cell === null || cell === undefined || String(cell).trim() === "") continue;
      raw[col.label] = cell as string | number;

      if (col.field === "UNKNOWN" || col.field === "IGNORED") continue;

      const isNumericField =
        col.field === "RETAIL_PRICE" ||
        col.field === "MIN_SALE_PRICE" ||
        col.field === "INTERNAL_COST" ||
        col.field === "CASH_PRICE" ||
        col.field === "MANAGER_PRICE" ||
        col.field === "MARGIN_PERCENT" ||
        col.field === "WAREHOUSE_STOCK" ||
        col.field === "SHOWROOM_STOCK" ||
        col.field === "SUPPLIER_STOCK" ||
        col.field === "BONDED_STOCK" ||
        col.field === "SELLABLE_STOCK";

      const value = isNumericField ? parseNumericCell(cell) : cell;
      if (isNumericField && Number.isNaN(value)) continue;

      if (!values[col.field]) values[col.field] = [];
      values[col.field]!.push(value as never);

      if (col.field === "SKU" || isNumericField) hasProductSignal = true;
    }

    if (!hasProductSignal) {
      // Not a product row — either blank noise, or a genuine section divider
      // ("אוזניות", "GAGGIA", ...). Only the latter updates the running
      // context that gets attached to every product row underneath it, and
      // it closes whatever brand block was open: rows below a new divider
      // belong to that divider, not to the last brand seen above it.
      const dividerText = rowDividerText(cells, sheet, r);
      if (dividerText) {
        currentSectionLabel = dividerText;
        currentBrand = null;
      }
      continue;
    }

    // A row whose only product signal is a number in a stock column is the
    // block's total, not a product.
    //
    // hasProductSignal above is set by a SKU *or any numeric field*, and the
    // stock columns are numeric, so a footer row that sums the brand's units
    // and carries nothing else reads as a product row. Ten do, one per block
    // that has a footer, and the number they carry is the sum: שאוב לורנס
    // with 355, שטארק 228, שולטס 157, TCL 65. The title comes out as the
    // brand name or, where the cell is empty, as the sheet's own name and
    // the row index.
    //
    // They are not harmless. The one on מדיחים 165 became SKU 0812, a
    // Schulthess dishwasher with **157 units** at 3,800 ₪, and the back
    // office reported ₪596,600 of stock sitting off the site — the largest
    // figure on that page, and none of it exists. The others are quieter
    // only because their blocks are cheaper.
    //
    // The test is identity and money together: a real product row carries a
    // SKU, or a model, or something in a price or cost column — or, failing
    // all three, a model code inside its free text.
    //
    // That last clause is not decoration, and leaving it out is the version
    // of this guard that was wrong. "No SKU, no model column, no price"
    // alone drops eleven rows, and the eleventh is מיקסרים 153: "בורמן קוצץ
    // ירקות 6 סכינים דגם MMR08R2 אדום", 400W, two units in Hadera. A real
    // line the supplier priced at nothing. What separates it from a footer
    // is the model code in its own description — a footer's text is the
    // brand and nothing else ("שולטס", "שאוב לורנס", "TCL"), or where even
    // that cell is empty, the sheet's own name. So a token carrying both a
    // letter and a digit counts as naming something, and with it the guard
    // drops exactly the ten footers.
    //
    // Checked after the divider branch and not folded into it: a footer sits
    // at the *end* of a block, so treating it as a section divider would
    // close the block one row late and hand its label to the next brand's
    // rows. This drops the row and touches no running state.
    const freeText = [values.DESCRIPTION, values.NOTES]
      .flat()
      .filter((v): v is string => typeof v === "string")
      .join(" ");
    /* A model code is a token with both a letter and a digit in it. Four
       characters, the same floor the model comparisons use: "6" and "2" in
       "6 סכינים" are a blade count, not a name. */
    const textNamesAModel = (freeText.match(/[A-Za-z0-9][A-Za-z0-9./-]{3,}/g) ?? []).some(
      (t) => /[A-Za-z]/.test(t) && /[0-9]/.test(t)
    );
    /* A SKU cell only counts as naming something when it holds a SKU. The
       sheets put the importer's rep and their service number on a row of
       their own, in that column — 168 of them, plus five `סה"כ` totals — and
       "any non-empty SKU cell" accepted every one as a product that names
       itself. They were kept out until now only because they also have no
       stock, and the row below this one no longer skips a stock-less row.
       See looksLikeSupplierSku for the measured shape. */
    const skuNamesSomething = (values.SKU ?? []).some((v) => looksLikeSupplierSku(String(v)));
    const namesSomething =
      skuNamesSomething || (values.MODEL?.length ?? 0) > 0 || textNamesAModel;
    const carriesMoney =
      (values.RETAIL_PRICE?.length ?? 0) > 0 ||
      (values.MIN_SALE_PRICE?.length ?? 0) > 0 ||
      (values.MANAGER_PRICE?.length ?? 0) > 0 ||
      (values.CASH_PRICE?.length ?? 0) > 0 ||
      (values.INTERNAL_COST?.length ?? 0) > 0;
    if (!namesSomething && !carriesMoney) continue;

    // A row carrying its own believable brand starts a new block, whether or
    // not anyone coloured it. Junk in that column (a promo code, a stray
    // number) fails isPlausibleBrandCell and neither wins nor propagates,
    // which is the distrust the highlight convention was standing in for.
    const ownBrand = values.BRAND?.find((v) => typeof v === "string" && v.trim());
    if (typeof ownBrand === "string" && isPlausibleBrandCell(ownBrand)) {
      currentBrand = ownBrand.trim();
    }

    parsedRows.push({ rowIndex: r, values, raw, sectionLabel: currentSectionLabel, inheritedBrand: currentBrand });
  }

  return { sheetName, headerRowIndex, columns, unknownLabels, rows: parsedRows };
}

export function parseWorkbook(buffer: Buffer, sourceKey: SourceKey): ParsedWorkbook {
  const wb = XLSX.read(buffer, { type: "buffer", cellStyles: true });
  const sheets: ParsedSheet[] = [];
  const skippedSheets: string[] = [];

  for (const sheetName of wb.SheetNames) {
    if (!isProductSheet(sourceKey, sheetName)) {
      skippedSheets.push(sheetName);
      continue;
    }
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });
    const parsed = parseSheetRows(sheetName, rows, sheet);
    if (!parsed) {
      skippedSheets.push(sheetName);
      continue;
    }
    sheets.push(parsed);
  }

  return { sheets, skippedSheets };
}
