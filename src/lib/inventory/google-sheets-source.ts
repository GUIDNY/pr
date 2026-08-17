import * as XLSX from "xlsx";
import { parseSheetRows } from "./excel-parser";
import type { ParsedSheet } from "./types";

// Public CSV export — works for any sheet shared as "Anyone with the link
// can view", no Google API credentials needed. This is intentionally the
// same trade-off as the Excel path: read-only, no OAuth, source of truth
// stays in Google Sheets.
export function extractSpreadsheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

export function extractGid(url: string): string {
  const match = url.match(/[?&#]gid=(\d+)/);
  return match ? match[1] : "0";
}

export function buildCsvExportUrl(spreadsheetId: string, gid: string): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
}

export async function fetchSheetCsv(spreadsheetId: string, gid: string): Promise<string> {
  const url = buildCsvExportUrl(spreadsheetId, gid);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(
      res.status === 401 || res.status === 403
        ? "אין גישה לגליון — ודא ששיתוף הגליון מוגדר ל'כל מי שיש לו את הקישור - צופה'"
        : `נכשל בטעינת הגליון (HTTP ${res.status})`
    );
  }
  const text = await res.text();
  if (text.trimStart().startsWith("<!DOCTYPE") || text.trimStart().startsWith("<html")) {
    throw new Error("אין גישה לגליון — ודא ששיתוף הגליון מוגדר ל'כל מי שיש לו את הקישור - צופה'");
  }
  return text;
}

export function parseSheetCsv(csvText: string, sheetLabel: string): ParsedSheet | null {
  const wb = XLSX.read(csvText, { type: "string" });
  const firstSheetName = wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[firstSheetName], { header: 1, defval: null });
  return parseSheetRows(sheetLabel, rows);
}
