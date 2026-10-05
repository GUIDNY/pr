"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { parseSpecAttributesFile, parseSpecSchemaFile, type ProductSpecs, type RowProblem, type SpecSchema } from "@/lib/spec-import";
import { SPEC_IMPORT_BATCH } from "@/lib/spec-import-constants";
import {
  importSpecBatchAction,
  applySpecSchemaAction,
  finishSpecImportAction,
  type BatchResult,
  type SchemaResult,
} from "@/actions/admin-spec-import";

type Totals = {
  products: number;
  matched: number;
  unknownSlugs: string[];
  rowsBefore: number;
  rowsAfter: number;
  attributesToCreate: BatchResult["attributesToCreate"];
  labelMismatches: BatchResult["labelMismatches"];
  losingRows: BatchResult["losingRows"];
  problems: RowProblem[];
};

const empty = (): Totals => ({
  products: 0,
  matched: 0,
  unknownSlugs: [],
  rowsBefore: 0,
  rowsAfter: 0,
  attributesToCreate: [],
  labelMismatches: [],
  losingRows: [],
  problems: [],
});

/**
 * The spec hand-off, applied from the browser in batches.
 *
 * The file is parsed here, so a malformed one is refused before a byte
 * reaches the server, and the batches go up one at a time with a progress
 * bar — a 1,700-product file is seventeen requests of a few seconds each
 * rather than one request that a serverless function would cut off.
 *
 * Dry run first, always. Apply is a second button that only appears after
 * a dry run has reported, and it replaces every product's spec rows with
 * the file's — the one thing this page does that cannot be undone from
 * the page.
 */
export function SpecImport() {
  const [products, setProducts] = useState<ProductSpecs[] | null>(null);
  const [fileProblems, setFileProblems] = useState<RowProblem[]>([]);
  const [schema, setSchema] = useState<SpecSchema | null>(null);
  const [schemaResult, setSchemaResult] = useState<SchemaResult | null>(null);
  const [phase, setPhase] = useState<"idle" | "dry" | "apply">("idle");
  const [progress, setProgress] = useState(0);
  const [dry, setDry] = useState<Totals | null>(null);
  const [applied, setApplied] = useState<Totals | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  async function readAttributes(file: File | undefined) {
    setDry(null);
    setApplied(null);
    setError(null);
    if (!file) return setProducts(null);
    try {
      const parsed = parseSpecAttributesFile(JSON.parse(await file.text()));
      setProducts(parsed.products);
      setFileProblems(parsed.problems);
    } catch (e) {
      setProducts(null);
      setError(`הקובץ לא נקרא: ${(e as Error).message}`);
    }
  }

  async function readSchema(file: File | undefined) {
    setSchemaResult(null);
    if (!file) return setSchema(null);
    try {
      setSchema(parseSpecSchemaFile(JSON.parse(await file.text())));
    } catch (e) {
      setSchema(null);
      setError(`קובץ הסכמה לא נקרא: ${(e as Error).message}`);
    }
  }

  async function run(apply: boolean) {
    if (!products) return;
    setPhase(apply ? "apply" : "dry");
    setProgress(0);
    setError(null);
    const totals = empty();
    totals.products = products.length;
    totals.problems = [...fileProblems];
    try {
      if (schema) setSchemaResult(await applySpecSchemaAction(schema, apply));
      for (let i = 0; i < products.length; i += SPEC_IMPORT_BATCH) {
        const batch = products.slice(i, i + SPEC_IMPORT_BATCH);
        const r = await importSpecBatchAction(batch, apply);
        totals.matched += r.matched;
        totals.unknownSlugs.push(...r.unknownSlugs);
        totals.rowsBefore += r.rowsBefore;
        totals.rowsAfter += r.rowsAfter;
        totals.attributesToCreate.push(...r.attributesToCreate);
        totals.labelMismatches.push(...r.labelMismatches);
        totals.losingRows.push(...r.losingRows);
        totals.problems.push(...r.problems);
        setProgress(Math.round(((i + batch.length) / products.length) * 100));
      }
      if (apply) {
        await finishSpecImportAction({ products: totals.matched, rows: totals.rowsAfter });
        setApplied(totals);
      } else {
        setDry(totals);
      }
    } catch (e) {
      setError(`${apply ? "הייבוא" : "הבדיקה"} נעצר: ${(e as Error).message}`);
    } finally {
      setPhase("idle");
    }
  }

  const busy = phase !== "idle";
  const rowCount = products?.reduce((n, p) => n + p.rows.length, 0) ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="border-border bg-card grid gap-4 rounded-xl border p-5 sm:grid-cols-2">
        <div>
          <Label className="mb-1.5">spec-attributes.json (חובה)</Label>
          <Input type="file" accept=".json,application/json" disabled={busy} onChange={(e) => readAttributes(e.target.files?.[0])} />
          {products && (
            <p className="text-muted-foreground mt-2 text-sm">
              {products.length.toLocaleString("he-IL")} מוצרים · {rowCount.toLocaleString("he-IL")} שורות
              {fileProblems.length > 0 && ` · ${fileProblems.length} שורות נדחו בקריאה`}
            </p>
          )}
        </div>
        <div>
          <Label className="mb-1.5">spec-schema.json (רשות — סדר תצוגה)</Label>
          <Input type="file" accept=".json,application/json" disabled={busy} onChange={(e) => readSchema(e.target.files?.[0])} />
          {schema && (
            <p className="text-muted-foreground mt-2 text-sm">
              {Object.keys(schema.attributes).length} תכונות · {Object.keys(schema.categorySchema).length} קטגוריות
            </p>
          )}
        </div>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => run(false)} disabled={!products || busy}>
          {phase === "dry" ? "בודק…" : "בדיקה (בלי לכתוב)"}
        </Button>
        {busy && <Progress value={progress} className="w-48" />}
      </div>

      {dry && <Report title="תוצאת הבדיקה" totals={dry} schemaResult={schemaResult} />}

      {dry && !applied && (
        <div className="border-destructive/40 bg-destructive/5 flex flex-col gap-3 rounded-xl border p-5">
          <p className="text-sm font-medium">
            החלפה בפועל מוחקת את כל שורות המפרט של {dry.matched.toLocaleString("he-IL")} המוצרים שנמצאו ומחליפה אותן בשורות שבקובץ.
            כל עריכה ידנית שנעשתה אחרי הייצוא שממנו נבנה הקובץ תימחק.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={busy} />
            הבנתי. הבסיס למדידה קפוא ואפשר להחליף.
          </label>
          <div>
            <Button variant="destructive" onClick={() => run(true)} disabled={!confirmed || busy}>
              {phase === "apply" ? "מחליף…" : "החלפה בפועל"}
            </Button>
          </div>
        </div>
      )}

      {applied && <Report title="הייבוא הושלם" totals={applied} schemaResult={schemaResult} />}
    </div>
  );
}

function Report({ title, totals, schemaResult }: { title: string; totals: Totals; schemaResult: SchemaResult | null }) {
  const n = (v: number) => v.toLocaleString("he-IL");
  return (
    <div className="border-border bg-card flex flex-col gap-3 rounded-xl border p-5 text-sm">
      <h2 className="font-bold">{title}</h2>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
        <dt className="text-muted-foreground">מוצרים בקובץ</dt>
        <dd>{n(totals.products)}</dd>
        <dt className="text-muted-foreground">נמצאו במסד</dt>
        <dd>{n(totals.matched)}</dd>
        <dt className="text-muted-foreground">שורות לפני</dt>
        <dd>{n(totals.rowsBefore)}</dd>
        <dt className="text-muted-foreground">שורות אחרי</dt>
        <dd>{n(totals.rowsAfter)}</dd>
        <dt className="text-muted-foreground">תכונות שייווצרו</dt>
        <dd>{n(totals.attributesToCreate.length)}</dd>
        <dt className="text-muted-foreground">שורות שנדחו</dt>
        <dd>{n(totals.problems.length)}</dd>
        <dt className="text-muted-foreground">slug לא נמצא</dt>
        <dd>{n(totals.unknownSlugs.length)}</dd>
        <dt className="text-muted-foreground">תווית שונה מהמסד</dt>
        <dd>{n(totals.labelMismatches.length)}</dd>
        <dt className={totals.losingRows.length > 0 ? "text-destructive font-medium" : "text-muted-foreground"}>מוצרים שיאבדו שורות</dt>
        <dd className={totals.losingRows.length > 0 ? "text-destructive font-medium" : ""}>{n(totals.losingRows.length)}</dd>
      </dl>
      {totals.losingRows.length > 0 && (
        <p className="text-destructive text-sm">
          לקובץ יש פחות שורות מאשר במסד עבור המוצרים האלה. קובץ החלפה נבנה מהמסד, אז פחות אומר מפתח שהבילדר השמיט.
          לא להחליף לפני שזה מוסבר.
        </p>
      )}
      {schemaResult && (
        <p className="text-muted-foreground">
          סכמה: {schemaResult.categoriesMatched} קטגוריות, {schemaResult.attributesCreated} תכונות חדשות, {schemaResult.attributesUpdated} עודכנו
          {schemaResult.unknownCategories.length > 0 && ` · קטגוריות לא מוכרות: ${schemaResult.unknownCategories.join(", ")}`}
        </p>
      )}
      {totals.unknownSlugs.length > 0 && (
        <Details label={`slugs שלא נמצאו (${totals.unknownSlugs.length})`} lines={totals.unknownSlugs} />
      )}
      {totals.problems.length > 0 && (
        <Details label={`שורות שנדחו (${totals.problems.length})`} lines={totals.problems.map((p) => `${p.slug} · ${p.key} = "${p.value}" — ${p.reason}`)} />
      )}
      {totals.attributesToCreate.length > 0 && (
        <Details label={`תכונות שייווצרו (${totals.attributesToCreate.length})`} lines={totals.attributesToCreate.map((a) => `${a.category} · ${a.key} (${a.label})`)} />
      )}
      {totals.losingRows.length > 0 && (
        <Details label={`מוצרים שיאבדו שורות (${totals.losingRows.length})`} lines={totals.losingRows.map((l) => `${l.slug}: ${l.before} → ${l.after}`)} />
      )}
      {totals.labelMismatches.length > 0 && (
        <Details
          label={`תוויות שבקובץ שונות מהמסד — המסד נשמר (${totals.labelMismatches.length})`}
          lines={totals.labelMismatches.map((m) => `${m.slug} · ${m.key}: קובץ "${m.file}" / מסד "${m.db}"`)}
        />
      )}
    </div>
  );
}

function Details({ label, lines }: { label: string; lines: string[] }) {
  return (
    <details>
      <summary className="cursor-pointer">{label}</summary>
      <pre className="bg-muted mt-2 max-h-64 overflow-auto rounded-md p-3 text-xs" dir="ltr">
        {lines.slice(0, 500).join("\n")}
        {lines.length > 500 ? `\n… ועוד ${lines.length - 500}` : ""}
      </pre>
    </details>
  );
}
