// The rules the two agent-facing endpoints' field vocabularies have to
// obey. They are enforced at runtime now — an unrecognised key is a 400
// rather than a silent drop — which makes a mistake in these tables an
// outage for the caller rather than a typo, so they are checked.
//
//   npm run check:api
import {
  ENRICH_ITEM_KEYS,
  ENRICH_TOP_LEVEL_KEYS,
  CREATE_ITEM_KEYS,
  CREATE_TOP_LEVEL_KEYS,
  unknownKeysIn,
  type KeyCheck,
} from "../src/lib/integrations/api-fields";

let failed = 0;
const fail = (msg: string) => {
  console.log(`FAIL  ${msg}`);
  failed++;
};
let checks = 0;
const ok = () => checks++;

const TABLES: [string, KeyCheck][] = [
  ["enrich item", ENRICH_ITEM_KEYS],
  ["enrich body", ENRICH_TOP_LEVEL_KEYS],
  ["create item", CREATE_ITEM_KEYS],
  ["create body", CREATE_TOP_LEVEL_KEYS],
];

for (const [name, table] of TABLES) {
  const known = new Set(table.known);

  // An alias has to point somewhere real. Sending a caller to a field that
  // does not exist is worse than the bare "unrecognised field" they would
  // otherwise have got, because they will believe it.
  for (const [wrong, right] of Object.entries(table.aliases ?? {})) {
    if (right.startsWith("(")) {
      if (!right.endsWith(")")) fail(`${name}: hint for "${wrong}" opens a parenthesis it never closes`);
      else ok();
      continue;
    }
    if (!known.has(right)) fail(`${name}: alias "${wrong}" points at "${right}", which is not a field of this endpoint`);
    else ok();
  }

  // A key cannot be both accepted and flagged as a misspelling of another.
  // The known set wins at runtime, so the alias would simply never fire.
  for (const wrong of Object.keys(table.aliases ?? {})) {
    if (known.has(wrong) && !(table.aliases?.[wrong] ?? "").startsWith("(")) {
      fail(`${name}: "${wrong}" is both an accepted field and an alias for "${table.aliases?.[wrong]}" — the alias can never fire`);
    } else ok();
  }

  if (table.known.length !== known.size) fail(`${name}: duplicate entries in the known list`);
  else ok();
}

// Fields refused on purpose must still be *known*, or the caller gets the
// generic unrecognised-field error instead of the reason. This is the whole
// point of the exercise: "isPublished is not settable, and here is why"
// beats both silence and "unrecognised field".
for (const field of ["price", "stockQty", "isPublished"]) {
  if (!ENRICH_ITEM_KEYS.known.includes(field)) {
    fail(`enrich item: "${field}" is refused deliberately, so it must be a known key that answers with a reason`);
  } else ok();
}

// title and name are the same field under two spellings. The API's own GET
// calls it title, so a caller reading a product and sending a correction
// back must not have to rename it.
for (const spelling of ["title", "name"]) {
  if (!ENRICH_ITEM_KEYS.known.includes(spelling)) fail(`enrich item: "${spelling}" must be accepted for the product's display name`);
  else ok();
}

// Every batch flag has to be accepted at the top level, or a caller that
// sets one gets a 400 for using the documented option.
for (const flag of ["items", "dryRun", "appendImages", "replaceImages", "overwriteDescription", "sourceBackfillOnly", "overwrite"]) {
  if (!ENRICH_TOP_LEVEL_KEYS.known.includes(flag)) fail(`enrich body: batch flag "${flag}" is not accepted at the top level`);
  else ok();
}
// A single item may be sent unwrapped, so every item field is legal at the
// top level too.
for (const field of ENRICH_ITEM_KEYS.known) {
  if (!ENRICH_TOP_LEVEL_KEYS.known.includes(field)) fail(`enrich body: item field "${field}" is rejected when the item is sent unwrapped`);
  else ok();
}
for (const field of CREATE_ITEM_KEYS.known) {
  if (!CREATE_TOP_LEVEL_KEYS.known.includes(field)) fail(`create body: item field "${field}" is rejected when the item is sent unwrapped`);
  else ok();
}

// The wrappers that were actually tried against the live API, and the
// spellings an agent reached for. Each must be caught and named.
const MISTAKES: [string, KeyCheck, string][] = [
  ["products", ENRICH_TOP_LEVEL_KEYS, "items"],
  ["product", ENRICH_TOP_LEVEL_KEYS, "items"],
  ["data", CREATE_TOP_LEVEL_KEYS, "items"],
  ["published", ENRICH_ITEM_KEYS, "isPublished"],
  ["visible", ENRICH_ITEM_KEYS, "isPublished"],
  ["hidden", ENRICH_ITEM_KEYS, "isPublished"],
  ["isActive", ENRICH_ITEM_KEYS, "isPublished"],
  ["active", ENRICH_ITEM_KEYS, "isPublished"],
  ["status", ENRICH_ITEM_KEYS, "isPublished"],
  ["specs", ENRICH_ITEM_KEYS, "technicalSpec"],
  ["imageUrls", ENRICH_ITEM_KEYS, "images"],
  ["name", CREATE_ITEM_KEYS, "title"],
];
for (const [wrong, table, expected] of MISTAKES) {
  if (unknownKeysIn({ [wrong]: 1 }, table).length !== 1) {
    fail(`"${wrong}" should be rejected, not silently accepted`);
  } else if (table.aliases?.[wrong] !== expected && !(table.aliases?.[wrong] ?? "").startsWith("(")) {
    fail(`"${wrong}" is rejected but not pointed at "${expected}"`);
  } else ok();
}

// A real field must never be caught by the checker.
for (const field of ENRICH_ITEM_KEYS.known) {
  if (unknownKeysIn({ [field]: 1 }, ENRICH_ITEM_KEYS).length !== 0) fail(`real field "${field}" rejected by its own endpoint`);
  else ok();
}

console.log(`${checks}/${checks + failed} checks passed`);
process.exitCode = failed > 0 ? 1 : 0;
