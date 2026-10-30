/**
 * The same machine on the site twice, at two prices.
 *
 * SMS4ECW28E, 30 October: a Bosch dishwasher listed at **3,990** and at
 * **2,790** at the same moment, both published, both saying "במלאי". A
 * customer choosing the obvious one would have been sold a machine that
 * costs the shop 3,680 for 2,790, and nothing anywhere would have said a
 * word — the order would have looked ordinary all the way to the van.
 *
 * HOW THE SECOND RECORD HAPPENS, because the fix for that lives elsewhere
 * and this is only the net underneath it: the Bosch's row in `מדיחים`
 * carries no SKU, so it is matched by position. The supplier re-sorted the
 * tab; row 72 stopped being the SMS4ECW28E and became an SMV 2HTX06E,
 * while our product 140201 kept pointing at row 72 and quietly took that
 * machine's price. The real Bosch row, now row 64, matched nothing, so on
 * 20 October the sync did the only thing left to it and created a second
 * product. Neither half is visible from inside one sync run: the binding
 * drifted before anyone was watching, and a new row is a perfectly normal
 * thing for a price list to grow.
 *
 * So this sweeps from outside, like rowBindingLooksForeign, and asks a
 * question neither run can: **are two published products wearing the same
 * model code right now?**
 *
 * THE LINE BETWEEN THE TWO SEVERITIES IS MONEY, NOT TIDINESS.
 *
 * A duplicate at the same price is untidy. A duplicate at two prices is a
 * decision the customer makes for us, and they will make it the cheap way.
 * The question that decides the severity is therefore not "do these
 * differ" but "would the cheap one lose money if it were taken": the
 * cheaper listing's price against the **other** record's cost, because the
 * other record is the one whose cost is real if that is the unit that
 * ships. Eight pairs were in that state when this was written, the worst
 * of them a Sharp SJ-3850WH at 4,790 against a twin costing 8,590 — 3,800
 * ₪ a unit.
 *
 * A DIFFERENT COLOUR DOES NOT CLEAR IT, and that was measured rather than
 * assumed. Finishes normally carry their own model number (M-LR8 against
 * M-LB8), so sharing one is already odd — and of the eight losing pairs,
 * two are genuine finish variants: a Sauter MWB5634 in steel at 1,190
 * against the black at 1,990 cost, and a LaCasa LC20MGB in black at 300
 * against the white at 400. The loss is just as real when the supplier
 * gave two finishes one code and two different costs. Colour is reported
 * so a person can see it; it is not a filter.
 *
 * A model code under five characters is not a model code. "AW650" and
 * "NF417" are real and five long; below that they are brand names and
 * capacities, and grouping on them would put a shop's worth of unrelated
 * products in one pile.
 */

/** Below this, a "model" is a brand name or a size. */
export const MIN_MODEL_KEY_LENGTH = 5;

export type Listing = {
  id: string;
  sku: string;
  title: string;
  model: string | null;
  price: number;
  supplierCost: number | null;
  stockQty: number;
  colorName: string | null;
  isPublished: boolean;
};

export type DuplicateGroup = {
  /** The normalised model code the group shares. */
  key: string;
  severity: "CRITICAL" | "WARNING";
  /** Cheapest first. */
  listings: Listing[];
  /**
   * What the shop loses on one unit if a customer takes the cheapest
   * listing and a twin is what actually ships. Null when no listing sits
   * below another's cost — then this is untidiness, not exposure.
   */
  lossPerUnit: number | null;
  /** Whether a customer can buy the cheap one right now. */
  buyableNow: boolean;
};

/**
 * The model, with the punctuation the suppliers sprinkle through it taken
 * out: `SMS 4ECW28E`, `SMS-4ECW28E` and `sms4ecw28e` are one code.
 *
 * Null when there is nothing usable left — which is the same answer as
 * "do not group this product with anything".
 */
export function modelKey(model: string | null | undefined): string | null {
  if (!model) return null;
  const key = model.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return key.length >= MIN_MODEL_KEY_LENGTH ? key : null;
}

/**
 * Every model code worn by more than one published product, where the
 * prices disagree.
 *
 * Equal prices are left out on purpose. They are a tidiness problem and
 * raising them would bury the eight that can cost money under the
 * thirty-nine that cannot — the same reasoning that took
 * rowBindingLooksForeign from 61 raw hits to 20.
 */
export function findDuplicateListings(products: Listing[]): DuplicateGroup[] {
  const groups = new Map<string, Listing[]>();
  for (const product of products) {
    if (!product.isPublished) continue;
    const key = modelKey(product.model);
    if (!key) continue;
    const bucket = groups.get(key);
    if (bucket) bucket.push(product);
    else groups.set(key, [product]);
  }

  const found: DuplicateGroup[] = [];
  for (const [key, listings] of groups) {
    if (listings.length < 2) continue;
    const prices = listings.map((l) => l.price);
    if (Math.max(...prices) === Math.min(...prices)) continue;

    listings.sort((a, b) => a.price - b.price);

    /* The worst pairing in the group: the biggest gap between what one
       listing asks and what another one costs. Taken over every pair
       rather than just cheapest-against-dearest, because the dearest
       record is not always the one with the highest cost. */
    let lossPerUnit: number | null = null;
    let buyableNow = false;
    for (const cheap of listings) {
      for (const twin of listings) {
        if (cheap.id === twin.id || twin.supplierCost === null) continue;
        const loss = twin.supplierCost - cheap.price;
        if (loss <= 0) continue;
        if (lossPerUnit === null || loss > lossPerUnit) lossPerUnit = loss;
        if (cheap.stockQty > 0) buyableNow = true;
      }
    }

    found.push({
      key,
      severity: lossPerUnit === null ? "WARNING" : "CRITICAL",
      listings,
      lossPerUnit,
      buyableNow,
    });
  }

  /* Worst money first, then the merely untidy. */
  return found.sort((a, b) => (b.lossPerUnit ?? -1) - (a.lossPerUnit ?? -1));
}

/** One line a person can act on, in Hebrew. */
export function duplicateMessage(group: DuplicateGroup): string {
  const money = (n: number) => n.toLocaleString("he-IL");
  const where = group.listings
    .map((l) => `${l.sku} ב-${money(l.price)} ₪${l.stockQty > 0 ? ` (${l.stockQty} במלאי)` : ""}`)
    .join(" מול ");
  const head = `${group.listings[0].title} — אותו דגם (${group.key}) מופיע באתר ${group.listings.length} פעמים: ${where}.`;
  if (group.lossPerUnit === null) {
    return `${head} המחירים שונים — צריך להחליט איזו רשומה נכונה ולהסתיר את השאר.`;
  }
  return (
    `${head} הזולה מוצגת מתחת לעלות של התאום — הפסד של ${money(group.lossPerUnit)} ₪ ליחידה אם לקוח יקנה אותה` +
    `${group.buyableNow ? ", והיא ניתנת לקנייה עכשיו" : ""}. צריך להחליט איזו רשומה נכונה ולהסתיר את השאר.`
  );
}
