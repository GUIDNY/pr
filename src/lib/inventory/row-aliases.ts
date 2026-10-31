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

/**
 * The floor for a row's free text, measured rather than picked.
 *
 * 116 rows in the three workbooks carry neither a SKU nor a model long
 * enough to be one, and those are the rows the position guard cannot
 * protect: with nothing to compare, a moved row matches whatever now sits
 * at its index. Their descriptions, though, are distinctive — "אלקטרה
 * רילקס אינורטר 340", "מגירת חימום אקטיבית", "ISKA עילי שחור".
 *
 * At 10 characters after `aliasValue` strips the punctuation, 99 of the
 * 116 qualify and 97 of those are unique in their own tab. What falls
 * below the line is exactly what should: "ASKO", "גורנייה", "היטאצי" —
 * bare brand names, the same thing MIN_ALIAS_MODEL_LENGTH keeps out. 8
 * admits three more rows and two more collisions; 16 costs fifteen rows
 * and prevents nothing.
 */
export const MIN_ALIAS_TITLE_LENGTH = 10;

export type AliasKind = "MODEL" | "ROWKEY" | "TITLE";
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
 *
 * TITLE is the last resort and is written **only for a row with no usable
 * model**, which is the point of it: a description is weaker evidence than
 * a model code, so it must never be in a position to outrank one. The 271
 * products matched by position whose row prints no model are the ones with
 * no guard at all behind that match, and this is the only identifier those
 * rows have.
 *
 * It gets no ambiguity check of its own, unlike MODEL, and that is a real
 * difference rather than an oversight: the model check reads `lastRowModel`,
 * the model *the row* carried last run, and there is no column holding the
 * row's previous title to ask the same question of. The unique index is
 * what protects it instead — a title a second product reaches for is simply
 * not written, and that product falls through to the ordinary guesses. Two
 * of the 99 qualifying rows are in that state.
 */
export function aliasEntriesFor(
  row: { model: string | null; rowKey: string | null; title?: string | null },
  options: { modelIsAmbiguous: boolean },
): AliasEntry[] {
  const entries: AliasEntry[] = [];
  const model = aliasValue(row.model);
  const modelIsUsable = model.length >= MIN_ALIAS_MODEL_LENGTH;
  if (modelIsUsable && !options.modelIsAmbiguous) {
    entries.push({ kind: "MODEL", value: model });
  }
  if (row.rowKey) entries.push({ kind: "ROWKEY", value: row.rowKey });
  if (!modelIsUsable) {
    const title = aliasValue(row.title);
    if (title.length >= MIN_ALIAS_TITLE_LENGTH) entries.push({ kind: "TITLE", value: title });
  }
  return entries;
}
