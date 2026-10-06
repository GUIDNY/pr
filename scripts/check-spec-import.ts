/**
 * The rules a spec hand-off row has to satisfy before it is written.
 *
 * Each refusal below is a defect the current attribute table actually
 * carried (a unit doubled inside the value, "לא צוין" stated as a fact, a
 * price in a warranty row) or a shape that would break the page. No
 * database.
 *
 *   npm run check:spec-import
 */
import { validateRow, parseSpecAttributesFile, parseSpecSchemaFile } from "../src/lib/spec-import";

let failures = 0;
function is(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${ok ? "" : `\n          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`}`);
}
const reason = (raw: unknown) => {
  const r = validateRow("p", raw);
  return "problem" in r ? r.problem.reason : "ok";
};

console.log("\naccepted");
is("a plain row", reason({ key: "capacity_liters", label: "נפח", unit: "ליטר", inputType: "number", value: "25" }), "ok");
is("text with a unit inside is fine when the attribute has none", reason({ key: "power", label: "הספק", unit: null, inputType: "text", value: "1000W" }), "ok");
is("boolean", reason({ key: "ice_maker", label: "מתקן קרח", unit: null, inputType: "boolean", value: "כן" }), "ok");
/* The twelve rows the price guard refused in the real import, because
   `\b` is ASCII-only and never fires next to a Hebrew letter, so "משקל"
   read as "שקל". Eleven of them were this exact defrost value. */
is("משקל is not a price", reason({ key: "defrost", label: "הפשרה", unit: null, inputType: "text", value: "לפי משקל ולפי זמן" }), "ok");
is("מינון לפי משקל is not a price", reason({ key: "grinder", label: "מטחנה", unit: null, inputType: "text", value: "מובנית, מינון לפי משקל" }), "ok");
is("שחור is not שח", reason({ key: "color", label: "צבע", unit: null, inputType: "text", value: "שחור" }), "ok");
is("key is lower-cased", (() => { const r = validateRow("p", { key: "Width_CM", label: "רוחב", unit: "ס\"מ", inputType: "number", value: "60" }); return "row" in r ? r.row.key : null; })(), "width_cm");

console.log("\nrefused");
is("unit doubled in the value", reason({ key: "width_cm", label: "רוחב", unit: "ס\"מ", inputType: "text", value: "106.7 ס\"מ" }), "unit repeated inside the value — it renders twice");
is("price in a spec", reason({ key: "warranty_text", label: "אחריות", unit: null, inputType: "text", value: "שנה + 4 ב 199 שח" }), "a price is not a spec");
is("a price in שקלים", reason({ key: "x", label: "X", unit: null, inputType: "text", value: "1,200 שקלים" }), "a price is not a spec");
is("a price in ש\"ח", reason({ key: "x", label: "X", unit: null, inputType: "text", value: "349 ש\"ח" }), "a price is not a spec");
is("says nothing", reason({ key: "programs", label: "מספר תוכניות", unit: null, inputType: "text", value: "לא צוין" }), "value says nothing (לא צוין / n/a)");
is("number field with prose", reason({ key: "burners", label: "מספר מבערים", unit: null, inputType: "number", value: "SABAF פליז" }), "number field needs a bare number (the unit is on the attribute)");
is("empty value", reason({ key: "x", label: "X", unit: null, inputType: "text", value: "  " }), "empty value");
is("bad key", reason({ key: "רוחב", label: "רוחב", unit: null, inputType: "text", value: "60" }), "key must be a-z, 0-9 and _ only");
is("bad inputType", reason({ key: "x", label: "X", unit: null, inputType: "range", value: "1" }), "inputType must be one of text|number|select|boolean");

console.log("\nfiles");
const parsed = parseSpecAttributesFile({
  "a-slug": [
    { key: "width_cm", label: "רוחב", unit: "ס\"מ", inputType: "number", value: "60" },
    { key: "width_cm", label: "רוחב", unit: "ס\"מ", inputType: "number", value: "61" },
    { key: "bad", label: "X", unit: null, inputType: "text", value: "לא ידוע" },
  ],
  "b-slug": [],
});
is("products parsed", parsed.products.map((p) => [p.slug, p.rows.length]), [["a-slug", 1], ["b-slug", 0]]);
is("duplicate key and empty value reported", parsed.problems.map((p) => p.reason), ["duplicate key for this product", "value says nothing (לא צוין / n/a)"]);

const schema = parseSpecSchemaFile({
  attributes: { width_cm: { label: "רוחב", unit: "ס\"מ", inputType: "number" }, "Bad Key": { label: "x" } },
  categorySchema: { "washing-machines": ["width_cm", { key: "capacity_kg" }, "width_cm"], empty: [] },
});
is("schema attributes", Object.keys(schema.attributes), ["width_cm"]);
is("schema order, deduped, objects accepted", schema.categorySchema, { "washing-machines": ["width_cm", "capacity_kg"] });

console.log(failures === 0 ? "\nall good" : `\n${failures} failing`);
process.exit(failures === 0 ? 0 : 1);
