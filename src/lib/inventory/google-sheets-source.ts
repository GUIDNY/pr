import * as XLSX from "xlsx";
import { parseSheetRows } from "./excel-parser";
import { categoryForUnscopedSheet } from "./sheet-map";
import type { ParsedSheet, ParsedWorkbook } from "./types";

// Public export — works for any spreadsheet shared as "Anyone with the link
// can view", no Google API credentials needed. Fetching the whole
// spreadsheet as .xlsx (rather than one tab's CSV) means a multi-tab
// Google Sheet gets parsed exactly like an uploaded Excel workbook, reusing
// the same per-tab header classifier and one category per tab, instead of
// being limited to a single flat CSV tab.
export function extractSpreadsheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

export function extractGid(url: string): string {
  const match = url.match(/[?&#]gid=(\d+)/);
  return match ? match[1] : "0";
}

export function buildXlsxExportUrl(spreadsheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx`;
}

export async function fetchSheetWorkbook(spreadsheetId: string): Promise<Buffer> {
  const url = buildXlsxExportUrl(spreadsheetId);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(
      res.status === 401 || res.status === 403
        ? "אין גישה לגליון — ודא ששיתוף הגליון מוגדר ל'כל מי שיש לו את הקישור - צופה'"
        : `נכשל בטעינת הגליון (HTTP ${res.status})`
    );
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("text/html")) {
    throw new Error("אין גישה לגליון — ודא ששיתוף הגליון מוגדר ל'כל מי שיש לו את הקישור - צופה'");
  }
  return Buffer.from(await res.arrayBuffer());
}

// categoryOverride forces every tab to one category (useful for a
// single-purpose sheet); otherwise each tab's category is looked up by its
// own name.
export function parseGoogleWorkbook(buffer: Buffer, categoryOverride?: string | null): ParsedWorkbook {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheets: ParsedSheet[] = [];
  const skippedSheets: string[] = [];

  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, defval: null });
    const parsed = parseSheetRows(sheetName, rows);
    if (!parsed) {
      skippedSheets.push(sheetName);
      continue;
    }
    sheets.push(parsed);
  }

  return { sheets, skippedSheets };
}

export function categoryForGoogleSheetTab(sheetName: string, categoryOverride?: string | null): string | null {
  return categoryOverride ?? categoryForUnscopedSheet(sheetName);
}
