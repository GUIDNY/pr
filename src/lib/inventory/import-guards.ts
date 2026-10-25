// Two things the import lets through that are not what they claim to be:
// an EU energy label saved as the product photo, and a line of marketing
// copy saved as the product name. Both come from the same place — the
// scraper and the supplier sheet take whatever is in the cell — and both
// are cheap to recognise and expensive to leave in the catalog: one puts a
// coloured A–G chart on a category page where a fridge should be, the
// other puts "חיישנים+קונדנסור+אפשרות ניקוז" in the <h1>.
//
// Both are conservative on purpose. A guard that also rejects real photos
// and real names costs more than the thing it prevents, so each one only
// fires on evidence, and the ambiguous case is always "let it through".

// ---------------------------------------------------------------------------
// Energy labels
// ---------------------------------------------------------------------------

// The shape rule: an EU energy label is a tall, narrow strip — the standard
// artwork is roughly 1:2 and the files that turn up here are small. A real
// product photo, even of a tall fridge, does not usually reach 1.9 with a
// width under 500px.
//
// This needs the image's actual pixel size, which the import does not have:
// it is handed a URL, and fetching every image at import time would make a
// sync as slow and as unreliable as the least reliable host in the sheet.
// So the shape test lives in the audit script, which fetches and measures
// (scripts/check-energy-labels.ts), and the import uses the filename test
// below, which is free.
export const ENERGY_LABEL_MIN_RATIO = 1.9;
export const ENERGY_LABEL_MAX_WIDTH = 500;

export function hasEnergyLabelShape(width: number, height: number): boolean {
  if (!width || !height) return false;
  return height / width >= ENERGY_LABEL_MIN_RATIO && width < ENERGY_LABEL_MAX_WIDTH;
}

// The filename test. Scrapers keep the source filename far more often than
// not, and an energy label is almost always named for what it is — in
// English on manufacturer sites, in Hebrew on Israeli ones. EPREL is the
// EU's energy-label registry, so a URL pointing into it is a label by
// definition.
//
// Anchored on word boundaries rather than a bare substring: "energy" alone
// would reject a perfectly good photo of an appliance whose model name
// contains it (Energy Star badges, "EnergySave" model lines), and the
// Hebrew "אנרגיה" appears in plenty of legitimate marketing filenames.
// A hyphen or underscore next to the word is what separates a filename
// token from a word inside a longer name.
const ENERGY_LABEL_FILENAME =
  /(^|[/_\-.])(energy[_-]?label|energylabel|energy[_-]?class|eprel|label[_-]?energy|תווית[_-]?אנרגיה|דירוג[_-]?אנרגטי)([_\-.]|$)/i;

// eprel.ec.europa.eu serves nothing but energy labels, so on that host the
// path does not have to say so.
const ENERGY_LABEL_HOST = /(^|\.)eprel\.ec\.europa\.eu$/i;

export function looksLikeEnergyLabelUrl(url: string): boolean {
  const host = url.replace(/^https?:\/\//i, "").split("/")[0].split(":")[0].toLowerCase();
  if (ENERGY_LABEL_HOST.test(host)) return true;
  // Otherwise only the path and query are read — a host that happens to
  // contain "label" (labelstore.example) is not a claim about this
  // particular image.
  const withoutHost = url.replace(/^https?:\/\/[^/]+/i, "");
  let path = withoutHost;
  try {
    path = decodeURIComponent(withoutHost);
  } catch {
    // A malformed %-escape is not a reason to reject the image; read the
    // raw path instead.
  }
  return ENERGY_LABEL_FILENAME.test(path);
}

// ---------------------------------------------------------------------------
// Titles that are copy, not names
// ---------------------------------------------------------------------------

// The sheet's description column is the product title when it has one, and
// sometimes it holds a spec list instead: two live products came in named
// "חיישנים+קונדנסור+אפשרות ניקוז", which is three features joined by plus
// signs and names no product at all.
//
// A real title carries an identifier — a model code, a capacity, a size —
// so the test is: does this string contain anything that could identify a
// product? A Latin run of two or more characters (a brand or a model code)
// or a number both count. A string with neither, built out of feature
// words joined by separators, is copy.
const IDENTIFIER = /[A-Za-z]{2,}|\d/;
const FEATURE_JOINERS = /[+&/]|,\s|\s-\s|\s\+\s/g;

export function looksLikeMarketingTitle(title: string): boolean {
  const t = title.replace(/\s+/g, " ").trim();
  if (!t) return false;
  // Anything with a model code or a number in it names something. This is
  // the check that keeps the guard off almost every real title in the
  // catalog, including the ugly ones.
  if (IDENTIFIER.test(t)) return false;
  // Two or more feature separators in an all-Hebrew string with no
  // identifier anywhere: "חיישנים+קונדנסור+אפשרות ניקוז".
  const joins = (t.match(FEATURE_JOINERS) ?? []).length;
  return joins >= 2;
}

// ---------------------------------------------------------------------------
// A contact line typed into the SKU column
// ---------------------------------------------------------------------------

// The price list puts the importer's rep and their service number on a row of
// its own, in the SKU column, with nothing else on the row:
//
//   "אל גי-חזי ברימאג--0506660374    שירות--1700700909   *8404"
//   "סמסונג מ.כביסה--אריה ניופרו--0503018588    שירות--*6963"
//   "אריה טכנאי להתקנות מסכים--0522822240 --התקנה סטנדרטית למסך אחד-150/250שח"
//
// 168 such rows across the three workbooks, plus five `סה"כ` block totals and
// the odd `חדש`. Nothing kept them out: `hasProductSignal` and `namesSomething`
// in excel-parser.ts both accept any non-empty SKU cell, so each one was a
// product waiting to be created — and until 19 October they were held back
// only by accident, because a row with no stock number was skipped outright.
// Opening the catalog to stock-less rows removes that accident, so the shape
// has to be tested on purpose.
//
// What a supplier SKU looks like here, measured over 2,323 rows that carry
// one: no Hebrew letter, no whitespace, at least one digit, and three to
// twelve characters. 2,139 pass. The 184 that do not are the contact lines,
// the totals, and eleven real products whose SKU cell holds a placeholder
// (`3`, `1`, `0`, `;;`, `חדש`) — those eleven name a model and carry a price,
// so they survive on that and lose only the claim that their SKU is a SKU.
//
// `O180235` and `0120813` are why the test is a shape and not "digits only":
// both are genuine SKUs in this catalogue, one with a leading letter and one
// with a leading zero.
const SKU_SHAPE = /^(?=.*\d)[^\s֐-׿]{3,12}$/;

export function looksLikeSupplierSku(value: string | null | undefined): boolean {
  return SKU_SHAPE.test((value ?? "").trim());
}

// ---------------------------------------------------------------------------
// A stock status typed into the model column
// ---------------------------------------------------------------------------

// Four air-conditioner products in the catalog are called "SOMO אזל זמנית".
// That is not a product name and never was: the sheet's דגם column held the
// supplier's note about availability instead of a model number, and with no
// description on the row the title fell back to brand + model.
//
// So a MODEL cell whose whole content is an availability phrase is not a
// model. It is dropped, the row falls through to whatever the description
// can give, and MISSING_MODEL puts it in the "טיפול" queue — which is
// exactly where a line the supplier could not name belongs.
//
// Whole-cell only. A real model code that happens to contain one of these
// words ("EZEL", a model named חסר) keeps it: the phrase has to be the
// entire value, with nothing else in the cell, for it to be a status rather
// than a name.
const STOCK_PHRASE =
  /^(אזל|אזל מהמלאי|אזל זמנית|זמנית אזל|חסר|חסר במלאי|לא במלאי|אין במלאי|לא זמין|בהזמנה|בהזמנה מראש|הופסק|הופסק ייצור|out of stock|sold out|discontinued|n\/?a)$/i;

export function looksLikeStockPhrase(value: string): boolean {
  return STOCK_PHRASE.test(value.replace(/\s+/g, " ").trim().replace(/[.!:;]+$/, ""));
}

// ---------------------------------------------------------------------------
// A price typed into a quantity cell
// ---------------------------------------------------------------------------

// Eight rows of the white-goods sheet carry a price where a count belongs.
// "בונדד ספק" is a real quantity column — 131 of its 144 values in this
// catalog are between 1 and 20 — but on those eight rows it holds 9900,
// 7900, 6900, 5000, sitting next to a manager code of 12900 and a cost of
// 13900. The same rows say "אזל-למכור מלאי ותצוגות" in their notes and
// carry the real count, 1 or 2, in a different column.
//
// So the classifier is right and the sheet is wrong, which is exactly the
// case an import has to survive: a supplier's typo became 9,901 units of a
// ₪12,900 fridge, published, and a customer could order one.
//
// The test is the line's value rather than the count alone, because a count
// alone cannot be judged — 500 is absurd for a built-in oven and ordinary
// for a cable. A single SKU worth more than a million shekels is not a
// stock level, it is a number in the wrong box. Both conditions must hold,
// so a warehouse genuinely holding 20,000 cheap cables is not caught.
//
// Calibrated against the live catalog: 13 rows match, every one of them a
// misplaced price, and nothing else out of 1,996 products.
export const IMPLAUSIBLE_LINE_VALUE = 1_000_000;
export const IMPLAUSIBLE_MIN_QUANTITY = 100;

export function looksLikeMisplacedQuantity(quantity: number, price: number | null): boolean {
  if (!Number.isFinite(quantity) || quantity < IMPLAUSIBLE_MIN_QUANTITY) return false;
  if (!price || !Number.isFinite(price) || price <= 0) return false;
  return quantity * price >= IMPLAUSIBLE_LINE_VALUE;
}

// The line-value test above judges one number. It cannot see the case where a
// whole row's columns are shifted, and that case is in this catalog: the tab
// "גריל גז ומערכות מים" has the colour under "מחיר מינ'", the price under
// "מוצג", a second price under "תצוגות LUXERY" — read as showroom stock — and
// a margin ratio under "מלאי LUXRY", read as warehouse stock.
//
// A count of 990 at ₪708 is worth ₪700,920, under the million, so the row
// passes the test above and went live claiming 990 water bars. What gives it
// away is the neighbour: 0.2570621468926553 in a column that holds units.
//
// So this is the second tell, and it needs no threshold at all — a fraction is
// never a quantity. Seven rows in the catalog have one, all seven from these
// two tabs, and six of them carry a price where the count belongs.
export function looksLikeOffsetStockRow(lines: { quantity: number }[]): boolean {
  return lines.some((line) => Number.isFinite(line.quantity) && !Number.isInteger(line.quantity));
}

/**
 * Whether a sheet row's model and a product's model can be the same thing.
 *
 * Position — sourceId + sheet + row number — is the first way a row is
 * matched to the product it made last time, and it is the way that fails
 * silently. A row inserted or removed above shifts everything under it by
 * one, and then every product in that block is matched to its neighbour's
 * row. Nothing about that looks wrong: the row parses, the product updates,
 * the sync reports success. What actually happened is that 26 live products
 * took their stock quantity and their whole warehouse breakdown from a
 * different appliance.
 *
 * The sheet carries the answer in its own model column. So a position match
 * is only trusted when the two models can be read as the same model.
 *
 * "Can be read as" and not "are equal", because they are written differently
 * on purpose and both spellings are right. The sheet abbreviates — "7310IX"
 * for a product we call "CUISINE-7310IX", "9630SL" for "SJ-9630SL" — and
 * enrichment fills in the manufacturer's full designation. Punctuation and
 * case vary freely. Containment after stripping both covers all of that and
 * still separates STK60GHX from STK70GHX, EP7A6SB95Y from EP7A6QI40Y, and
 * CH74BVT from MGH90GB, which are the pairs that were actually swapped.
 *
 * Either side missing means the sheet is not saying anything about identity,
 * and silence is not a contradiction: the match stands.
 */
export function modelsCanBeTheSame(
  productModel: string | null | undefined,
  rowModel: string | null | undefined,
): boolean {
  const a = bareModel(productModel);
  const b = bareModel(rowModel);
  if (!a || !b) return true;
  return a.includes(b) || b.includes(a);
}

/**
 * Are these definitely the same model?
 *
 * The opposite question to modelsCanBeTheSame, and not its negation. That
 * one answers "could these differ" and treats an empty field as "possibly
 * the same", because its job is to refuse a match only on evidence. This
 * one has to assert sameness, so silence is a no: both sides must say
 * something, and one must contain the other.
 *
 * It exists because the supplier renumbers rows. A row that stays in place
 * and still names WQG2429IL is the same dryer whether the sheet calls it
 * 0660 today and 130016 tomorrow — and on 11 October 34 products were
 * duplicated by exactly that, ₪253,940 of stock counted twice, because a
 * changed SKU at an unchanged position was read as a different product.
 *
 * The containment test is what makes it safe to act on: "SJ9630BS" against
 * "SJ9630BS" passes, and so does a sheet that writes "SJ-9630 BS", but
 * "CH74BVT" against "MGH90GB" — the Candy cooktop reading a gas cooktop's
 * row — does not. A minimum length keeps a bare "750" or "85" out, since a
 * two-digit model contains half the catalogue.
 */
export const MIN_ASSERTABLE_MODEL_LENGTH = 4;

export function modelsAreTheSame(
  productModel: string | null | undefined,
  rowModel: string | null | undefined,
): boolean {
  const a = bareModel(productModel);
  const b = bareModel(rowModel);
  if (a.length < MIN_ASSERTABLE_MODEL_LENGTH || b.length < MIN_ASSERTABLE_MODEL_LENGTH) return false;
  return a.includes(b) || b.includes(a);
}

function bareModel(value: string | null | undefined): string {
  return (value ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/**
 * Are these the same model, allowing a letter O typed where a zero belongs?
 *
 * Deliberately a third comparison rather than a loosening of the two above,
 * because it answers a different question in a place where the cost of
 * saying no is different.
 *
 * modelsCanBeTheSame guards a position match, and there refusing is free:
 * the row falls through to another comparison that can still find the
 * product. The note beside its test says so, and says an O typed for a zero
 * should stay a mismatch rather than be folded away. That stands.
 *
 * This one is for the last comparison in findExistingProductWithPath, where
 * refusing is not free. Nothing comes after it, so a no means the product
 * has no row in the price list at all: it stops being stock-updated, it is
 * reported as gone, and it leaves the site. On 11 October that happened to
 * Bosch CMA583MB0, whose row is right there in the sheet spelled
 * CMA583MBO — the model ends in a letter O where the oven ends in a zero.
 *
 * Only O and 0, and only those. They are the same glyph in most of the
 * fonts these sheets are typed in, no manufacturer ships two models that
 * differ by exactly that, and four products in this catalogue are spelled
 * each way across the two sides. Nothing else is folded: WF13314GBC and
 * WF13314WBC are one letter apart and are two different washing machines,
 * which is why this is a character substitution and not an edit distance.
 *
 * The uniqueness test at the call site does the rest of the work. This only
 * has to decide whether a candidate is plausible; the caller still refuses
 * unless exactly one product in the tab answers to it.
 */
export function modelsAreTheSameAllowingTypedZero(
  productModel: string | null | undefined,
  rowModel: string | null | undefined,
): boolean {
  if (modelsAreTheSame(productModel, rowModel)) return true;
  const a = foldTypedZero(bareModel(productModel));
  const b = foldTypedZero(bareModel(rowModel));
  if (a.length < MIN_ASSERTABLE_MODEL_LENGTH || b.length < MIN_ASSERTABLE_MODEL_LENGTH) return false;
  return a.includes(b) || b.includes(a);
}

function foldTypedZero(value: string): string {
  return value.replace(/O/g, "0");
}

// ---------------------------------------------------------------------------
// Subtotal lines read as products
// ---------------------------------------------------------------------------

/**
 * A row that is a subtotal, not a product.
 *
 * The sheets carry running totals in among the product rows — a brand's
 * name in the description cell, the sum of its quantities in a stock
 * column, and nothing else. Two of them are in the catalogue right now:
 * "פרימייר" with 56 units at ₪0 and "דלונגי" with 54. Both were created by
 * the sync on 11 October, both were correctly refused publication for
 * having no price, and both still took a product record, a slug and a line
 * in every back-office list.
 *
 * Three conditions together, because each one alone is a real product
 * somewhere in this catalogue: plenty of rows have no model column, plenty
 * are priced at zero while somebody decides, and a cable can honestly have
 * sixty in stock. What no real row has is all three at once — no model, no
 * price of any kind, and a quantity larger than any single appliance line
 * carries.
 *
 * Conservative like the rest of this file: the ambiguous case is let
 * through, because a product refused at import is invisible and a subtotal
 * let through is merely untidy.
 */
export const SUBTOTAL_MIN_QUANTITY = 25;

export function looksLikeSubtotalRow(input: {
  model: string | null;
  price: number | null;
  internalCost: number | null;
  quantity: number;
}): boolean {
  if (input.model && input.model.trim() !== "") return false;
  if (input.price !== null && input.price > 0) return false;
  /* A cost of its own makes it a real line the supplier priced, whatever
     else is missing. */
  if (input.internalCost !== null && input.internalCost > 0) return false;
  return input.quantity >= SUBTOTAL_MIN_QUANTITY;
}

/**
 * Does this row still name this product?
 *
 * The question the model guards were asking was "does the product's model
 * match the row's", and on 12 October that answer took fourteen enriched,
 * photographed, published products off the site in one run and replaced
 * each with a blank record on the same sheet row. The sheet had not
 * changed its mind about any of them. `Product.model` had: it is an
 * enrichment-owned field, and enrichment writes the manufacturer's real
 * code over the supplier's shorthand. A Bosch oven whose row says
 * CMA583MBO is stored as CMA583MB0 — the supplier typed a letter O for a
 * zero — a Sauter hob reading SIH 8080 is stored as SHI8080, a Bauknecht
 * row saying 8780IN is stored as CTAC8780AFSNE. Every one of those is a
 * correction somebody made on purpose, and comparing the row against it
 * makes a successful enrichment look like a different product.
 *
 * So the comparison that decides identity is row against *row*:
 * `lastRowModel` is the model this product's row carried on the previous
 * run, written by the sync and by nothing else. All fourteen rows arrived
 * carrying exactly the string the product's lastRowModel already held.
 *
 * It does not weaken the guard it replaces, which exists because rows
 * shift and a stale key can be stamped on a neighbour: a shifted block
 * puts a *different* row at this position, and a different row's model
 * does not match this product's lastRowModel either. What it stops doing
 * is punishing a product for having been corrected.
 *
 * The product's own model still vouches for the row — first, because for
 * the 1,300 products enrichment has not renamed it is the same answer and
 * a cheaper one — and lastRowModel is the second opinion, asked only when
 * the first says no.
 */
export function rowStillNamesThisProduct(
  product: { model: string | null; lastRowModel?: string | null },
  rowModel: string | null | undefined,
): boolean {
  if (modelsCanBeTheSame(product.model, rowModel)) return true;
  /* modelsAreTheSame and not modelsCanBeTheSame: this branch is only
     reached when the product's current model has already said no, so
     silence on either side must not turn into a yes. Both sides have to
     name a real model and agree. */
  return modelsAreTheSame(product.lastRowModel ?? null, rowModel);
}

/**
 * Has the price list moved this SKU onto a different appliance?
 *
 * The hole this closes. `bindingIsAssertable` in sync.ts believed a row
 * with a real SKU outright — `!row.skuIsSynthetic` and nothing more — on
 * the reasoning that the SKU is the supplier's own key and the identity
 * signal the whole import rests on. It usually is. But it is a key the
 * supplier is free to reuse, and when they reuse it the sync adopts the
 * new occupant's price for the old product without a word.
 *
 * On 12 October a customer was offered a Samsung RT53DG7A14WW — a
 * 530-litre top-freezer — at 6,200 ₪. SKU 107012 in מקררים row 550 had
 * become a RF60C7012SL, a 660-litre four-door costing 5,700, and 6,200 is
 * that row's קוד מנכ"ל. The fridge's real record, bound to row 536 whose
 * model does say RT53DG7A14WW, was hidden at 3,600 ₪. Nothing anywhere
 * reported it; the SKU matched, so there was nothing to report.
 *
 * Why the test is "did the row change" and not "does the row disagree":
 * disagreement is the normal case and cannot be acted on. `Product.model`
 * is enrichment's field — it writes the manufacturer's real code over the
 * supplier's shorthand, so `8780IN` becomes `CTAC8780AFSNE` — and a string
 * comparison cannot tell that apart from a row describing a different
 * appliance. What can be told apart is *which side moved*. An enrichment
 * correction moves the product's model and leaves the row alone. A
 * reassignment moves the row. `lastRowModel` is what this row itself
 * carried on the previous run, written by the sync and by nothing else, so
 * it is the one field that answers that question.
 *
 * Both conditions, therefore:
 *   - the row now prints a model that contradicts the product's own, and
 *   - the row was printing something else last run.
 *
 * Silence is never a reassignment: a row with no model, a product with no
 * model, or a first run with no `lastRowModel` to compare against all
 * return false. A letter O typed where a zero belongs is not one either —
 * these sheets are typed in fonts where the two are the same glyph, and
 * CMA583MBO/CMA583MB0 is a real pair in this catalogue.
 *
 * The standing cases this does not catch are the ones where the row has
 * *always* named another appliance, which no comparison between two runs
 * can see. Those need the sheet itself: `npm run check:price-bindings`
 * lists them and the back office shows them with the evidence.
 */
export function rowModelWasReassigned(
  product: { model: string | null; lastRowModel?: string | null },
  rowModel: string | null | undefined,
): boolean {
  const now = foldTypedZero(bareModel(rowModel));
  const ours = foldTypedZero(bareModel(product.model));
  const before = foldTypedZero(bareModel(product.lastRowModel));

  // Every side has to say something a model can be read off.
  if (now.length < MIN_ASSERTABLE_MODEL_LENGTH) return false;
  if (ours.length < MIN_ASSERTABLE_MODEL_LENGTH) return false;
  if (before.length < MIN_ASSERTABLE_MODEL_LENGTH) return false;

  // The row still names us: nothing to see, whoever edited what.
  if (ours.includes(now) || now.includes(ours)) return false;

  // The row says the same thing it said last run. Then the product's model
  // is what moved — enrichment correcting the supplier's shorthand — and
  // that is not the sheet reassigning anything.
  if (before.includes(now) || now.includes(before)) return false;

  return true;
}

/**
 * Does the row this product is bound to look like a different appliance's?
 *
 * The standing half of the problem rowModelWasReassigned guards. That one
 * compares the row against itself across two runs and so only ever sees the
 * moment a SKU moves; a SKU that was already pointing at the wrong appliance
 * before anybody was watching is invisible to it, because the row has not
 * changed since. Twenty live products were in exactly that state on
 * 12 October, 72,676 ₪ of listed price, and the only reason they were found
 * is that the owner opened one of the pages and recognised the price.
 *
 * It cannot be decided from the database — settling it needs the row itself
 * — so this does not block anything. It raises a flag for a person, from the
 * watchdog's own cron rather than from inside a sync, for the reason every
 * other check there is: a run that is adopting a wrong price is not a
 * reliable narrator of it.
 *
 * Which means precision matters more than reach here, since the cost of this
 * is somebody's afternoon. The filters, in the order they earned their place
 * when the whole catalogue was swept by hand (61 hits down to 20):
 *
 *   - **A shared three-character run clears it.** Every correction
 *     enrichment makes keeps the manufacturer's own stem: 8780IN inside
 *     CTAC8780AFSNE, 8080 in SIH 8080 against SHI8080, 2861B in both
 *     spellings of the Miele. A row describing a different appliance shares
 *     nothing — RT53DG7A14WW against RF60C7012SL has no three characters in
 *     common anywhere. This one filter is what separates the two populations.
 *   - **A model column with no digit is a brand name**, not a model: CASO,
 *     Ninja, GRAEF, Charleston, SUPERSONIC. 24 of the 61.
 *   - **"1200W" is a wattage.** Three more.
 *   - **A row model echoing the product's own SKU is the supplier's
 *     shorthand** — SKU 106356 against a row that says 6356, SKU 157131
 *     against BKS7131LX. 13 of the 61, and all of them correctly bound.
 */
/**
 * May this alert be closed?
 *
 * One click on 13 October put a mis-named product back on sale for twelve
 * days. SKU 270064 is a row that reads `AL45` with "עד 55 אינץ'" in its
 * description; enrichment read the 55 and wrote a model of `AL-55`, which
 * is a real and different Audio Line stand. The watchdog caught it exactly
 * as designed — a CRITICAL ROW_NAMES_ANOTHER_MODEL on 12 October at 14:57,
 * naming the sheet, the row and both codes, with the product quarantined
 * off the site — and then it was resolved in the batch of 36 that was
 * cleared the next evening, of which 34 genuinely were false alarms. This
 * one was not, and resolving it released the quarantine, put the page back
 * up under the wrong name, and, because that sweep asks once per product
 * and never again, guaranteed nothing would ever ask a second time.
 *
 * So the gap was never detection. It was that closing the question did not
 * require an answer to it. This is that requirement: an alert whose
 * evidence is still readable from the database cannot be marked resolved
 * while it still reads. Correct the model, or the row has to change; a
 * product whose name disagrees with the row it is priced from is not one
 * the shop can sell either way, which is what the quarantine already says.
 *
 * Only the types whose evidence IS checkable are listed. Everything else
 * resolves as before — most alerts here are a person's judgement about
 * something no column records, and demanding evidence for those would be
 * demanding it of nobody.
 */
export function alertEvidenceStillStands(
  type: string,
  product: { sku: string; model: string | null; lastRowModel?: string | null } | null,
): boolean {
  if (!product) return false;
  if (type === "ROW_NAMES_ANOTHER_MODEL") return rowBindingLooksForeign(product);
  return false;
}

export function rowBindingLooksForeign(product: {
  sku: string;
  model: string | null;
  lastRowModel?: string | null;
}): boolean {
  const ours = foldTypedZero(bareModel(product.model));
  const row = foldTypedZero(bareModel(product.lastRowModel));
  const rowRaw = bareModel(product.lastRowModel);

  if (ours.length < MIN_ASSERTABLE_MODEL_LENGTH) return false;
  if (row.length < MIN_ASSERTABLE_MODEL_LENGTH) return false;
  if (ours.includes(row) || row.includes(ours)) return false;

  // A brand name in the model column, or a wattage. Read off the unfolded
  // string: folding O to zero would make "CASO" look like it has a digit.
  if (!/[0-9]/.test(rowRaw)) return false;
  if (/^[0-9]+W$/.test(rowRaw)) return false;

  /* The supplier's own shorthand for the SKU we already agree on — but only
     when the SKU is most of what the row says.
     The first version of this cleared any row model containing the SKU's
     last four characters, and the first thing the fixtures did with it was
     clear SKU 107012 against RF60C7012SL, the 6,200 ₪ fridge this whole
     guard exists for: the Samsung's code happens to contain 7012. A filter
     that lets the founding case through is not a filter, and the reason it
     did is that it had quietly gone back to "the SKU matches, so the row is
     ours" — the assumption that failed in the first place.
     So the tail has to be at least half of the row's model. The thirteen
     shorthand rows in the catalogue run from 4 characters to 9 and the tail
     is 44%–100% of each; a manufacturer's real code that merely contains
     those four digits is 36% and under. BKS7131LX against SKU 157131 is the
     one shorthand row this does not clear, at 44%, and one afternoon spent
     on a correctly bound range hood is the right side to err on. */
  const skuTail = bareModel(product.sku).slice(-4);
  if (skuTail.length === 4 && rowRaw.includes(skuTail) && rowRaw.length <= 8) return false;

  return !shareAnyRunOfThree(ours, row);
}

function shareAnyRunOfThree(a: string, b: string): boolean {
  for (let i = 0; i + 3 <= a.length; i++) {
    if (b.includes(a.slice(i, i + 3))) return true;
  }
  return false;
}

/**
 * Does the product's own title name a different model than its model field?
 *
 * The third shape, after a row that moved (rowModelWasReassigned) and a row
 * that never named this product (rowBindingLooksForeign). Here the row is
 * fine and the two halves of our own record disagree: `Product.model` says
 * one code and the Hebrew title, which is what the customer reads, prints
 * another.
 *
 * Found by looking at three products the owner asked about on 13 October and
 * noticing they shared a shape. SKU 0902 was the worst of them — the title
 * read "Samsung Crystal UHD 65U8000H" on a record whose model, row, brand,
 * specs and photograph were all an LG OLED evo 77" costing 9,900. A customer
 * searching for the Samsung found that page at 10,500 ₪ while the real
 * Samsung sat elsewhere at 2,400, and the LG could not be found by its name
 * at all. Nothing was wrong with its price.
 *
 * It reports a disagreement; it does not say which side is wrong. Often the
 * title is right and the model field is stale — three Blomberg ovens here
 * have a title and a price-list row that both say HGN9335Z against a model
 * field reading HGN9333Z. Settling that needs the manufacturer, so this
 * hands over the pair and stops.
 *
 * The filters, each one measured against the live catalogue rather than
 * imagined — 119 raw hits down to 16, and the 16 are all genuine:
 *
 *   - **Tokens never span a space.** The first draft matched across them and
 *     turned "Miele M 7244 TC CleanSteel 46" into one 24-character "code"
 *     that matched nothing. That single mistake was most of the 119.
 *   - **Fold O to zero after testing for a digit, not before.** Folding
 *     first turns `NoFrost` into `N0FR0ST` and `Dolby Atmos` into
 *     `D0LBYATM0S` — two products were flagged for model codes this
 *     function had invented itself.
 *   - **The same characters in a different order is a rewrite.** Tornado's
 *     air conditioners are stored as "SMART 30 INV לבן" and titled
 *     "SMART-INV-30"; sorted, the two are identical.
 *   - **A trailing unit is a measurement.** "543BTU" is the tail of
 *     "20,543BTU" split on the comma.
 *   - **Three or more foreign codes is a compatibility list**, not a
 *     mistake: a DAVO mixing bowl's title names the three mixers it fits.
 */
export function titleNamesAnotherModel(product: {
  title: string;
  model: string | null;
}): string | null {
  const ours = bareModel(product.model);
  if (ours.length < 5) return null;

  const foreign: string[] = [];
  // Whitespace-free runs only. A model code does not contain a space; a
  // sentence does, and matching across one invents codes that never existed.
  for (const raw of product.title.match(/[A-Za-z0-9][A-Za-z0-9./-]*/g) ?? []) {
    const token = bareModel(raw);
    if (token.length < 6) continue;
    if (!/[0-9]/.test(token) || !/[A-Z]/.test(token)) continue;
    if (/^[0-9]+(BTU|W|HZ|L|KG|CM|MM|V|MAH)$/.test(token)) continue;
    const a = foldTypedZero(token);
    const b = foldTypedZero(ours);
    if (a.includes(b) || b.includes(a)) return null; // the title does name us
    if (sortedChars(a) === sortedChars(b)) return null; // same code, rewritten
    if (!foreign.includes(raw)) foreign.push(raw);
  }

  if (foreign.length === 0 || foreign.length >= 3) return null;
  return foreign[0];
}

function sortedChars(value: string): string {
  return value.split("").sort().join("");
}
