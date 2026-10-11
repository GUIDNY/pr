"use server";

import { requireCatalogPage } from "@/lib/auth";
import { getLiveProducts } from "@/lib/queries/inventory-control";

/**
 * The published catalogue as a spreadsheet.
 *
 * The gate is re-checked here and not only on the page. A server action is
 * an endpoint: the page decides what to render, this decides what may
 * happen, and the second one is the one that matters — this file carries
 * the supplier's cost on every line, which is the number the price screen
 * refuses to let anyone even edit.
 */

/* Excel on Hebrew Windows opens a UTF-8 file as cp1255 unless it finds a
   byte-order mark, and the whole file comes out as gibberish. One character
   is the difference between a file that opens and a support call. */
const BOM = "﻿";

/* Semicolons, not commas. Excel in a Hebrew locale uses the list separator
   from the regional settings, and on he-IL that is a semicolon — a
   comma-separated file lands entirely in column A. */
const SEP = ";";

function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  /* A quote, a separator, or a newline inside a title would otherwise end
     the field early and shift every column after it. Product titles here
     contain inches as a double quote — 65 אינץ' and 48" both appear — so
     this is the common case, not the edge one. */
  return /["\n\r;,]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function exportLiveProductsCsvAction(): Promise<{
  filename: string;
  csv: string;
  rows: number;
}> {
  await requireCatalogPage();
  const products = await getLiveProducts();

  const header = [
    "מק\"ט",
    "שם המוצר",
    "מותג",
    "קטגוריה",
    "מחיר מכירה",
    "מחיר עלות",
    "רווח ליחידה",
    "אחוז רווח",
    "מלאי",
    "שווי מלאי במחיר מכירה",
    "קישור",
  ];

  const lines = products.map((p) => {
    const cost = p.supplierCost !== null && p.supplierCost > 0 ? p.supplierCost : null;
    /* Left empty rather than zero where the cost is unknown. A zero here
       reads as "no cost", which would show a 100% margin on 81 products
       that simply predate the cost column. */
    const profit = cost === null ? null : Math.round((p.price - cost) * 100) / 100;
    const margin = cost === null || p.price <= 0 ? null : Math.round(((p.price - cost) / p.price) * 1000) / 10;
    return [
      cell(p.sku),
      cell(p.title),
      cell(p.brand ?? ""),
      cell(p.category ?? ""),
      cell(p.price),
      cell(cost),
      cell(profit),
      cell(margin === null ? "" : `${margin}%`),
      cell(p.stockQty),
      cell(Math.round(p.price * p.stockQty)),
      cell(`https://buytoday.co.il/product/${p.slug}`),
    ].join(SEP);
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return {
    filename: `buytoday-מוצרים-באתר-${stamp}.csv`,
    csv: BOM + [header.join(SEP), ...lines].join("\r\n"),
    rows: products.length,
  };
}
