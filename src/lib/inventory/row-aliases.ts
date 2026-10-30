/**
 * Every name a row has been seen under, so a product survives the supplier
 * renaming, re-sorting or renumbering it.
 *
 * A SKU-less row has three guesses behind it — its position, a hash of its
 * text, and the model it printed last run — and all three describe the
 * sheet as it looked last time, so all three go stale together. The alias
 * table is the fourth signal and the only one that accumulates.
 *
 * WHAT THIS FILE IS FOR is the decision of what to remember, pulled out of
 * the database call so it can be tested: given a row and an answer to "does
 * anything else in this tab answer to that model", which names go on file.
 *
 * THE RULE THAT CHANGED, and why. Aliases used to be written only for
 * SKU-less rows, on the reasoning that "a row with a SKU has a real
 * identity and does not need a remembered one". The assumption buried in
 * that is that a row which has a SKU today will have one tomorrow.
 *
 * It will not. The Bosch SMS4ECW28E arrived in August on a row carrying
 * SKU 140201, so nothing about it was written down. By October the
 * supplier had re-sorted מדיחים **and** dropped the SKU from that row. The
 * Bosch was now a SKU-less row at position 64; its old position 72 had
 * become an SMV 2HTX06E; and the three things that could have recognised
 * it were a blank SKU, a different machine, and nothing on file. So the
 * sync created a second product — and the shop sold a 3,680 ₪ dishwasher
 * for 2,790 while the order page reported a 440 ₪ profit.
 *
 * A product that has a SKU today therefore keeps its name on file against
 * the day the sheet stops carrying one. A row costs nothing; not having it
 * costs a duplicate nobody sees until a customer picks the cheap half.
 */

/** The floor every model comparison in this codebase uses: a bare "750"
    names half the catalogue. */
export const MIN_ALIAS_MODEL_LENGTH = 4;

export type AliasKind = "MODEL" | "ROWKEY";
export type AliasEntry = { kind: AliasKind; value: string };

/** Punctuation out, case levelled; Hebrew kept, because a row's text is
    where some of these names live. */
export function aliasValue(value: string | null | undefined): string {
  return (value ?? "").replace(/[^A-Za-z0-9֐-׿]/g, "").toUpperCase();
}

/**
 * The names to remember for this row.
 *
 * `modelIsAmbiguous` is the caller's answer to "does any other live
 * product in this tab already answer to this model". An ambiguous name is
 * not written at all, and that is not timidity: the unique index would
 * stop the second product taking it, so the first would keep it and answer
 * for the second's row for ever. Ten model strings in this catalogue are
 * shared by two products each — a Bosch PUE611BB5Y held by two records, a
 * Gorenje GW951MB that is two real colours.
 *
 * The row hash is unaffected by that: it is the whole row, and a whole row
 * does not repeat.
 */
export function aliasEntriesFor(
  row: { model: string | null; rowKey: string | null },
  options: { modelIsAmbiguous: boolean },
): AliasEntry[] {
  const entries: AliasEntry[] = [];
  const model = aliasValue(row.model);
  if (model.length >= MIN_ALIAS_MODEL_LENGTH && !options.modelIsAmbiguous) {
    entries.push({ kind: "MODEL", value: model });
  }
  if (row.rowKey) entries.push({ kind: "ROWKEY", value: row.rowKey });
  return entries;
}
