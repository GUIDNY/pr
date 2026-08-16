import * as XLSX from "xlsx";
import { classifyHeader, headerScore } from "./classifier";
import { isProductSheet, type SourceKey } from "./sheet-map";
import type { ClassifiedColumn, ParsedRow, ParsedSheet, ParsedWorkbook } from "./types";

const HEADER_SEARCH_ROWS = 5;
const MIN_HEADER_SCORE = 3;

function isBlankRow(cells: unknown[]) {
  return cells.every((c) => c === null || c === undefined || String(c).trim() === "");
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

function parseSheet(sheetName: string, rows: unknown[][]): ParsedSheet | null {
  const headerRowIndex = findHeaderRow(rows);
  if (headerRowIndex === null) return null;

  const { columns, unknownLabels } = classifyColumns(rows[headerRowIndex] ?? []);
  const parsedRows: ParsedRow[] = [];

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const cells = rows[r] ?? [];
    if (isBlankRow(cells)) continue;

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

      const value = isNumericField ? Number(cell) : cell;
      if (isNumericField && Number.isNaN(value)) continue;

      if (!values[col.field]) values[col.field] = [];
      values[col.field]!.push(value as never);

      if (col.field === "SKU" || isNumericField) hasProductSignal = true;
    }

    if (!hasProductSignal) continue; // likely a section-divider row (category label with no data)

    parsedRows.push({ rowIndex: r, values, raw });
  }

  return { sheetName, headerRowIndex, columns, unknownLabels, rows: parsedRows };
}

export function parseWorkbook(buffer: Buffer, sourceKey: SourceKey): ParsedWorkbook {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheets: ParsedSheet[] = [];
  const skippedSheets: string[] = [];

  for (const sheetName of wb.SheetNames) {
    if (!isProductSheet(sourceKey, sheetName)) {
      skippedSheets.push(sheetName);
      continue;
    }
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, defval: null });
    const parsed = parseSheet(sheetName, rows);
    if (!parsed) {
      skippedSheets.push(sheetName);
      continue;
    }
    sheets.push(parsed);
  }

  return { sheets, skippedSheets };
}
