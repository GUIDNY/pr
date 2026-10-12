/**
 * Did one sync run take a product off the site and create a blank record on
 * its row?
 *
 * The 12 October 04:30 run did it fourteen times, and the 11 October 19:39
 * run had already done it forty-five. Both marked enriched, photographed,
 * published products as gone from the price list and created an empty one
 * on the same tab and the same row index. Both reported SUCCESS with a
 * tidy "N added, N missing" — two numbers that read like an ordinary
 * morning — and nothing in the back office said otherwise. The first was
 * found five hours later because the owner asked an unrelated question;
 * the second had been sitting there for a day and nobody knew.
 *
 * The causes are being fixed one at a time. This is not about the cause.
 * It is the check that names the *damage*, so the next thing that does it
 * by a route nobody has thought of is caught in one run rather than by
 * somebody noticing a number looks odd.
 *
 * **It is keyed on one sync run's own change log, and the first version was
 * not.** That one paired a lost product with a new one by tab, row index
 * and `sourceRowKey` — a content hash of the row, which looked like proof
 * of identity. It is not: the hash collides. Run against the live
 * catalogue it produced 55 pairs, and among them a ₪2,400 cooktop paired
 * with a ₪10,500 one. A check that cries wolf is worse than no check,
 * because it is the one that gets muted.
 *
 * The run itself is the honest key. `PRODUCT_MISSING_FROM_SOURCE` and
 * `NEW_PRODUCT` are written by the same pass over the same sheet, so two
 * of them on one row of one tab in one run is that run saying, in its own
 * log, that it swapped one record for another. Nothing is inferred.
 */
export type ReplacedProduct = {
  sheetName: string;
  rowRef: number;
  /** The record that left the site. */
  lostSku: string;
  lostTitle: string;
  /** The empty one that took its row. */
  blankSku: string;
  /** What the loss is worth, at the price the shop was charging. */
  value: number;
  /** Still off the site now, as opposed to already put back. */
  stillGone: boolean;
};

/** One side of a pair, as the run's log and the product table together
    describe it. */
export type RunCasualty = {
  id: string;
  syncRunId: string;
  sheetName: string | null;
  rowRef: number | null;
  sku: string;
  title: string;
  price: number;
  stockQty: number;
  stillGone: boolean;
};

export type RunArrival = {
  id: string;
  syncRunId: string;
  sheetName: string | null;
  rowRef: number | null;
  sku: string;
};

/**
 * The pairing, pure so it can be tested without a database.
 *
 * Kept separate from the query on purpose: two findMany calls are easy to
 * read, and the part that can be subtly wrong — what counts as a match — is
 * the part that has to be exercised against the real incidents and against
 * the cases that must NOT pair. See scripts/check-sync-watchdog.ts.
 */
export function pairReplacements(lost: RunCasualty[], created: RunArrival[]): ReplacedProduct[] {
  /* All three, and the run id is the one doing the work. Tab and row alone
     pair a product that left in September with an unrelated record created
     in October; "in the same pass over the same sheet" is what makes it one
     event rather than two. A null in any part cannot assert anything. */
  const keyOf = (p: { syncRunId: string; sheetName: string | null; rowRef: number | null }) =>
    p.sheetName === null || p.rowRef === null
      ? null
      : `${p.syncRunId}\u0000${p.sheetName}\u0000${p.rowRef}`;

  const byRow = new Map<string, RunArrival>();
  for (const p of created) {
    const k = keyOf(p);
    if (k !== null) byRow.set(k, p);
  }

  const out: ReplacedProduct[] = [];
  for (const p of lost) {
    const k = keyOf(p);
    if (k === null) continue;
    const blank = byRow.get(k);
    if (!blank || blank.id === p.id) continue;
    out.push({
      sheetName: p.sheetName ?? "",
      rowRef: p.rowRef ?? 0,
      lostSku: p.sku,
      lostTitle: p.title,
      blankSku: blank.sku,
      value: p.price * p.stockQty,
      stillGone: p.stillGone,
    });
  }
  return out.sort((a, b) => b.value - a.value);
}
