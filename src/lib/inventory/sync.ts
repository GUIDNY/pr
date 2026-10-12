import { createHash } from "crypto";
import { db } from "@/lib/db";
import type { NormalizedProductRow } from "./types";
import {
  diffAgainstExisting,
  detectSourceConflicts,
  isMajorStockChange,
  totalStock,
  displayStockLines,
  deriveStockStatus,
  resolvedPrice,
  hasAnyStockData,
} from "./diff-engine";
import {
  INVENTORY_ALERT_TYPE_LABELS,
  type InventoryAlertType,
} from "@/lib/enums";
import type { SourceKey } from "./sheet-map";
import { brandLikeDividers } from "./brand-extractor";
import { isBlockedImageHost } from "./blocked-image-hosts";
import { sourceRowKeyFor } from "./source-row-key";
import { resolveBrandId, findBrandId } from "./brand-resolver";
import {
  modelsAreTheSame,
  modelsAreTheSameAllowingTypedZero,
  looksLikeSubtotalRow,
  looksLikeEnergyLabelUrl,
  looksLikeMarketingTitle,
  looksLikeMisplacedQuantity,
  looksLikeOffsetStockRow,
  rowStillNamesThisProduct,
  IMPLAUSIBLE_LINE_VALUE,
} from "./import-guards";
import type { SyncTrigger } from "@/lib/enums";
import { asciiSlug, usableSlugBase } from "@/lib/slug-base";
import { recordSlugChange } from "@/lib/product-slug-history";
import { submitUrls, productPaths } from "@/lib/indexnow";
import { PUBLIC_PRODUCT_WHERE } from "@/lib/queries/products";

// Sequential, persistent, gap-free: 0001, 0002, ... — never reused, never
// renumbered on a later sync. A single-row counter table keeps allocation
// atomic without scanning existing SKUs for a max.
async function allocateTempSku(): Promise<string> {
  const counter = await db.tempSkuCounter.upsert({
    where: { id: "singleton" },
    update: { value: { increment: 1 } },
    create: { id: "singleton", value: 1 },
  });
  return String(counter.value).padStart(4, "0");
}

/**
 * The temp-SKU products a source already has, indexed by sheet, so a row
 * whose key no longer matches can still find the product it made.
 *
 * Needed because of what guarding the key match leaves behind. A key is
 * derived from the sheet, so refusing one that names another model is right
 * — but it also removes the only identity 143 products had, and the
 * comparison left under it (same brand AND model AND title, exactly) is the
 * one the key was introduced to replace: enrichment rewrites all three. A
 * product that cannot be re-found is reported as gone from the price list
 * and leaves the site, so without this the guard above would take 42 live
 * products down and create a second copy of each from the row it refused.
 *
 * Matching on the model and only the model, by the strong test: both sides
 * name at least four characters and one contains the other. That is the
 * same assertion the renumbered-row case makes, and it bridges the way the
 * two sides are written on purpose — "7310IX" in the sheet for a product we
 * call "CUISINE-7310IX".
 *
 * Unique or nothing. Two products in a tab whose models both read as this
 * row's model means the model is not identifying anything here, and
 * guessing between them is how a wrong binding gets written in the first
 * place — the whole fault this is cleaning up after.
 *
 * Scoped to one sheet, because sourceRowKey is, and for the same reason:
 * the same model listed under two tabs is two products in this catalogue.
 *
 * Two queries' worth of data and no more: the index holds id, sku and
 * model, and the matched product is read in full only once it is the
 * answer. Loading whole Product rows for ~700 temp-SKU products on every
 * run is the shape of mistake that cost four days of Storage downtime in
 * September.
 */
export type TempSkuModelIndex = {
  find(
    sheetName: string,
    rowModel: string | null,
    claimedSkus: Set<string>,
  ): Promise<Awaited<ReturnType<typeof db.product.findUnique>> | null>;
};

export function createTempSkuModelIndex(sourceId: string): TempSkuModelIndex {
  const bySheet = new Map<string, { id: string; sku: string; model: string | null }[]>();
  return {
    async find(sheetName, rowModel, claimedSkus) {
      if (!bySheet.has(sheetName)) {
        bySheet.set(
          sheetName,
          await db.product.findMany({
            where: { sourceId, isTemporarySku: true, sourceSheet: sheetName },
            select: { id: true, sku: true, model: true },
          }),
        );
      }
      const matches = (bySheet.get(sheetName) ?? []).filter(
        (p) =>
          // Not one an earlier row in this same run already took. The index
          // is a snapshot, so without this two rows naming the same model
          // would both bind to it and the second would overwrite the first.
          !claimedSkus.has(p.sku) &&
          modelsAreTheSameAllowingTypedZero(p.model, rowModel),
      );
      if (matches.length !== 1) return null;
      return db.product.findUnique({ where: { id: matches[0].id } });
    },
  };
}

// Finds the product this row belongs to across syncs, in priority order:
//  1. Same physical position in the source (sourceId+sheet+row) — the
//     primary identity signal, including the temp-SKU -> real-SKU upgrade
//     case (a product that had no SKU last sync now has one this sync).
//     Not trusted if that position now holds a *different* real SKU than
//     this row's real SKU — that means rows shifted upstream, not that our
//     temp SKU should silently attach to an unrelated product.
//  2. For rows with no real SKU and no position match: a content-based
//     fallback (same brand+model+title, still temp-SKU'd, same source) —
//     guards against minor row-order drift in the sheet.
//  3. For rows with a real SKU: a plain SKU lookup.
/**
 * Which comparison bound the row to the product. Written to the product as
 * provenance — see Product.lastMatchPath in the schema for why it exists.
 */
export type MatchPath =
  | "position"
  | "sku"
  /** Matched on a name this row has used before — see rememberRowAliases. */
  | "rowAlias"
  | "rowKey"
  | "model"
  | "legacy"
  | "renamedSheet"
  | "created";


/**
 * Remember every name a row has used for this product, and find a product
 * by any name its row has ever used.
 *
 * The fourth guess, and the only one that accumulates. Position, the row
 * hash and lastRowModel are each overwritten on every run, so they all
 * describe the sheet as it looked last time and they all go stale together
 * — which is exactly what happened on 11 and 12 October, when the supplier
 * re-sorted a tab, rewrote the row text and enrichment had since corrected
 * our model: three independent guesses, one shared failure, 59 products
 * swapped for blank records.
 *
 * An alias is never overwritten. `8780IN` becoming `CTAC8780AFSNE` adds a
 * name; the row is still recognised next month by the name it used last
 * month. Same mechanism as ProductSlugHistory keeping an old URL alive,
 * for the same reason: identifiers get renamed, and the rename is the
 * moment you lose the thread.
 *
 * Only for SKU-less rows. A row with a SKU has a real identity and does
 * not need a remembered one.
 */
const aliasValue = (v: string | null | undefined) =>
  (v ?? "").replace(/[^A-Za-z0-9\u0590-\u05FF]/g, "").toUpperCase();

export async function rememberRowAliases(
  productId: string,
  sourceId: string,
  row: NormalizedProductRow,
): Promise<void> {
  if (!row.skuIsSynthetic) return;
  const entries: { kind: string; value: string }[] = [];
  const model = aliasValue(row.model);
  /* Four characters, the floor every model comparison in this file uses: a
     bare "750" names half the catalogue. */
  if (model.length >= 4) entries.push({ kind: "MODEL", value: model });
  const key = sourceRowKeyFor(row);
  if (key) entries.push({ kind: "ROWKEY", value: key });
  if (entries.length === 0) return;

  for (const e of entries) {
    /* createMany rather than upsert, and skipDuplicates doing the work:
       the unique index is on (source, sheet, kind, value) and not on the
       product, so a second product reaching for a name the first already
       holds is simply not written. An identity two products claim is not
       an identity — the holder keeps it and the newcomer falls through to
       the ordinary guesses rather than stealing its row. */
    await db.productRowAlias.createMany({
      data: [{ productId, sourceId, sheetName: row.sheetName, kind: e.kind, value: e.value }],
      skipDuplicates: true,
    });
  }
  await db.productRowAlias.updateMany({
    where: {
      productId,
      sourceId,
      sheetName: row.sheetName,
      OR: entries.map((e) => ({ kind: e.kind, value: e.value })),
    },
    data: { lastSeenAt: new Date() },
  });
}

/** The product this row has been bound to before, under any name it has
    carried. Null when nothing has, or when the row names nothing. */
export async function findByRowAlias(
  sourceId: string,
  row: NormalizedProductRow,
): Promise<{ id: string } | null> {
  if (!row.skuIsSynthetic) return null;
  const candidates: { kind: string; value: string }[] = [];
  const key = sourceRowKeyFor(row);
  /* The hash first: it is computed from the whole row and is the narrower
     claim. The model is a single column and a supplier can legitimately
     repeat it. */
  if (key) candidates.push({ kind: "ROWKEY", value: key });
  const model = aliasValue(row.model);
  if (model.length >= 4) candidates.push({ kind: "MODEL", value: model });

  for (const c of candidates) {
    const hit = await db.productRowAlias.findUnique({
      where: {
        sourceId_sheetName_kind_value: {
          sourceId,
          sheetName: row.sheetName,
          kind: c.kind,
          value: c.value,
        },
      },
      select: { productId: true, product: { select: { missingFromSourceSince: true } } },
    });
    /* A product the price list has dropped does not come back on an alias
       alone — that is the sheet having stopped carrying it, and reviving it
       here would undo a decision the sync already made deliberately. */
    if (hit && hit.product.missingFromSourceSince === null) return { id: hit.productId };
  }
  return null;
}

/**
 * findExistingProduct, and which door the match came through.
 *
 * The wrapper below keeps the plain product-returning shape the two scripts
 * in scripts/ call, so this one can be honest about the path without
 * changing their signature.
 */
export async function findExistingProductWithPath(
  sourceId: string,
  row: NormalizedProductRow,
  brandId: string | null,
  /**
   * Every tab name this workbook has in the run being applied.
   *
   * Only used to answer one question: has the tab this product came from
   * disappeared? Omitted (in a dry run, or a test calling this directly)
   * the rename fallback below is skipped rather than guessed at — a match
   * that assumes a tab is gone when it is merely unknown would merge two
   * live tabs, which is the failure this whole function exists to avoid.
   */
  sheetsInRun?: Set<string>,
  /**
   * The source's temp-SKU products by sheet, and the SKUs already claimed
   * this run. Omitted (a dry run, or a test calling this directly) the
   * model fallback is skipped rather than approximated.
   */
  modelIndex?: { index: TempSkuModelIndex; claimedSkus: Set<string> },
) {
  /* Every product that claims this row, not the first one the database
     happens to return.
     findFirst with no ordering was the whole defect. 143 positions in this
     catalogue are claimed by two or three products — 290 records — and the
     winner was whichever row Postgres handed back. The loser then got no
     row at all: 155 of them, 154 already reported as gone from the price
     list. And it is worse than arbitrary, because the model guard below
     then *refuses* a wrong claimant instead of trying the right one, so a
     row would fall through to the fallbacks while the product it actually
     names sat at that very position, unlooked-at.
     Three products claim מקררים row 3 — a Homex HRF80W, a Midea HS-121L and
     a Sirius MREF-109-W. One office fridge per row is what the sheet means;
     which one is a question the row itself answers, in its model column. */
  const claimants = await db.product.findMany({
    where: { sourceId, sourceSheet: row.sheetName, sourceRowRef: row.rowIndex },
    orderBy: { createdAt: "asc" },
  });

  /* A record already reported as gone from the price list is not competing
     for this row, and that single condition is most of the problem.
     Of 142 contested positions, 134 have exactly one claimant still in the
     price list — the others left it weeks ago and are only still pointing
     at the row as bookkeeping. One is genuinely ambiguous. So treating all
     claimants as contenders turned one real question into 142, and the
     answer to 134 of them was already in the database.
     Falling back to the full set when nothing is left matters: 7 positions
     have no claimant in the price list at all, and a row that names one of
     them is how that product comes back. */
  const contenders = claimants.filter((p) => p.missingFromSourceSince === null);
  const pool = contenders.length > 0 ? contenders : claimants;

  /* Within that pool, the claimant the row names. Containment after
     stripping, the same assertion used everywhere else here, and unique or
     nothing: two that both read as this row's model means the model is not
     deciding anything, and guessing is what produced this mess. */
  const namedByTheRow = pool.filter(
    (p) => modelsAreTheSame(p.model, row.model) || modelsAreTheSame(p.lastRowModel, row.model),
  );
  const positionMatch =
    namedByTheRow.length === 1 ? namedByTheRow[0] : pool.length === 1 ? pool[0] : null;

  // A contested row is reported once per run by reconcileRowClaimedTwice,
  // not here: upsertAlert resolves every open alert of a type for a source
  // before writing the new one, so 143 contested rows raised from inside
  // this loop would leave exactly one alert standing.

  if (positionMatch) {
    /* A row that kept its place and changed its number.
       The supplier renumbers rows — a short internal code becomes a longer
       catalogue one, 0660 becomes 130016 — and until 11 October that read
       as a different product: the position matched, the SKU did not, the
       match was refused, and a second record was created for the same
       machine. 34 products were duplicated that way, ₪253,940 of stock
       counted twice, and the orphaned halves were then reported as "gone
       from the price list" when the price list still carried every one of
       them.
       modelsAreTheSame is what makes this safe to act on, and it is a
       deliberately stronger test than the modelsCanBeTheSame below: both
       sides must name a model of at least four characters and one must
       contain the other. Silence is a no. A row whose model agrees and
       whose position is unchanged is the same product under a new number;
       anything less certain still falls through to the SKU lookup. */
    const renumberedInPlace =
      !row.skuIsSynthetic &&
      !positionMatch.isTemporarySku &&
      positionMatch.sku !== row.sku &&
      modelsAreTheSame(positionMatch.model, row.model);

    const positionMatchIsStaleIdentity =
      !row.skuIsSynthetic &&
      !positionMatch.isTemporarySku &&
      positionMatch.sku !== row.sku &&
      !renumberedInPlace;
    // And the row's own model column has to agree that this is the same
    // product — see rowStillNamesThisProduct. A shifted block of rows matches
    // every product in it to its neighbour, and the only thing that notices is
    // the model the sheet prints beside the stock we are about to copy.
    const positionMatchContradictsTheRow = !rowStillNamesThisProduct(positionMatch, row.model);
    if (!positionMatchIsStaleIdentity && !positionMatchContradictsTheRow) {
      return { product: positionMatch, path: "position" as MatchPath };
    }
  }

  if (!row.skuIsSynthetic) {
    const bySku = await db.product.findUnique({ where: { sku: row.sku } });
    if (bySku) return { product: bySku, path: "sku" as MatchPath };
    // No product carries this SKU, and the position did not match either.
    // Before creating one: the supplier filling a SKU into a row that never
    // had one is not a new product, and if the tab was renamed in the same
    // export then neither the position nor the SKU can say so. The rename
    // fallback can.
    return {
      product: await renamedSheetMatch(sourceId, row, brandId, sheetsInRun),
      path: "renamedSheet" as MatchPath,
    };
  }

  /* A row with no SKU whose position has moved — and the first thing to
     ask is whether we have met this row before under any name it has used.
     See rememberRowAliases: the three guesses below each describe the
     sheet as it looked on the last run and go stale together, which is how
     59 products were swapped for blank records over two days. An alias is
     never overwritten, so a row the supplier re-sorted and renamed is
     still recognised by a name it carried a month ago. */
  const aliased = await findByRowAlias(sourceId, row);
  if (aliased) {
    const product = await db.product.findUnique({ where: { id: aliased.id } });
    if (product) return { product, path: "rowAlias" as MatchPath };
  }

  // Failing that, what the sheet says about the row right now, which is what
  // sourceRowKey stores — see source-row-key.ts for why the product's own
  // brand/model/title cannot be used here any more: those are precisely the
  // fields we edit.
  const rowKey = sourceRowKeyFor(row);
  if (rowKey) {
    const keyMatch = await db.product.findFirst({
      where: { sourceId, isTemporarySku: true, sourceRowKey: rowKey },
    });
    /* Behind the same model test as the position match above, and it was
       missing here until 11 October.
       The key is derived from the sheet, so a key that matches is normally
       proof of identity. It is not proof when the key was written wrong in
       the first place: backfill-row-keys.ts stamps keys by position alone —
       its own comment says "a wrong match here would stamp a wrong identity
       permanently" — so a backfill that ran while rows were already shifted
       wrote the neighbour row's key onto the product. 16 live products carry
       such a key. A Samsung 65U8000H holds the key of an LG OLED 77 C66LA
       row, and matched it again on every run since.
       That is worse than the drift it was built to fix. Position drift
       self-corrects when the sheet settles; a wrong key matches the wrong
       row for ever, and this was the one door into the matcher with no model
       test behind it. A key match whose row contradicts the product's own
       model is a wrong key, not an identity, so it is refused and the row
       falls through to the comparisons below — which can still find the
       product honestly, or decide the sheet no longer carries it. */
    /* And the identity is confirmed against what the row itself said last
       run, not only against the product's current model — see
       rowStillNamesThisProduct. This is the door the 12 October loss came
       through: the key matched exactly, on the same sheet, the same row
       index and the same content hash, and was refused anyway because
       enrichment had corrected the product's model since. */
    if (keyMatch && rowStillNamesThisProduct(keyMatch, row.model)) {
      return { product: keyMatch, path: "rowKey" as MatchPath };
    }
  }

  // No key match, or one that named another model. The model is what the
  // sheet and the product still agree on — see createTempSkuModelIndex for
  // why this sits ahead of the exact comparison below rather than relying
  // on it.
  if (modelIndex) {
    const byModel = await modelIndex.index.find(
      row.sheetName,
      row.model,
      modelIndex.claimedSkus,
    );
    if (byModel) return { product: byModel, path: "model" as MatchPath };
  }

  // Products created before the key existed have none stored yet, so the
  // old comparison stays as the last resort. It is wrong whenever the
  // product has been edited, which is the whole reason for the key — but it
  // is still better than no match at all, and every product it does find
  // gets a key written on this same run, so each sync shrinks this path.
  // No Brand row for this name yet means no product carries it, so this
  // search has nothing it could match — and asking would only be an excuse
  // to create the brand up front, which is what filled the table with junk.
  if (!brandId) return { product: null, path: null };

  const legacyMatch = await db.product.findFirst({
    where: {
      sourceId,
      isTemporarySku: true,
      sourceRowKey: null,
      brandId,
      model: row.model,
      title: row.title,
    },
  });
  if (legacyMatch) return { product: legacyMatch, path: "legacy" as MatchPath };

  return {
    product: await renamedSheetMatch(sourceId, row, brandId, sheetsInRun),
    path: "renamedSheet" as MatchPath,
  };
}

/** The same match, for callers that only want the product. */
export async function findExistingProduct(
  ...args: Parameters<typeof findExistingProductWithPath>
) {
  return (await findExistingProductWithPath(...args)).product;
}

/**
 * The product this row made last time, when the tab it was under has been
 * renamed.
 *
 * A rename is invisible to every other match in this file, and it takes the
 * whole tab with it. Position is sourceSheet + sourceRowRef, so it fails.
 * The row key deliberately includes the sheet name — that is what keeps the
 * same model listed under two tabs as two products — so it fails too, and
 * fails for every SKU-less row in the tab at once. The result is a second
 * copy of everything that tab holds, which is what happened on 19 August
 * when "מוצרי תלייה וכבלים" came back as " מתקניי תליה וכבלים": 57 pairs
 * of products with identical titles and two different hash slugs.
 *
 * What makes this safe is the last condition rather than the first three.
 * A product only qualifies if the tab it came from is absent from this
 * workbook — so a model genuinely listed under two live tabs can never be
 * collapsed into one, because both of those tabs are present. The candidate
 * must also still be on a temporary SKU: a product with a real SKU of its
 * own is found by SKU or not at all, and must not be claimed by a lookalike
 * row somewhere else.
 *
 * Brand, model and title together, exactly — the same triple the legacy
 * fallback above uses. It is a weak identity for an edited product, which
 * is precisely why it runs last and only for a tab that has vanished.
 */
async function renamedSheetMatch(
  sourceId: string,
  row: NormalizedProductRow,
  brandId: string | null,
  sheetsInRun?: Set<string>,
) {
  if (!sheetsInRun || !brandId || !row.model || !row.title) return null;
  const candidates = await db.product.findMany({
    where: {
      sourceId,
      isTemporarySku: true,
      brandId,
      model: row.model,
      title: row.title,
      sourceSheet: { not: row.sheetName },
    },
    select: { id: true, sourceSheet: true },
  });
  const orphaned = candidates.filter(
    (c) => c.sourceSheet !== null && !sheetsInRun.has(c.sourceSheet),
  );
  // Two orphans matching one row is not a rename anybody can resolve from
  // here — it needs a person to say which is which. Creating nothing is
  // wrong too, but it is the reversible half: the row comes in as a new
  // product and the duplicate is visible, rather than stock being merged
  // into whichever row happened to sort first.
  if (orphaned.length !== 1) return null;
  return db.product.findUnique({ where: { id: orphaned[0].id } });
}

export function getLowStockThreshold(): number {
  const raw = process.env.LOW_STOCK_THRESHOLD;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : 3;
}

// The product's public address, and the one field nothing rewrites after
// creation — so it is worth spending the row's whole vocabulary on rather
// than settling early.
//
/** The disambiguating tail, and the whole of the fallback address. */
function skuHash(sku: string) {
  return createHash("sha1").update(sku).digest("hex").slice(0, 8);
}

/**
 * The address a row gets when it becomes a product, in the format the catalog
 * actually uses: brand-category-model.
 *
 * This is the derivation, and it is here rather than in a migration script for
 * the reason CLAUDE.md gives about brand attribution: 1,913 products were
 * moved onto this format by hand, twice, while this function went on minting
 * `{model}-{hash}` for every new row. Correcting the rows and not the
 * derivation is how the same ticket gets filed again — the next sheet would
 * have started refilling the catalog with the old shape the morning after.
 *
 * The old shape is still the fallback, and deliberately so. A brand whose own
 * slug is still an importer hash (`6a09e0b9b0-6a09e0`) or the literal word
 * "brand" is waiting on a person to name it, and those 18 brands were left out
 * of both renames for that reason. Baking one of their hashes into a public
 * URL would be worse than the old format, because a slug is never rewritten
 * afterwards — it is in links people have already shared.
 */
async function slugFor(
  row: NormalizedProductRow,
  sku: string,
  brandId: string | null,
): Promise<string> {
  const legacy = () =>
    `${
      usableSlugBase(row.model) ??
      usableSlugBase(row.brandName) ??
      usableSlugBase(row.categorySlug) ??
      "product"
    }-${skuHash(sku)}`;

  if (!brandId || !row.categorySlug) return legacy();
  const brand = await db.brand.findUnique({ where: { id: brandId }, select: { slug: true } });
  const brandSlug = brand?.slug;
  if (!brandSlug || HASHED_BRAND_SLUG.test(brandSlug) || brandSlug.startsWith("brand-mt")) {
    return legacy();
  }

  // Same order the rename used: model, then colour, then the hash. Two rows
  // sharing a brand, a category and a model usually are the same product
  // arriving twice, and the hash is what keeps their two pages apart.
  // A model number is free text and arrives as "R-327FH(S)", "WM TWF100-125"
  // or "-X1-". asciiSlug handles the first two; the trim is what keeps the
  // third from becoming a permanent URL with a doubled or dangling dash.
  const model = tidy(asciiSlug(row.model ?? ""));
  const base = [brandSlug, row.categorySlug, model].filter(Boolean).join("-");
  const colour = tidy(asciiSlug(row.color ?? ""));
  for (const candidate of [base, colour ? `${base}-${colour}` : null, `${base}-${skuHash(sku)}`]) {
    if (candidate && !(await slugTaken(candidate))) return candidate;
  }
  return legacy();
}

/** A brand still on an importer-generated address, waiting to be named. */
const HASHED_BRAND_SLUG = /^[0-9a-f]{10}-[0-9a-f]{6}$/;

/** No doubled and no dangling dashes. */
function tidy(value: string) {
  return value.replace(/-+/g, "-").replace(/^-|-$/g, "");
}

/**
 * History counts as taken.
 *
 * A slug in ProductSlugHistory is one the proxy redirects away from, so a new
 * product handed that address would 308 to a different product the moment it
 * was published — and nothing would report it.
 */
async function slugTaken(slug: string): Promise<boolean> {
  const [product, history] = await Promise.all([
    db.product.findUnique({ where: { slug }, select: { id: true } }),
    db.productSlugHistory.findUnique({ where: { slug }, select: { id: true } }),
  ]);
  return product !== null || history !== null;
}

// Kept as a re-export so scripts/backfill-brand-attribution.ts and the
// enrich endpoints all resolve a brand exactly the way a sync does — a
// second implementation that drifted is what filed four PolkAudio soundbars
// nowhere at all. See brand-resolver.ts.
export { resolveBrandId };

async function resolveCategoryId(slug: string | null): Promise<string | null> {
  if (!slug) return null;
  const cat = await db.category.findUnique({ where: { slug } });
  return cat?.id ?? null;
}

type AlertInput = {
  type: string;
  severity: string;
  productId?: string | null;
  sourceId?: string | null;
  syncRunId?: string | null;
  sourceSku?: string | null;
  message: string;
};

// A persisting issue (still no confirmed price, still out of stock, etc.)
// would otherwise get a brand new alert row every single sync run forever
// — resolve whatever unresolved alert of the same type already exists for
// this product/source before creating the current one, so the alert list
// reflects the current state, not sync history.
async function upsertAlert(input: AlertInput) {
  const where = input.productId
    ? { type: input.type, productId: input.productId, isResolved: false }
    : {
        type: input.type,
        sourceId: input.sourceId ?? undefined,
        productId: null,
        isResolved: false,
      };
  await db.inventoryAlert.updateMany({
    where,
    data: { isResolved: true, resolvedAt: new Date() },
  });
  await db.inventoryAlert.create({ data: input });
}

type ApplyResult = {
  productsAdded: number;
  productsUpdated: number;
  priceChanges: number;
  /** Of those, the ones actually written. priceChanges counts differences
      the sheet reports; this counts the subset adoptPrice took. The two are
      not the same number and reporting only the first is how a run that
      applied 144 prices announces 345. */
  pricesAdopted: number;
  stockChanges: number;
  seenSkus: Set<string>;
  /** Products whose page now says something different: created, or
      stock moved. The IndexNow submission at the end of the run is built
      from this and nothing else — see the note beside it. */
  changedProductIds: Set<string>;
};

// Alert types that describe a single row's current state, as opposed to a
// one-off event (MAJOR_STOCK_CHANGE, OUT_OF_STOCK) or something set outside
// this loop (MISSING_FROM_SOURCE). When the same SKU appears as several
// rows in one source (e.g. one row per color variant), each row can trip a
// *different* one of these — upsertAlert only auto-resolves a prior alert
// of the *same* type, so a type tripped by an earlier variant but not by
// the row that ends up as the product's final state would otherwise sit
// open forever, still describing a state the product is no longer in.
const ROW_STATE_ALERT_TYPES = new Set([
  "UNMATCHED_ROW",
  "INVALID_PRICE",
  "PRICE_BELOW_COST",
  "MISSING_MODEL",
  "NEGATIVE_STOCK",
  "DUPLICATE_SKU",
  "DUPLICATE_MODEL",
  "SOURCE_CONFLICT",
]);

// One row's worth of work: find/create/update its Product row, replace its
// stock-line breakdown, and emit whatever alerts its current data implies.
// Isolated into its own function (instead of living inline in the loop) so
// applyRowsForSource can wrap a single row's failure without an uncaught
// exception three levels deep — e.g. a transient unique-constraint clash
// while two rows' SKUs are mid-swap — from aborting every row after it in
// the same source, which used to leave the whole sync stuck and every
// later row silently unprocessed.
async function applyOneRow(
  sourceId: string,
  row: NormalizedProductRow,
  syncRunId: string,
  conflictSkus: Set<string>,
  threshold: number,
  result: ApplyResult,
  sheetsInRun: Set<string>,
  modelIndex: TempSkuModelIndex,
): Promise<{ productId: string; types: Set<string> } | null> {
  const hasConflict = conflictSkus.has(row.sku);

  // Lookup only — see findBrandId. The row may still be dropped below, and
  // a dropped row must not leave a Brand behind.
  const existingBrandId = await findBrandId(row.brandName);

  // Position (sourceId+sheet+row) first, content-identity fallback for
  // temp-SKU'd rows, plain SKU lookup otherwise — see findExistingProduct
  // for why this order matters (handles the temp -> real SKU upgrade case
  // without creating a duplicate).
  const matched = await findExistingProductWithPath(
    sourceId,
    row,
    existingBrandId,
    sheetsInRun,
    { index: modelIndex, claimedSkus: result.seenSkus },
  );
  const existing = matched.product;
  /* Provenance for the row this product is about to be updated from: which
     comparison accepted it, and the model the parser actually read off the
     row — the exact value every guard in findExistingProductWithPath
     compared. See Product.lastMatchPath. */
  const provenance = {
    lastMatchPath: existing ? matched.path : "created",
    lastRowModel: row.model,
  };
  const rawStock = totalStock(row);

  // Zero stock, never seen before: don't pull it into the system at all —
  // not a product record, not a temp SKU, not an alert. It's not "a
  // product that needs review," it's not a product yet. If a real product
  // that used to have stock drops to zero, it's still updated below (kept,
  // not deleted, so it can come back) — this only skips rows with nothing
  // to reactivate in the first place.
  if (rawStock <= 0 && !existing) return null;

  /* A subtotal line, not a product. The sheets carry running totals among
     the rows — a brand name in the description cell, the sum of its
     quantities in a stock column, nothing else — and two of them became
     products on 11 October: "פרימייר" with 56 units at ₪0 and "דלונגי"
     with 54. Both were correctly refused publication for having no price,
     and both still took a record, a slug and a line in every back-office
     list. Only refused for a row that has not already produced a product:
     deleting an existing one is a decision, not an import rule, and an
     existing product that suddenly matches this is far more likely to be a
     row the supplier blanked than a subtotal. See looksLikeSubtotalRow for
     why all three conditions are needed. */
  if (!existing && looksLikeSubtotalRow({
    model: row.model,
    price: resolvedPrice(row).price,
    internalCost: row.internalCost,
    quantity: rawStock,
  })) {
    return null;
  }

  // Safety net for the early-exit (missing category) path below: track
  // whatever SKU this row is already known by, so an existing product at
  // this position/identity isn't wrongly marked missing-from-source just
  // because its category couldn't be resolved this run.
  if (existing) result.seenSkus.add(existing.sku);
  else if (!row.skuIsSynthetic) result.seenSkus.add(row.sku);

  const categoryId = await resolveCategoryId(row.categorySlug);
  if (!categoryId) {
    /* Two different faults used to share this alert, and the louder one
       buried the worse one. A tab that maps to nothing takes out every row
       it has — 2,530 identical warnings a day for "מסכים" alone — and is
       reported once per sheet as SHEET_NOT_MAPPED by the caller, which is
       the only form a person can act on. A row whose tab *did* map to a
       slug that has no category row in the database is a different and much
       rarer problem, and that one still belongs here, named by slug so it
       can actually be looked up. */
    if (row.categorySlug) {
      await upsertAlert({
        type: "UNMATCHED_ROW",
        severity: "WARNING",
        sourceId,
        syncRunId,
        sourceSku: existing?.sku ?? row.sku,
        message: `הגיליון "${row.sheetName}" מופה לקטגוריה "${row.categorySlug}" שאינה קיימת במסד`,
      });
    }
    return null;
  }

  // Past every early return, so this row is definitely becoming a product:
  // now the brand may be created. Reuses whatever findBrandId already found.
  const brandId = existingBrandId ?? (await resolveBrandId(row.brandName));

  const { price: resolved, rejected: rejectedPrices } = resolvedPrice(row);

  // A quantity that is really a price. The supplier typed 9900 into the
  // "בונדד ספק" column of a ₪12,900 fridge whose own notes say it is sold
  // out, and the row went live claiming 9,901 units. The number is refused
  // rather than corrected: what the true count is belongs to whoever reads
  // the sheet, so the product keeps whatever it already had and the alert
  // says exactly what was rejected. See looksLikeMisplacedQuantity.
  const priceForSanity = resolved ?? existing?.price ?? null;
  const rowColumnsAreShifted = looksLikeOffsetStockRow(row.stockLines);
  const quantityIsImplausible =
    looksLikeMisplacedQuantity(rawStock, priceForSanity) || rowColumnsAreShifted;
  const stock = quantityIsImplausible ? (existing?.stockQty ?? 0) : rawStock;

  /* The stock answer stays the stock answer.
     A row with no readable price used to be forced to NEEDS_REVIEW here,
     which erased a perfectly definitive OUT_OF_STOCK — and a sold-out row is
     exactly the kind that comes with the price cell left empty. The product
     page then told the customer "דורש בדיקה" instead of "אזל מהמלאי".
     The overwrite was doing one useful job, keeping a product with no price
     out of the public set, and it was doing it by corrupting a different
     field. PUBLIC_PRODUCT_WHERE now asks about the price directly, which is
     both the honest place for it and the layer that cannot go stale.
     Measured before removing: of 648 products holding NEEDS_REVIEW, exactly
     one would reach the site without this line, and it has a price. */
  const status = deriveStockStatus(row, stock, hasConflict);
  const finalStatus =
    status === "IN_STOCK" && stock <= threshold ? "LOW_STOCK" : status;


  // Real SKU always wins. No real SKU: reuse the existing product's
  // already-assigned temp SKU (same logical product, same number as last
  // sync) or mint the next sequential one for a genuinely new product.
  const isTemporarySku = row.skuIsSynthetic;
  const sku = !row.skuIsSynthetic
    ? row.sku
    : (existing?.sku ?? (await allocateTempSku()));
  result.seenSkus.add(sku);

  const stockLines = displayStockLines(row);

  // Written on create and refreshed on every update, so a product created
  // before this existed picks one up the first time its row is seen again —
  // which is what lets the legacy brand+model+title fallback in
  // findExistingProduct shrink to nothing instead of living forever.
  const sourceRowKey = sourceRowKeyFor(row);

  const data = {
    sku,
    isTemporarySku,
    title: row.title,
    model: row.model,
    brandId,
    categoryId,
    price: resolved ?? existing?.price ?? 0,
    minSalePrice: row.minSalePrice,
    supplierCost: row.internalCost,
    warrantyMonths: existing?.warrantyMonths ?? 12,
    stockStatus: finalStatus,
    stockQty: stock,
    stockBreakdown: JSON.stringify(row.rawSnapshot),
    internalNotes: row.color ? `צבע: ${row.color}` : null,
    // The sheet's צבע column is the authority on finish whenever it has one,
    // and it was already being parsed into row.color — it just never reached
    // the structured field, which is why colorName sat empty across the whole
    // catalog. Spread conditionally rather than writing `row.color` straight:
    // a plain assignment would null the field on every sync for the rows whose
    // sheet has no colour, wiping anything the enrichment API filled in for
    // exactly those products.
    ...(row.color ? { colorName: row.color } : {}),
    sourceId,
    sourceSheet: row.sheetName,
    sourceRowRef: row.rowIndex,
    sourceRowKey,
    ...provenance,
    lastExcelSyncAt: new Date(),
    missingFromSourceSince: null,
    // Store policy: zero stock means fully off the site, not just
    // "published but shows out of stock" — enforced again at query time
    // in src/lib/queries/products.ts (PUBLIC_PRODUCT_WHERE) since that's
    // the layer that actually can't go stale.
    isPublished:
      !hasConflict &&
      finalStatus !== "NEEDS_REVIEW" &&
      resolved !== null &&
      stock > 0,
  };

  // A row the sheet has already produced a product for updates stock and
  // nothing else. Everything else about an existing product — its name,
  // brand, category, price, colour, warranty — belongs to whoever curated
  // it, and the sheet is not a better source for any of it: its title is
  // the raw "{brand} {model}" string, it maps a whole tab to one broad
  // category, and its brand column is the one that filed Bauknecht under
  // AEG. Re-applying all of that on every run is what undid a morning's
  // corrections by the next morning, over and over.
  //
  // isPublished is deliberately not in here either. It used to be
  // recomputed from the sheet on every run, which silently republished
  // anything an admin had hidden by hand; stock is already enforced at
  // query time by PUBLIC_PRODUCT_WHERE, so nothing is lost by leaving the
  // flag to the people who set it.
  //
  // Source position (sourceId/sheet/rowRef) stays current because
  // findExistingProduct matches on it — a product whose row moved would
  // otherwise stop being recognised and come back as a duplicate. And
  // sourceRowKey for the same reason one step further out: position is
  // what fails when the supplier inserts a row, and the key is what
  // recognises the product after it does.
  /* And the new catalogue number, when the supplier has renumbered the row.
     Matching the product again is enough to stop the duplicate today, but
     leaving it on the old number is not stable: the moment the supplier
     re-sorts the sheet the position stops matching, the SKU lookup misses
     because the product still carries 0660 while the row says 130016, and
     the duplicate comes back. So the product adopts the number the sheet
     now uses.
     Guarded against the unique index rather than assumed: the duplicate
     this fix prevents already exists 36 times over, and one of those
     records is holding the new SKU right now. Where that is so the number
     is left alone — the match still works by position and model — and
     merging the pair is a decision for a person, not an import rule. */
  const renumberedSku =
    existing && !row.skuIsSynthetic && existing.sku !== row.sku
      ? ((await db.product.findUnique({ where: { sku: row.sku }, select: { id: true } })) === null
          ? row.sku
          : null)
      : null;

  /* The price, but only where no person has chosen one.
     Until 11 October the sync never wrote price to an existing product, and
     that rule was right: re-applying the sheet on every run used to wipe a
     morning's corrections by the next morning. It was also costing money —
     276 products were showing a price the price list had moved on from, the
     sync spotted every difference, reported "289 price changes" a day and
     applied none of them, and a Siemens fridge sat at ₪10,400 against a
     sheet that said ₪3,500.
     priceManualAt is what lets both things hold. Null means nobody has
     priced this product, so the price list manages it. Set means a person
     decided, and no sync touches it again — the sheet's figure becomes a
     suggestion in the price tab instead of an overwrite.
     resolved, not data.price: data.price falls back to the existing price
     when the sheet has none, and writing a product's own price back to it
     is a no-op that would still move updatedAt and re-submit the page to
     IndexNow.

     And never below the cost on the same row. "A price cannot be under the
     cost" is the owner's rule, and adopting the sheet's figure blindly would
     have broken it on 27 live products on the first run — the sync would have
     created exactly the loss that PRICE_BELOW_COST exists to shout about.
     The two numbers come off one row, so when they contradict each other the
     row is what is wrong, not the price on the page: the product keeps what
     it has, stays in the price tab as a difference waiting for a person, and
     the alert below says why. Raw comparison, no VAT arithmetic, for the
     reason given at PRICE_BELOW_COST: the cost column is sometimes ex-VAT and
     sometimes inc-VAT, so this can only ever withhold fewer prices than it
     should, never invent a reason to withhold one. */
  const rowCost = row.internalCost;
  const resolvedIsBelowCost =
    resolved !== null && rowCost !== null && rowCost > 0 && resolved < rowCost;

  /* And never over a running sale. compareAtPrice set means price is a sale
     price being advertised against it; adopting the sheet's figure there
     would leave the "before" number in place next to a price that is no
     longer the offer, so the card would show a discount nobody agreed to.
     actions/admin-deals.ts marks every sale price manual for the same
     reason — this is the half that holds for the nine sales that were
     already running when the rule changed, and for anything that writes a
     sale price without coming back to set the flag. */
  /* And only where the binding to this row is assertable.
     A row with a real SKU matched this product by that SKU, and that is the
     identity signal the whole import is built on. A row with no SKU matched
     by position or by content instead, and 256 rows of these sheets carry no
     SKU — that is how a ₪590 gas cooktop came to be reading the row of a
     ₪3,100 induction one, and how a 65-inch Crystal UHD at ₪2,400 came to
     be offered ₪10,500 by its row. 60 of 146 live price differences measured
     on 11 October were bindings of that kind.
     While price was never written this was a reporting problem. Now it is a
     live page, so a SKU-less row has to say the same model as the product
     before its price is believed. modelsAreTheSame refuses to answer on a
     model shorter than four characters rather than guessing, so the effect
     of an unreadable model on either side is that the price is withheld and
     the difference stays in the price tab for a person — which is where the
     wrong bindings need to go anyway. */
  /* And it asks the row what the row said last time, not only what the
     catalogue holds now — the correction the owner forced on 12 October,
     stated plainly: what the price list says is what the site shows,
     unless a person changed it.
     The test used to compare the row against `existing.model` alone, and
     that is enrichment's field: it writes the manufacturer's real code
     over the supplier's shorthand, so `8780IN` is stored as
     `CTAC8780AFSNE` and `SIH 8080` as `SHI8080`. Every successful
     enrichment therefore made its own product's row unassertable and
     froze its price for good. That morning's run logged 32 price changes
     and wrote almost none: a Fratelli cooktop stayed at ₪1,500 while the
     sheet said otherwise, a Siemens fridge at ₪10,400.
     `lastRowModel` is what this row itself carried on the previous run —
     written by the sync and by nothing else — so agreeing with it is the
     row confirming its own identity, which is the thing the guard was
     always trying to establish. It does not weaken it: a shifted block
     puts a different row here, and a different row's model agrees with
     neither field. See rowStillNamesThisProduct. */
  const bindingIsAssertable =
    existing !== null &&
    (!row.skuIsSynthetic ||
      modelsAreTheSameAllowingTypedZero(existing.model, row.model) ||
      modelsAreTheSame(existing.lastRowModel, row.model));

  const adoptPrice =
    existing !== null &&
    bindingIsAssertable &&
    existing.priceManualAt === null &&
    existing.compareAtPrice === null &&
    resolved !== null &&
    resolved > 0 &&
    resolved !== existing.price &&
    !resolvedIsBelowCost;

  /* The supplier's cost, kept current.
     This was written once, at creation, and never again — so 231 products
     carried a cost the sheet had moved on from, 77 of them live. It is not a
     field anybody owns: nothing in the app writes it, the price screen
     refuses to let it be edited on purpose, and every consumer wants
     today's number. The margin column on the price screen is computed from
     it, which means a person deciding one of the prices this sync will not
     touch was reading a margin against a cost from weeks ago. Four products
     read as "sold below cost" on 11 October purely because the stored figure
     was old; the sheet's row said otherwise.
     Only when the row carries one. A tab without a cost column must not
     erase a cost we already have — that would be the sheet's silence
     overwriting its own earlier statement.
     And behind the same binding test as the price, which is the condition I
     left out of the first version of this and had to come back for. The
     Samsung 65U8000H is bound to an LG OLED 77 C66LA row; adopting that
     row's cost would move its cost from 2,100 to 9,900 and spread one wrong
     binding into a second field, where it would then drive the margin, the
     below-cost alert and the price guard above. A row we will not take a
     price from is not a row to take a cost from either. */
  const adoptCost =
    existing !== null &&
    bindingIsAssertable &&
    rowCost !== null &&
    rowCost > 0 &&
    rowCost !== existing.supplierCost;

  /* Computed here and not where the row is first read, because it has to
     be told what the guards decided: the quantity that will be stored and
     the price, if any, that will be adopted. See appliedStock and
     appliedPrice in diff-engine.ts — a figure the sync refused must not
     reach the changes page as a change that happened. */
  const changes = diffAgainstExisting(
    row,
    existing
      ? {
          id: existing.id,
          sku: existing.sku,
          isTemporarySku: existing.isTemporarySku,
          sourceId: existing.sourceId,
          price: existing.price,
          stockQty: existing.stockQty,
          title: existing.title,
          model: existing.model,
          missingFromSourceSince: existing.missingFromSourceSince,
        }
      : null,
    /* What we are about to store, not what the row claims — see the notes
       on appliedStock and appliedPrice. A quantity or a price the guards
       refused must not be reported as a change that happened. */
    stock,
    adoptPrice ? resolved : null,
  );

  const stockOnlyUpdate = {
    ...provenance,
    ...(renumberedSku ? { sku: renumberedSku, isTemporarySku: false } : {}),
    ...(adoptPrice ? { price: resolved } : {}),
    ...(adoptCost ? { supplierCost: rowCost } : {}),
    stockStatus: data.stockStatus,
    stockQty: data.stockQty,
    stockBreakdown: data.stockBreakdown,
    sourceId: data.sourceId,
    sourceSheet: data.sourceSheet,
    sourceRowRef: data.sourceRowRef,
    sourceRowKey: data.sourceRowKey,
    lastExcelSyncAt: data.lastExcelSyncAt,
    missingFromSourceSince: data.missingFromSourceSince,
  };

  let productId: string;
  if (existing) {
    await db.product.update({ where: { id: existing.id }, data: stockOnlyUpdate });
    productId = existing.id;
    if (adoptPrice) result.pricesAdopted++;
    result.productsUpdated++;
    /* The row is written on every run (lastExcelSyncAt has to move), so
       updatedAt cannot say whether anything a visitor sees has changed.
       This can: the three stock fields are the only ones the sync is
       allowed to touch, and if none of them moved the page is the same
       page. */
    if (
      adoptPrice ||
      existing.stockQty !== data.stockQty ||
      existing.stockStatus !== data.stockStatus ||
      JSON.stringify(existing.stockBreakdown ?? null) !== JSON.stringify(data.stockBreakdown ?? null)
    ) {
      /* adoptPrice belongs in here and not only in the update: the price is
         on the page, in the Merchant feed and in the JSON-LD, so a product
         whose price moved is a page Google should be told about even if its
         stock did not budge. */
      result.changedProductIds.add(existing.id);
    }
    if (existing.missingFromSourceSince) {
      await db.inventoryAlert.updateMany({
        where: { type: "MISSING_FROM_SOURCE", productId, isResolved: false },
        data: { isResolved: true, resolvedAt: new Date() },
      });
    }
  } else {
    const created = await db.product.create({
      data: {
        ...data,
        slug: await slugFor(row, sku, brandId),
        shortDescription: row.color ? `צבע: ${row.color}` : null,
      },
    });
    productId = created.id;
    result.changedProductIds.add(created.id);
    result.productsAdded++;
    // A brand-new row arrives with a raw title, a broad category and no
    // content at all. It goes straight to the "טיפול" queue with its own
    // alert type rather than waiting to be inferred from what it is
    // missing, so it reads as "this just arrived" and not as "this has
    // been broken for a while".
    await upsertAlert({
      type: "NEW_FROM_SOURCE",
      severity: "WARNING",
      productId,
      sourceId,
      syncRunId,
      sourceSku: sku,
      // A title that is a feature list rather than a product name gets said
      // out loud, because the generic "waiting for a title" reads the same
      // for a raw "{brand} {model}" — which is merely plain — and for
      // "חיישנים+קונדנסור+אפשרות ניקוז", which names nothing at all and is
      // sitting in the page's <h1>.
      message: looksLikeMarketingTitle(row.title)
        ? `${row.title}: השם הזה הוא רשימת תכונות ולא שם מוצר — צריך שם ודגם אמיתיים`
        : `${row.title}: מוצר חדש מהגיליון — ממתין לכותרת, קטגוריה, תמונה ומפרט`,
    });
  }

  /* Whatever this row calls itself today, remembered against the product —
     created or matched, it makes no difference. This is the one signal
     that grows instead of being overwritten, so the next time the supplier
     re-sorts the tab and renames the model at once, the row is still
     recognised by a name it used before. See rememberRowAliases. */
  await rememberRowAliases(productId, sourceId, row);

  // Full replace, not a diff — each sync states what the source currently
  // says, per-location; a location that vanished from the source should
  // vanish from the breakdown too, not linger from a previous run.
  await db.inventorySourceLine.deleteMany({ where: { productId } });
  if (stockLines.length > 0) {
    await db.inventorySourceLine.createMany({
      data: stockLines.map((l) => ({
        productId,
        label: l.label,
        quantity: l.quantity,
      })),
    });
  }

  // The sheet's image column used to be treated as the authority here —
  // "explicit, never guessed, so safe to apply directly" — and it wrote
  // over whatever photo the product already had. That reasoning held while
  // the sheet was the only source of images. It stopped holding twice
  // over: the enrichment endpoint now supplies real manufacturer photos,
  // which the sheet would overwrite on the next run, and a large share of
  // the sheet's own URLs turned out to be hotlinks to competing retailers
  // — 1,428 of them, since deleted from the catalog but still sitting in
  // the source files, ready to be written back.
  //
  // So the sheet fills a gap and never replaces a photo: whatever the
  // agent or an admin put there outranks it, and a blocked host is not
  // written at all.
  // looksLikeEnergyLabelUrl: the scraper saved the EU energy label as the
  // product photo on at least five laundry products. A coloured A-G chart
  // where a washing machine should be is worse than no photo at all — a
  // product with no photo is held off the site until it gets one, a product
  // with a label looks published and correct.
  if (row.imageUrl && !isBlockedImageHost(row.imageUrl) && !looksLikeEnergyLabelUrl(row.imageUrl)) {
    const existingImage = await db.productImage.findFirst({
      where: { productId },
    });
    if (!existingImage) {
      await db.productImage.create({
        data: { productId, url: row.imageUrl, sortOrder: 0 },
      });
    }
  }

  for (const change of changes) {
    if (change.changeType === "PRICE_CHANGED") result.priceChanges++;
    if (
      change.changeType === "STOCK_INCREASED" ||
      change.changeType === "STOCK_DECREASED" ||
      change.changeType === "BECAME_OUT_OF_STOCK" ||
      change.changeType === "BACK_IN_STOCK"
    ) {
      result.stockChanges++;
    }
    await db.inventoryChangeEvent.create({
      data: {
        syncRunId,
        productId,
        sourceId,
        sourceSku: sku,
        sourceSheet: row.sheetName,
        changeType: change.changeType,
        previousValue:
          change.previousValue === null
            ? null
            : JSON.stringify(change.previousValue),
        newValue:
          change.newValue === null ? null : JSON.stringify(change.newValue),
      },
    });
    if (
      (change.changeType === "STOCK_INCREASED" ||
        change.changeType === "STOCK_DECREASED") &&
      typeof change.previousValue === "number" &&
      typeof change.newValue === "number" &&
      isMajorStockChange(change.previousValue, change.newValue)
    ) {
      await upsertAlert({
        type: "MAJOR_STOCK_CHANGE",
        severity: "WARNING",
        productId,
        sourceId,
        syncRunId,
        sourceSku: sku,
        message: `שינוי מלאי חריג ב-${row.title}: ${change.previousValue} → ${change.newValue}`,
      });
    }
  }

  // A handful of units left is a normal, healthy state, not a problem to
  // flag — no alert for LOW_STOCK. OUT_OF_STOCK only reaches here for a
  // product that already existed (brand-new zero-stock rows were skipped
  // above), so it's still worth recording that it dropped to zero.
  if (finalStatus === "OUT_OF_STOCK") {
    await upsertAlert({
      type: "OUT_OF_STOCK",
      severity: "INFO",
      productId,
      sourceId,
      syncRunId,
      sourceSku: row.sku,
      message: `${row.title} אזל מהמלאי`,
    });
  }

  const currentRowTypes = new Set<string>();

  if (!hasAnyStockData(row)) {
    currentRowTypes.add("UNMATCHED_ROW");
    await upsertAlert({
      type: "UNMATCHED_ROW",
      severity: "WARNING",
      productId,
      sourceId,
      syncRunId,
      sourceSku: sku,
      message: `${row.title}: אין נתוני מלאי כלל במקור — לא פורסם, מצריך בדיקה`,
    });
  }
  if (quantityIsImplausible) {
    currentRowTypes.add("NEGATIVE_STOCK");
    await upsertAlert({
      type: "NEGATIVE_STOCK",
      severity: "CRITICAL",
      productId,
      sourceId,
      syncRunId,
      sourceSku: sku,
      message:
        `${row.title}: הגיליון מדווח ${rawStock.toLocaleString("he-IL")} יחידות במחיר ${(priceForSanity ?? 0).toLocaleString("he-IL")} ₪. ` +
        (rowColumnsAreShifted
          ? "אחת מעמודות המלאי בשורה הזאת מכילה מספר שבור, שאינו יכול להיות כמות — סימן שהעמודות בשורה מוסטות והמספר שנקרא ככמות הוא בעצם מחיר. "
          : `שווי של מעל ${(IMPLAUSIBLE_LINE_VALUE / 1_000_000).toFixed(0)} מיליון ₪ לשורה אחת. נראה כמו מחיר שהוקלד בעמודת הכמות. `) +
        `הכמות לא עודכנה ונשארה ${stock.toLocaleString("he-IL")} — צריך לבדוק מול הספק.`,
    });
  }
  if (resolved === null) {
    currentRowTypes.add("INVALID_PRICE");
    await upsertAlert({
      type: "INVALID_PRICE",
      severity: "WARNING",
      productId,
      sourceId,
      syncRunId,
      sourceSku: sku,
      message:
        rejectedPrices.length > 0
          ? `${row.title}: כל המחירים בשורה נמוכים מחצי מעלות הספק (${(row.internalCost ?? 0).toLocaleString("he-IL")} ₪) — ${rejectedPrices.map((p) => p.toLocaleString("he-IL")).join(", ")} ₪. לא פורסם.`
          : `${row.title}: אין מחיר מינימום במקור — לא פורסם`,
    });
  } else if (rejectedPrices.length > 0) {
    // The row still has a usable price, so nothing is blocked — but a column
    // that reads as a fraction of cost is a typo in the sheet, and the shop
    // wants it corrected there rather than quietly routed around here on
    // every future sync.
    currentRowTypes.add("INVALID_PRICE");
    await upsertAlert({
      type: "INVALID_PRICE",
      severity: "WARNING",
      productId,
      sourceId,
      syncRunId,
      sourceSku: sku,
      message: `${row.title}: ${rejectedPrices.map((p) => `${p.toLocaleString("he-IL")} ₪`).join(", ")} נמוך מחצי מעלות הספק (${(row.internalCost ?? 0).toLocaleString("he-IL")} ₪) ולא יכול להיות מחיר מכירה. המחיר נלקח מעמודה אחרת (${resolved.toLocaleString("he-IL")} ₪) — כדאי לתקן בגיליון.`,
    });
  }

  /* The shop's own price, against what the supplier charges today.
     Everything above this checks the sheet's price *columns*; none of it
     looks at the number the customer is actually charged. For an existing
     product those are different things and drift apart by design: cost
     moves with every sheet, and the stored price cannot, because the
     ownership rule says only a person changes it. Nothing was watching
     the gap, so on 30 September fourteen live products were being sold
     below cost — one fridge at 4,790 against a cost of 8,590 — with no
     sign of it anywhere in the back office.

     The price is not corrected here, deliberately. A price is a
     commercial decision and the sheet is not allowed to make it; that is
     the whole reason sync writes stock and nothing else. This says so
     loudly instead, and closes itself the moment the gap does.

     No VAT arithmetic on purpose. The cost column is sometimes ex-VAT and
     sometimes inc-VAT, and a price below either is a loss, so comparing
     the raw numbers only ever under-reports — never invents a problem. */
  const chargedPrice = existing?.price ?? resolved;
  const supplierCost = row.internalCost;
  if (chargedPrice !== null && supplierCost !== null && supplierCost > 0 && chargedPrice < supplierCost) {
    currentRowTypes.add("PRICE_BELOW_COST");
    await upsertAlert({
      type: "PRICE_BELOW_COST",
      severity: "CRITICAL",
      productId,
      sourceId,
      syncRunId,
      sourceSku: sku,
      message:
        `${row.title}: נמכר ב-${chargedPrice.toLocaleString("he-IL")} ₪ בעוד שעלות הספק בגיליון היא ` +
        `${supplierCost.toLocaleString("he-IL")} ₪ — הפסד של ${(supplierCost - chargedPrice).toLocaleString("he-IL")} ₪ לכל יחידה שתימכר. ` +
        `המחיר לא שונה אוטומטית; צריך להחליט עליו ולעדכן בכרטיס המוצר.`,
    });
  }

  for (const issue of row.issues) {
    const typeMap = {
      MISSING_MODEL: "MISSING_MODEL",
      INVALID_PRICE: "INVALID_PRICE",
      NEGATIVE_STOCK: "NEGATIVE_STOCK",
      DUPLICATE_SKU: "DUPLICATE_SKU",
      DUPLICATE_MODEL: "DUPLICATE_MODEL",
      UNMATCHED_ROW: "UNMATCHED_ROW",
    } as const;
    currentRowTypes.add(typeMap[issue.type]);
    await upsertAlert({
      type: typeMap[issue.type],
      severity:
        issue.type === "INVALID_PRICE" || issue.type === "NEGATIVE_STOCK"
          ? "CRITICAL"
          : "WARNING",
      productId,
      sourceId,
      syncRunId,
      sourceSku: sku,
      message: issue.message,
    });
  }

  if (hasConflict) {
    currentRowTypes.add("SOURCE_CONFLICT");
    await upsertAlert({
      type: "SOURCE_CONFLICT",
      severity: "CRITICAL",
      productId,
      sourceId,
      syncRunId,
      sourceSku: sku,
      message: `מק"ט ${sku} מופיע ביותר ממקור פעיל אחד`,
    });
  }

  return { productId, types: currentRowTypes };
}

export async function applyRowsForSource(
  sourceId: string,
  rows: NormalizedProductRow[],
  syncRunId: string,
  conflictSkus: Set<string>,
): Promise<ApplyResult> {
  const threshold = getLowStockThreshold();
  // Every tab this workbook has this run. A product whose sourceSheet is
  // not in here came from a tab that no longer exists — see
  // renamedSheetMatch.
  const sheetsInRun = new Set(rows.map((r) => r.sheetName));
  // One index per source, built a sheet at a time as the rows ask for it.
  const modelIndex = createTempSkuModelIndex(sourceId);
  const result: ApplyResult = {
    productsAdded: 0,
    productsUpdated: 0,
    priceChanges: 0,
    pricesAdopted: 0,
    stockChanges: 0,
    seenSkus: new Set(),
    changedProductIds: new Set(),
  };
  // Overwritten (not merged) per product on every row that touches it, so
  // after the loop this reflects only the *last* processed row for each
  // product — the one whose data actually won.
  const finalIssueTypesByProduct = new Map<string, Set<string>>();

  for (const row of rows) {
    try {
      const outcome = await applyOneRow(
        sourceId,
        row,
        syncRunId,
        conflictSkus,
        threshold,
        result,
        sheetsInRun,
        modelIndex,
      );
      if (outcome)
        finalIssueTypesByProduct.set(outcome.productId, outcome.types);
    } catch (err) {
      await upsertAlert({
        type: "UNMATCHED_ROW",
        severity: "CRITICAL",
        sourceId,
        syncRunId,
        sourceSku: row.sku || null,
        message: `${row.title}: שגיאה בעיבוד השורה, דולגה — ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // Settle pass: a product touched by several rows this run (duplicate-SKU
  // variants) may have accumulated alerts of types its *final* row never
  // triggered — those describe a state it's no longer in, so close them
  // even though upsertAlert's same-type dedup never got the chance to.
  for (const [productId, finalTypes] of finalIssueTypesByProduct) {
    const staleAlerts = await db.inventoryAlert.findMany({
      where: {
        productId,
        isResolved: false,
        type: { in: [...ROW_STATE_ALERT_TYPES] },
      },
    });
    for (const alert of staleAlerts) {
      if (!finalTypes.has(alert.type)) {
        await db.inventoryAlert.update({
          where: { id: alert.id },
          data: { isResolved: true, resolvedAt: new Date() },
        });
      }
    }
  }

  return result;
}

/**
 * One alert per row that more than one product claims.
 *
 * Reconciled from the database rather than raised inside the row loop, for
 * two reasons. upsertAlert resolves every open alert of a type for a source
 * before writing the new one — right for a fault a source has one of, and
 * wrong here, where 143 rows are contested at once and only the last would
 * survive. And the condition is a property of the catalogue, not of a row
 * being read: a position stops being contested when somebody merges the
 * pair, which no sync run observes.
 *
 * Keyed on the first claimant so each contested row owns one alert, and so
 * the dedup upsertAlert does per product applies per row here.
 *
 * Counting only claimants still in the price list, for the same reason the
 * matcher does: 142 positions have more than one record pointing at them,
 * but in 134 of those exactly one is still in the price list and the rest
 * are bookkeeping. Alerting on all 142 would bury the one row where two
 * live products really do want the same line.
 */
/**
 * Closes an urgent finding whose product has left the price list.
 *
 * MANUAL_URGENT is written by the QA agent and nothing resolved it, ever.
 * On 11 October the queue held 188 findings, the newest ten days old, and
 * 111 of them were about products already off the site — 60 about products
 * no longer in any price list at all. 44 described faults that had been
 * fixed that same afternoon. They sat in one list with the 67 that were
 * real, which is precisely how a queue stops being read. This repo has
 * already paid for that once, when alerts fired 3,829 times a day in a form
 * nobody could read.
 *
 * Only the one condition that is checkable without reading the finding: the
 * product is not in any price list, so we do not sell it and the finding is
 * about nothing. Deliberately not "the product is off the site" — a product
 * can be off the site *because* of the very fault the finding describes, and
 * URGENT_MISSING_MEDIA is exactly that. If the supplier lists it again, the
 * agent flags it again.
 */
/**
 * Closes "new from the price list" once the product is finished with.
 *
 * NEW_FROM_SOURCE opens when a sheet row makes a product and nothing ever
 * closed it, so the queue only grew: on 12 October it held 350, of which
 * 116 were already live on the site and 42 had left the price list
 * altogether. The page showed "300 waiting", which was the take rather than
 * a count, and roughly half of what it did show needed nothing.
 *
 * Two conditions, both meaning the work is over. Live is the finish line
 * the flag exists for — published, in stock, photographed, priced, still in
 * the price list — and a product that cleared it is being sold, whatever
 * else might still be improved about it. Gone from the price list is the
 * other ending: we do not sell it, so there is nothing to prepare.
 *
 * Deliberately not "has an image" or "is enriched" on their own. Either can
 * be true while the product still cannot be bought, and a queue that
 * empties before the job is done is worse than one that is too long.
 */
export async function reconcileNewFromSource(): Promise<number> {
  const done = await db.inventoryAlert.updateMany({
    where: {
      type: "NEW_FROM_SOURCE",
      isResolved: false,
      product: {
        OR: [
          { missingFromSourceSince: { not: null } },
          {
            isPublished: true,
            stockQty: { gt: 0 },
            price: { gt: 0 },
            missingFromSourceSince: null,
            stockStatus: { not: "NEEDS_REVIEW" },
            images: { some: {} },
          },
        ],
      },
    },
    data: { isResolved: true, resolvedAt: new Date() },
  });
  return done.count;
}

/**
 * Fold a duplicate record into the one holding its sheet row.
 *
 * The owner's standing instruction, 12 October: "from now on, for every
 * duplicate — always keep the record that holds the row, and get rid of
 * the other." Three rounds of this were done by hand (58 records), and
 * there is nothing in any of them a person decided that this cannot
 * decide, so it stops being a queue.
 *
 * A duplicate here is one specific thing and not a guess: the supplier
 * renumbered a row, the matcher bound it to a new record, and the old one
 * was left holding a stale row position with stock on it. Both records
 * name the same model, and the colour has to agree or be silent on one
 * side — without that test a white oven gets folded into the same oven in
 * stainless, which is a product deleted rather than a duplicate resolved.
 * The five colour families in the catalogue (a Miele H 2861 BP in three
 * finishes, a Gorenje GW951MB in three) are exactly what that test is
 * protecting.
 *
 * Two more guards that a hand merge applied by eye and this has to state:
 *
 * - **Exactly one candidate.** If two live records pass the colour test,
 *   picking one is arbitrary, and arbitrary is how the wrong half of a
 *   pair gets kept. Those are left for a person.
 * - **The loser's claim on the row is released.** Learned the hard way
 *   mid-merge: leave `sourceRowRef` set and the next sync sees two
 *   claimants for one row and refuses it to both, so the merge takes the
 *   product off the site instead of putting it on.
 *
 * It retires rather than deletes, and that is not timidity — OrderItem and
 * CartItem reference Product with no cascade, so a delete either fails on
 * a product somebody has bought or erases it from an order. The record is
 * unpublished, its stock zeroed so it stops being counted twice, its row
 * claim released, its SKU prefixed, and its public URL redirected to the
 * survivor through the slug history. Every list, the sitemap and the
 * Merchant feed drop it; the only thing that still resolves it is an order
 * that already happened.
 */
export async function reconcileDuplicateRowClaims(): Promise<
  { orphanSku: string; keptSku: string; model: string }[]
> {
  const normalise = (v: string | null) => (v ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const CONTENT_SELECT = {
    id: true,
    sku: true,
    slug: true,
    model: true,
    title: true,
    colorName: true,
    categoryId: true,
    description: true,
    shortDescription: true,
    seoTitle: true,
    descriptionSourceUrl: true,
    specSourceUrl: true,
    warrantyMonths: true,
    enrichmentStatus: true,
    stockQty: true,
    _count: { select: { images: true } },
  } as const;

  const [orphans, live] = await Promise.all([
    db.product.findMany({
      where: {
        source: { sourceType: "EXCEL", isActive: true },
        missingFromSourceSince: { not: null },
        stockQty: { gt: 0 },
        model: { not: null },
        /* A record with no row position is one a person deliberately
           detached, or one an earlier merge already retired. Nothing in the
           sync ever clears it, so it is the mark of "already decided". */
        sourceRowRef: { not: null },
      },
      select: CONTENT_SELECT,
    }),
    db.product.findMany({
      where: {
        source: { sourceType: "EXCEL", isActive: true },
        missingFromSourceSince: null,
        model: { not: null },
      },
      select: CONTENT_SELECT,
    }),
  ]);

  const liveByModel = new Map<string, typeof live>();
  for (const p of live) {
    const k = normalise(p.model);
    /* Four characters, the floor modelsAreTheSame uses: a bare "750" would
       pair half the catalogue with itself. */
    if (k.length < 4) continue;
    const bucket = liveByModel.get(k);
    if (bucket) bucket.push(p);
    else liveByModel.set(k, [p]);
  }

  const merged: { orphanSku: string; keptSku: string; model: string }[] = [];
  for (const orphan of orphans) {
    const k = normalise(orphan.model);
    if (k.length < 4) continue;
    const candidates = (liveByModel.get(k) ?? []).filter((c) => {
      if (c.id === orphan.id) return false;
      const a = (orphan.colorName ?? "").trim();
      const b = (c.colorName ?? "").trim();
      if (a === "" || b === "") return true;
      return a === b;
    });
    if (candidates.length !== 1) continue;
    const keeper = candidates[0];

    /* The photograph is the thing most often on the wrong half: the record
       the sheet now points at was created this week and has none, while the
       one being retired was enriched weeks ago. Moved rather than copied,
       and only when the survivor has none — a photo somebody chose for it
       outranks one arriving from a merge. */
    if (keeper._count.images === 0 && orphan._count.images > 0) {
      await db.productImage.updateMany({
        where: { productId: orphan.id },
        data: { productId: keeper.id },
      });
    }

    /* Same argument for the words. A survivor still carrying the sheet's
       raw "{brand} {model}" and a department instead of a category, beside
       a retiring twin that has a real Hebrew title and a description, is
       the Haier HRF495FSS case: the merge was right and it published a
       blank page. Only ever onto a survivor nobody has enriched, and never
       the slug, the SKU, the price or the stock. */
    if (keeper.enrichmentStatus !== "ENRICHED" && orphan.enrichmentStatus === "ENRICHED") {
      await db.product.update({
        where: { id: keeper.id },
        data: {
          title: orphan.title,
          categoryId: orphan.categoryId,
          description: orphan.description,
          shortDescription: orphan.shortDescription,
          seoTitle: orphan.seoTitle,
          descriptionSourceUrl: orphan.descriptionSourceUrl,
          specSourceUrl: orphan.specSourceUrl,
          warrantyMonths: orphan.warrantyMonths ?? keeper.warrantyMonths,
          colorName: (keeper.colorName ?? "").trim() === "" ? orphan.colorName : keeper.colorName,
          enrichmentStatus: "ENRICHED",
        },
      });
    }

    /* The retired record's address answers on its own URL whatever its
       flags say, so without this the duplicate is still a public page for a
       product we are not selling. Handing the slug to the survivor turns
       every link already shared into a redirect to the real product. */
    const retiredSlug = `merged-${orphan.id}`;
    await recordSlugChange(keeper.id, orphan.slug, keeper.slug);
    await db.product.update({
      where: { id: orphan.id },
      data: {
        slug: retiredSlug,
        sku: orphan.sku.startsWith("MERGED-") ? orphan.sku : `MERGED-${orphan.sku}`,
        isPublished: false,
        stockQty: 0,
        stockStatus: "OUT_OF_STOCK",
        enrichmentStatus: "DUPLICATE_DO_NOT_PUBLISH",
        sourceSheet: null,
        sourceRowRef: null,
        sourceRowKey: null,
      },
    });
    await db.inventoryAlert.updateMany({
      where: { productId: orphan.id, isResolved: false },
      data: { isResolved: true, resolvedAt: new Date() },
    });

    merged.push({ orphanSku: orphan.sku, keptSku: keeper.sku, model: orphan.model ?? "" });
  }
  return merged;
}

/**
 * Publish a product the sheet brought in, once it has everything it needs.
 *
 * Because "press publish" was being carried as a job on a product with no
 * photograph, and the owner said the obvious thing about it: you do not
 * publish a product with no picture. He is right — and the flag was worse
 * than useless there, it was a trap. PUBLIC_PRODUCT_WHERE requires an
 * image, so a product with content, stock, a price and the publish flag
 * off looks identical to one that is three fields short, and the moment
 * somebody adds its photograph it still does not appear. Nothing in the
 * shop says why, because nothing is wrong with it.
 *
 * So the flag stops being a step. A product that arrived from a price
 * sheet and has since been enriched, priced, stocked and photographed goes
 * live by itself, and the two reconciles below it resolve its queue entry
 * in the same pass.
 *
 * Three guards, and each is load-bearing:
 *
 * - **An open NEW_FROM_SOURCE alert.** That is what makes this safe. The
 *   alert is raised when the sync creates the product and resolved the
 *   moment it is live or dropped (see reconcileNewFromSource), so an open
 *   one means nobody has made a decision about this product yet. A product
 *   a person deliberately hid has no open alert, and isPublished keeps the
 *   meaning the rest of the file relies on: someone chose to hide this.
 * - **ENRICHED.** Not merely "has an image". 91 products in stock have
 *   never been enriched — their title is still the sheet's raw
 *   "{brand} {model}" — and publishing one of those on the strength of a
 *   photograph puts a page with no description and a department instead of
 *   a category in front of a customer. NEEDS_REVIEW and the
 *   *_DO_NOT_PUBLISH flags fail this test too, which is the intent: both
 *   mean a person still has to look.
 * - **Every public gate.** The conditions are PUBLIC_PRODUCT_WHERE's own,
 *   so this never publishes something that would stay invisible anyway —
 *   publishing is only ever the last missing piece.
 */
export async function reconcileAutoPublish(): Promise<number> {
  const ready = await db.product.findMany({
    where: {
      isPublished: false,
      /* PUBLIC_PRODUCT_WHERE, minus isPublished itself. */
      stockQty: { gt: 0 },
      price: { gt: 0 },
      missingFromSourceSince: null,
      stockStatus: { not: "NEEDS_REVIEW" },
      images: { some: {} },
      enrichmentStatus: "ENRICHED",
      alerts: { some: { type: "NEW_FROM_SOURCE", isResolved: false } },
    },
    select: { id: true, sku: true, title: true },
  });
  if (ready.length === 0) return 0;
  await db.product.updateMany({
    where: { id: { in: ready.map((p) => p.id) } },
    data: { isPublished: true },
  });
  await db.inventoryAlert.updateMany({
    where: { type: "NEW_FROM_SOURCE", isResolved: false, productId: { in: ready.map((p) => p.id) } },
    data: { isResolved: true, resolvedAt: new Date() },
  });
  return ready.length;
}

export async function reconcileResolvedUrgentFindings(): Promise<number> {
  const resolved = await db.inventoryAlert.updateMany({
    where: {
      type: "MANUAL_URGENT",
      isResolved: false,
      product: { missingFromSourceSince: { not: null } },
    },
    data: { isResolved: true, resolvedAt: new Date() },
  });
  return resolved.count;
}

export async function reconcileRowClaimedTwice(syncRunId: string | null): Promise<number> {
  const contested = await db.$queryRaw<
    { sourceId: string; sourceSheet: string; sourceRowRef: number; ids: string[]; labels: string[] }[]
  >`
    select "sourceId", "sourceSheet", "sourceRowRef",
           array_agg(id order by "createdAt") as ids,
           array_agg(coalesce(sku, '?') || coalesce(' / ' || model, '') order by "createdAt") as labels
    from "Product"
    where "sourceId" is not null and "sourceSheet" is not null and "sourceRowRef" is not null
      and "missingFromSourceSince" is null
    group by "sourceId", "sourceSheet", "sourceRowRef"
    having count(*) > 1
  `;

  const keep = new Set<string>();
  for (const row of contested) {
    const owner = row.ids[0];
    keep.add(owner);
    const message =
      `${row.sourceSheet} שורה ${row.sourceRowRef}: ${row.ids.length} מוצרים מחוברים לשורה אחת ` +
      `(${row.labels.join(" · ")}). השורה מתעדכנת רק למוצר שהדגם בה מצביע עליו; ` +
      `האחרים לא מתעדכנים ממנה בכלל, וצריך להחליט אם זה אותו מוצר פעמיים או מוצרים שונים.`;
    const open = await db.inventoryAlert.findFirst({
      where: { type: "ROW_CLAIMED_TWICE", productId: owner, isResolved: false },
    });
    if (!open) {
      await db.inventoryAlert.create({
        data: {
          type: "ROW_CLAIMED_TWICE",
          severity: "CRITICAL",
          productId: owner,
          sourceId: row.sourceId,
          syncRunId,
          message,
          metadata: JSON.stringify({
            sheet: row.sourceSheet,
            rowIndex: row.sourceRowRef,
            productIds: row.ids,
          }),
        },
      });
    } else if (open.message !== message) {
      await db.inventoryAlert.update({ where: { id: open.id }, data: { message, syncRunId } });
    }
  }

  /* And closed for every row that is no longer contested — the only signal a
     merge ever gives us. */
  const stale = await db.inventoryAlert.findMany({
    where: { type: "ROW_CLAIMED_TWICE", isResolved: false },
    select: { id: true, productId: true },
  });
  for (const alert of stale) {
    if (!alert.productId || !keep.has(alert.productId)) {
      await db.inventoryAlert.update({
        where: { id: alert.id },
        data: { isResolved: true, resolvedAt: new Date() },
      });
    }
  }

  return contested.length;
}

export async function markMissingProducts(
  sourceId: string,
  seenSkus: Set<string>,
  syncRunId: string,
): Promise<number> {
  const stillLinked = await db.product.findMany({
    where: { sourceId, missingFromSourceSince: null },
    select: { id: true, sku: true, title: true },
  });
  const missing = stillLinked.filter((p) => !seenSkus.has(p.sku));

  for (const p of missing) {
    await db.product.update({
      where: { id: p.id },
      data: { missingFromSourceSince: new Date(), stockStatus: "NEEDS_REVIEW" },
    });
    await db.inventoryChangeEvent.create({
      data: {
        syncRunId,
        productId: p.id,
        sourceId,
        sourceSku: p.sku,
        changeType: "PRODUCT_MISSING_FROM_SOURCE",
        previousValue: null,
        newValue: null,
      },
    });
    await upsertAlert({
      type: "MISSING_FROM_SOURCE",
      severity: "WARNING",
      productId: p.id,
      sourceId,
      syncRunId,
      sourceSku: p.sku,
      message: `${p.title} נעלם מקובץ המקור — סומן לבדיקה, לא נמחק`,
    });
  }
  return missing.length;
}

export async function recordUnknownColumnAlerts(
  sourceId: string,
  syncRunId: string,
  sheetsWithUnknowns: { sheetName: string; unknownLabels: string[] }[],
) {
  for (const s of sheetsWithUnknowns) {
    if (s.unknownLabels.length === 0) continue;
    await upsertAlert({
      type: "UNKNOWN_COLUMN",
      severity: "INFO",
      sourceId,
      syncRunId,
      message: `גיליון "${s.sheetName}": עמודות לא מזוהות — ${s.unknownLabels.join(", ")}`,
    });
  }
}

// A per-run SOURCE_CONFLICT alert only gets created/resolved for products
// whose own source happened to be re-scanned in that run — but a conflict
// depends on the *other* source too, and that side isn't always the one
// that changed. Worse, deactivating one of the two conflicting sources
// doesn't touch either source's file hash, so a sync can skip both of them
// entirely and the stale "still conflicting" alert never gets cleared.
// This reconciles every open SOURCE_CONFLICT alert against current DB
// ground truth — which real (non-temporary) SKUs are actually claimed by
// more than one *active* source right now — independent of what changed
// in any particular run. Call this after every sync, and also right after
// toggling a source's active state, since that alone can resolve or create
// a conflict without any file ever changing.
export async function reconcileSourceConflictAlerts(syncRunId: string | null) {
  const threshold = getLowStockThreshold();
  const products = await db.product.findMany({
    where: { isTemporarySku: false, source: { isActive: true } },
    select: { id: true, sku: true, sourceId: true },
  });
  const bySku = new Map<string, typeof products>();
  for (const p of products) {
    const list = bySku.get(p.sku) ?? [];
    list.push(p);
    bySku.set(p.sku, list);
  }
  const stillConflicting = new Map<string, typeof products>();
  for (const [sku, group] of bySku) {
    if (new Set(group.map((p) => p.sourceId)).size > 1)
      stillConflicting.set(sku, group);
  }

  const openAlerts = await db.inventoryAlert.findMany({
    where: { type: "SOURCE_CONFLICT", isResolved: false },
  });
  for (const alert of openAlerts) {
    if (!alert.sourceSku || !stillConflicting.has(alert.sourceSku)) {
      await db.inventoryAlert.update({
        where: { id: alert.id },
        data: { isResolved: true, resolvedAt: new Date() },
      });
    }
  }

  // Resolving the alert alone leaves the product's own stockStatus stuck on
  // "NEEDS_REVIEW" — that field is normally only recomputed when the
  // product's own source row gets reprocessed by a real sync, which
  // clearing a conflict this way never triggers. Sweep every product
  // that's still marked NEEDS_REVIEW but has no open alert left at all
  // (covers both alerts just resolved above and ones orphaned by an
  // earlier run, before this recompute step existed) and recompute its
  // status from what's already on the product.
  const orphanedNeedsReview = await db.product.findMany({
    where: {
      stockStatus: "NEEDS_REVIEW",
      alerts: { none: { isResolved: false } },
    },
    select: { id: true, stockQty: true },
  });
  for (const product of orphanedNeedsReview) {
    const status =
      product.stockQty <= 0
        ? "OUT_OF_STOCK"
        : product.stockQty <= threshold
          ? "LOW_STOCK"
          : "IN_STOCK";
    // stockStatus only. This sweep used to republish as well, which made it
    // one more way for a sync to undo a product an admin had hidden by
    // hand — and it is unnecessary: PUBLIC_PRODUCT_WHERE gates on stockQty
    // at query time, so a product with stock is visible without the flag
    // being flipped for it.
    await db.product.update({
      where: { id: product.id },
      data: { stockStatus: status },
    });
  }

  for (const [sku, group] of stillConflicting) {
    const alreadyOpen = await db.inventoryAlert.findFirst({
      where: { type: "SOURCE_CONFLICT", sourceSku: sku, isResolved: false },
    });
    if (alreadyOpen) continue;
    for (const p of group) {
      await upsertAlert({
        type: "SOURCE_CONFLICT",
        severity: "CRITICAL",
        productId: p.id,
        sourceId: p.sourceId,
        syncRunId,
        sourceSku: sku,
        message: `מק"ט ${sku} מופיע ביותר ממקור פעיל אחד`,
      });
      await db.product.update({
        where: { id: p.id },
        data: { stockStatus: "NEEDS_REVIEW", isPublished: false },
      });
    }
  }
}

// Store policy: a product with neither a real photo nor any technical
// spec (structured or the free-text extraSpecsRaw fallback) doesn't go
// live, no matter what the source/enrichment pipeline says about price or
// stock — those two are the minimum a customer needs to trust a listing.
// Runs both directions every time: hides anything currently live that's
// missing both, and republishes anything previously hidden for this exact
// reason the moment enrichment fills in at least one of the two — nobody
// has to remember to flip it back manually. Stock itself is never touched;
// hiding is strictly a visibility flag, not an inventory action.
export async function reconcileUrgentMissingMedia() {
  const toHide = await db.product.findMany({
    where: {
      isPublished: true,
      stockQty: { gt: 0 },
      images: { none: {} },
      attributeValues: { none: {} },
      extraSpecsRaw: null,
    },
    select: { id: true, title: true, sku: true, sourceId: true },
  });
  for (const p of toHide) {
    await db.product.update({ where: { id: p.id }, data: { isPublished: false } });
    await upsertAlert({
      type: "URGENT_MISSING_MEDIA",
      severity: "CRITICAL",
      productId: p.id,
      sourceId: p.sourceId,
      syncRunId: null,
      sourceSku: p.sku,
      message: `${p.title}: אין תמונה ואין מפרט טכני — לא מוצג באתר עד שתתווסף תמונה`,
    });
  }

  const openAlerts = await db.inventoryAlert.findMany({
    where: { type: "URGENT_MISSING_MEDIA", isResolved: false },
    include: {
      product: {
        select: {
          id: true,
          stockQty: true,
          images: { select: { id: true }, take: 1 },
          attributeValues: { select: { id: true }, take: 1 },
          extraSpecsRaw: true,
        },
      },
    },
  });
  let restored = 0;
  for (const alert of openAlerts) {
    const p = alert.product;
    if (!p) continue;
    const hasMedia = p.images.length > 0 || p.attributeValues.length > 0 || !!p.extraSpecsRaw;
    if (hasMedia && p.stockQty > 0) {
      await db.product.update({ where: { id: p.id }, data: { isPublished: true } });
      await db.inventoryAlert.update({ where: { id: alert.id }, data: { isResolved: true, resolvedAt: new Date() } });
      restored++;
    }
  }

  return { hidden: toHide.length, restored };
}

// The other half of the missing-media picture. reconcileUrgentMissingMedia
// above only catches a product with *neither* a photo nor a spec, and it
// flips isPublished as well. A product that has a spec but no photo keeps
// isPublished true, so nothing ever flagged it — and hundreds of them sat
// in the catalog unnoticed.
//
// Since PUBLIC_PRODUCT_WHERE started requiring images.some, those products
// are off the site too: the store does not show a product it has no
// photograph of. They are not hidden by a flag, they simply fail the query
// gate, which is why this only raises an alert and never touches
// isPublished — that flag still means "someone deliberately hid this".
// Together the two reconcilers cover every in-stock product with no image,
// with no product appearing in both lists.
export async function reconcileMissingImage() {
  const needsPhoto = await db.product.findMany({
    where: {
      stockQty: { gt: 0 },
      images: { none: {} },
      OR: [{ attributeValues: { some: {} } }, { extraSpecsRaw: { not: null } }],
    },
    select: { id: true, title: true, sku: true, sourceId: true },
  });
  const open = await db.inventoryAlert.findMany({
    where: { type: "MISSING_IMAGE", isResolved: false },
    select: { id: true, productId: true },
  });
  const alreadyFlagged = new Set(open.map((a) => a.productId));

  let flagged = 0;
  for (const p of needsPhoto) {
    if (alreadyFlagged.has(p.id)) continue;
    await upsertAlert({
      type: "MISSING_IMAGE",
      severity: "WARNING",
      productId: p.id,
      sourceId: p.sourceId,
      syncRunId: null,
      sourceSku: p.sku,
      message: `${p.title}: אין תמונה — לא מוצג באתר עד שתתווסף תמונה`,
    });
    flagged++;
  }

  // Resolve anything that got a photo, went out of stock, or lost the spec
  // that was keeping it published (in which case the urgent reconciler owns
  // it now and it must not be listed twice).
  const stillNeedsPhoto = new Set(needsPhoto.map((p) => p.id));
  const stale = open.filter((a) => a.productId && !stillNeedsPhoto.has(a.productId));
  if (stale.length > 0) {
    await db.inventoryAlert.updateMany({
      where: { id: { in: stale.map((a) => a.id) } },
      data: { isResolved: true, resolvedAt: new Date() },
    });
  }

  return { flagged, resolved: stale.length };
}

export function conflictSkuSet(rows: NormalizedProductRow[]): Set<string> {
  return new Set(detectSourceConflicts(rows).map((c) => c.sku));
}

export type { SyncTrigger };

// The real, repeatable sync: reads each active source's current file from
// Supabase Storage, skips ones whose content hash hasn't changed since the
// last scan, and applies the rest — this is what both the manual "sync now"
// action and the scheduled Vercel Cron endpoint call. Swapping Excel for
// Priority ERP later means replacing how bytes are fetched here; the parse
// -> normalize -> diff -> apply pipeline underneath doesn't change.
/* How long a run may be in flight before the next one may assume it died.
   Long enough that a real 1,700-row sync is never interrupted, short enough
   that one killed invocation does not block the schedule all day. */
const STALE_SYNC_MINUTES = 10;

/**
 * Whether this run re-reads a source whose file has not changed.
 *
 * The hash skip is right for a scheduled run: the supplier sends a sheet
 * every morning, most mornings it is the same bytes, and walking 3,601 rows
 * to write the same values is pure cost. It is wrong for a person pressing
 * the button, and that cost real confusion on 11 October — the price rule
 * changed, the sync was pressed, and it returned NO_CHANGES having read
 * nothing, because the file was identical to the one read four hours
 * earlier. The 142 price differences the screen was promising to close
 * stayed exactly where they were.
 *
 * The file being unchanged does not mean the catalogue agrees with it. It
 * can disagree because a person edited a product, because the run that read
 * it had four tabs unmapped, or because what the sync is allowed to write
 * changed underneath it. "Make the site match the price list" is what the
 * button says and what somebody pressing it means, so a manual run reads
 * the sheets whatever their hash.
 *
 * Idempotent either way: re-applying the same file reaches the same place,
 * which is what makes this safe to do on a press rather than a schedule.
 */
function readsUnchangedSources(trigger: SyncTrigger): boolean {
  return trigger === "MANUAL";
}

export async function runFullSync(
  trigger: SyncTrigger,
  triggeredById?: string,
) {
  const { parseWorkbook } = await import("./excel-parser");
  const {
    fetchSheetWorkbook,
    parseGoogleWorkbook,
    categoryForGoogleSheetTab,
    extractSpreadsheetId,
  } = await import("./google-sheets-source");
  const { normalizeRow, findDuplicates } = await import("./normalizer");
  const { createHash } = await import("crypto");

  /* ONE SYNC AT A TIME, and the guard lives here rather than in the route
     that calls it.

     It started in the route, which covered the cron and the agent and missed
     the one caller a person actually uses: the button in the admin goes
     straight to this function. Two runs then walk the same 1,700 rows from
     two copies of the same sheet and write the same products, and the later
     write wins by accident. Putting it at the entrance is the only version
     nobody has to remember.

     Nothing enforced this before and nothing needed to — a person does not
     press a button twice in the same minute. It stops being true the moment
     an agent calls this on a schedule.

     STALE_SYNC_MINUTES rather than "until it finishes": Vercel kills a
     function at its maxDuration and a killed run leaves its row saying
     RUNNING forever, so an unbounded rule would block every sync afterwards
     with no way to tell it from a real one.

     Refused, not queued. A skipped sync costs nothing — the next one reads
     the same file and reaches the same place. An interleaved one costs a
     catalogue nobody can explain. */
  const inFlight = await db.inventorySyncRun.findFirst({
    where: {
      status: "RUNNING",
      startedAt: { gt: new Date(Date.now() - STALE_SYNC_MINUTES * 60_000) },
    },
    orderBy: { startedAt: "desc" },
  });
  if (inFlight) {
    /* Returned in the shape of a run, and deliberately NOT written to the
       history: a stood-down attempt is not a sync, and a history filling
       with them would bury the runs that did something. The caller reports
       it; the log keeps it. */
    return {
      ...inFlight,
      id: inFlight.id,
      status: "SKIPPED" as const,
      errorMessage: `סנכרון אחר התחיל ב-${inFlight.startedAt.toISOString()} ועדיין רץ`,
      rowsScanned: 0,
      productsAdded: 0,
      productsUpdated: 0,
      productsMissing: 0,
      priceChanges: 0,
      stockChanges: 0,
    };
  }

  const syncRun = await db.inventorySyncRun.create({
    data: { trigger, triggeredById, status: "RUNNING", sourceIds: "[]" },
  });

  const sources = await db.inventorySource.findMany({
    where: { isActive: true },
  });
  const scannedSourceIds: string[] = [];
  const allRows: NormalizedProductRow[] = [];
  const perSourceRows = new Map<string, NormalizedProductRow[]>();
  const perSourceUnknowns = new Map<
    string,
    { sheetName: string; unknownLabels: string[] }[]
  >();
  let totalRowsScanned = 0;
  let anyChanged = false;
  const reapplyUnchanged = readsUnchangedSources(trigger);

  for (const source of sources) {
    await db.inventorySource.update({
      where: { id: source.id },
      data: { lastScannedAt: new Date() },
    });

    let sheets: import("./types").ParsedSheet[] = [];
    let contentHash: string;
    let contentSize: number;
    let categoryResolver: (sheetName: string) => string | null = () =>
      source.categorySlugOverride ?? null;

    try {
      if (source.sourceType === "GOOGLE_SHEET") {
        if (!source.sheetUrl) continue;
        const spreadsheetId = extractSpreadsheetId(source.sheetUrl);
        if (!spreadsheetId) throw new Error("קישור הגליון אינו תקין");
        const bytes = await fetchSheetWorkbook(spreadsheetId);
        contentHash = createHash("sha256").update(bytes).digest("hex");
        contentSize = bytes.length;
        if (contentHash === source.fileHash && !reapplyUnchanged) continue;
        const workbook = parseGoogleWorkbook(
          bytes,
          source.categorySlugOverride,
        );
        sheets = workbook.sheets;
        categoryResolver = (sheetName) =>
          categoryForGoogleSheetTab(sheetName, source.categorySlugOverride);
      } else {
        const { downloadInventoryFile, isStorageConfigured } =
          await import("./storage");
        if (!isStorageConfigured() || !source.storagePath) continue;
        const bytes = await downloadInventoryFile(source.storagePath);
        contentHash = createHash("sha256").update(bytes).digest("hex");
        contentSize = bytes.length;
        if (contentHash === source.fileHash && !reapplyUnchanged) continue;
        const workbook = parseWorkbook(bytes, source.key as SourceKey);
        sheets = workbook.sheets;
      }
    } catch (err) {
      await upsertAlert({
        type: "UNMATCHED_ROW",
        severity: "CRITICAL",
        sourceId: source.id,
        syncRunId: syncRun.id,
        message: `נכשל בטעינת המקור: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }

    anyChanged = true;
    scannedSourceIds.push(source.id);

    perSourceUnknowns.set(
      source.id,
      sheets
        .filter((s) => s.unknownLabels.length > 0)
        .map((s) => ({
          sheetName: s.sheetName,
          unknownLabels: s.unknownLabels,
        })),
    );

    const rows: NormalizedProductRow[] = [];
    for (const sheet of sheets) {
      totalRowsScanned += sheet.rows.length;
      // A brand named once as its own yellow divider ("GAGGIA", "B&W") is
      // now known for the rest of this sheet — used as a fallback signal
      // when extracting brand from other rows' free-text descriptions.
      const knownBrands = brandLikeDividers(
        sheet.rows
          .map((r) => r.sectionLabel)
          .filter((l): l is string => l !== null),
      );
      for (const row of sheet.rows) {
        rows.push(
          normalizeRow(
            source.key,
            sheet.sheetName,
            row,
            sheet.columns,
            categoryResolver(sheet.sheetName),
            knownBrands,
          ),
        );
      }
    }
    findDuplicates(rows);

    /* One alert per tab that resolved to no category, before a single row is
       applied.
       Read off the normalised rows rather than re-running the lookup, so
       this can never disagree with what the rows actually carry — the
       35-day outage was precisely two pieces of code disagreeing about the
       same tab name, and a check that re-derives the answer is a third
       chance to disagree. A tab with rows and not one mapped row is a tab
       whose whole contents were about to be dropped.

       Reconciled by hand rather than through upsertAlert, because that
       helper resolves every open alert of a type for a source before
       creating the new one — right for a fault a source has at most one of,
       and wrong here: four tabs broke at once in September, and each
       upsertAlert would have closed the previous tab's alert. So: close the
       tabs that now map, keep one open alert per tab that does not, and
       rewrite its message so the count it quotes is today's. */
    const perSheet = new Map<string, { total: number; mapped: number }>();
    for (const row of rows) {
      const seen = perSheet.get(row.sheetName) ?? { total: 0, mapped: 0 };
      seen.total++;
      if (row.categorySlug) seen.mapped++;
      perSheet.set(row.sheetName, seen);
    }
    const unmapped = [...perSheet].filter(([, c]) => c.total > 0 && c.mapped === 0);

    const openSheetAlerts = await db.inventoryAlert.findMany({
      where: { type: "SHEET_NOT_MAPPED", sourceId: source.id, isResolved: false },
      select: { id: true, message: true, metadata: true },
    });
    const sheetOf = (metadata: string | null): string | null => {
      if (!metadata) return null;
      try {
        const parsed: unknown = JSON.parse(metadata);
        const name = (parsed as { sheetName?: unknown })?.sheetName;
        return typeof name === "string" ? name : null;
      } catch {
        return null;
      }
    };
    const stillBroken = new Set(unmapped.map(([name]) => name));
    const resolveIds = openSheetAlerts
      .filter((a) => {
        const name = sheetOf(a.metadata);
        /* An alert whose metadata cannot be read names no tab, so nothing
           can clear it on evidence. Cleared rather than kept: it was raised
           by an older version of this code, and a stale CRITICAL nobody can
           act on is the failure mode this whole change exists to end. */
        return name === null || !stillBroken.has(name);
      })
      .map((a) => a.id);
    if (resolveIds.length > 0) {
      await db.inventoryAlert.updateMany({
        where: { id: { in: resolveIds } },
        data: { isResolved: true, resolvedAt: new Date() },
      });
    }

    for (const [sheetName, counts] of unmapped) {
      /* How much of the shop this tab is holding up, because "a tab did not
         map" and "73 published products stopped updating" land very
         differently on the person reading the alerts list. */
      const live = await db.product.count({
        where: { sourceSheet: sheetName, isPublished: true, stockQty: { gt: 0 } },
      });
      const message =
        `הלשונית "${sheetName}" במחירון לא זוהתה, ולכן ${counts.total} השורות שלה לא יושמו. ` +
        (live > 0
          ? `${live} מוצרים מפורסמים מהלשונית הזאת אינם מתעדכנים — המלאי והמחיר באתר נשארים כפי שהיו. `
          : "אין מוצרים מפורסמים מהלשונית הזאת כרגע. ") +
        "צריך להוסיף את שם הלשונית ל-sheet-map.ts.";
      /* And off the site, because we cannot vouch for them.
         This is the hole that let the September outage run for 35 days.
         applyOneRow adds a product's SKU to seenSkus *before* it resolves
         the category — deliberately, so that a slug missing from the
         database does not get a product wrongly marked
         missing-from-source — which means every product under an unmapped
         tab counts as "seen in the price list" and markMissingProducts
         never flags one. They keep serving the stock and the price they had
         when the tab last worked. Four tabs did exactly that, and a
         customer rang about a TV mount whose stock had been frozen since
         September.
         NEEDS_REVIEW is the honest label and the right mechanism: the row
         is still in the file, so "missing from source" would be a lie, but
         the inventory data cannot be verified — which is what the status
         means, and PUBLIC_PRODUCT_WHERE already excludes it. It heals by
         itself: stockOnlyUpdate rewrites stockStatus on every matched row,
         so the products come back the moment the tab maps again. */
      const hidden = await db.product.updateMany({
        where: {
          sourceId: source.id,
          sourceSheet: sheetName,
          stockStatus: { not: "NEEDS_REVIEW" },
        },
        data: { stockStatus: "NEEDS_REVIEW" },
      });

      /* Folded into the one alert rather than raised as a second one.
         upsertAlert resolves every open alert of a type for a source before
         it creates the new one — right for a fault a source has at most one
         of, and wrong here, where four tabs broke at once — so a second
         call would have closed three of the four alerts this block just
         reconciled by hand. Taking products off the shop floor should never
         happen quietly, so it is said; it is said in the message. */
      const fullMessage =
        hidden.count > 0
          ? `${message} ${hidden.count} מוצרים מהלשונית הוסרו מהאתר כי לא ניתן לאמת את המלאי שלהם, ויחזרו מעצמם ברגע שהלשונית תזוהה.`
          : message;

      const existingAlert = openSheetAlerts.find((a) => sheetOf(a.metadata) === sheetName);
      if (existingAlert) {
        if (existingAlert.message !== fullMessage) {
          await db.inventoryAlert.update({
            where: { id: existingAlert.id },
            data: { message: fullMessage, syncRunId: syncRun.id },
          });
        }
      } else {
        await db.inventoryAlert.create({
          data: {
            type: "SHEET_NOT_MAPPED",
            severity: "CRITICAL",
            sourceId: source.id,
            syncRunId: syncRun.id,
            message: fullMessage,
            metadata: JSON.stringify({
              sheetName,
              rows: counts.total,
              livePublished: live,
              takenOffTheSite: hidden.count,
            }),
          },
        });
      }
    }

    perSourceRows.set(source.id, rows);
    allRows.push(...rows);

    await db.inventorySource.update({
      where: { id: source.id },
      data: { fileHash: contentHash, fileSizeBytes: contentSize },
    });
  }

  // DB-ground-truth reconciliation, independent of which sources' files
  // actually changed this run — see reconcileSourceConflictAlerts for why.
  await reconcileSourceConflictAlerts(syncRun.id);
  await reconcileRowClaimedTwice(syncRun.id);
  await reconcileResolvedUrgentFindings();
  /* The merge first: it is what gives a survivor its photograph and its
     words, and a survivor that only just got both is exactly what
     reconcileAutoPublish should then put on the site. Before
     reconcileNewFromSource too, which resolves the queue entry
     reconcileAutoPublish reads as evidence that nobody has decided about
     the product yet. */
  await reconcileDuplicateRowClaims();
  await reconcileAutoPublish();
  await reconcileNewFromSource();
  await reconcileUrgentMissingMedia();
  await reconcileMissingImage();

  if (!anyChanged) {
    await db.inventorySyncRun.update({
      where: { id: syncRun.id },
      data: {
        status: "NO_CHANGES",
        sourceIds: JSON.stringify(scannedSourceIds),
        finishedAt: new Date(),
      },
    });
    return db.inventorySyncRun.findUniqueOrThrow({ where: { id: syncRun.id } });
  }

  const conflicts = conflictSkuSet(allRows);
  let productsAdded = 0,
    productsUpdated = 0,
    productsMissing = 0,
    priceChanges = 0,
    pricesAdopted = 0,
    stockChanges = 0;
  const changedProductIds = new Set<string>();

  for (const sourceId of scannedSourceIds) {
    const rows = perSourceRows.get(sourceId) ?? [];
    const result = await applyRowsForSource(
      sourceId,
      rows,
      syncRun.id,
      conflicts,
    );
    productsAdded += result.productsAdded;
    productsUpdated += result.productsUpdated;
    priceChanges += result.priceChanges;
    pricesAdopted += result.pricesAdopted;
    stockChanges += result.stockChanges;
    result.changedProductIds.forEach((id) => changedProductIds.add(id));
    productsMissing += await markMissingProducts(
      sourceId,
      result.seenSkus,
      syncRun.id,
    );
    await recordUnknownColumnAlerts(
      sourceId,
      syncRun.id,
      perSourceUnknowns.get(sourceId) ?? [],
    );
    await db.inventorySource.update({
      where: { id: sourceId },
      data: { lastSyncedAt: new Date() },
    });
  }

  const errorCount = await db.inventoryAlert.count({
    where: { syncRunId: syncRun.id, severity: "CRITICAL" },
  });

  /* And what they were. errorCount has always been written and errorMessage
     never was, so a run reading "errorCount 74" said only that something
     went wrong 74 times — the QA agent raised exactly that on 1 October:
     "errorMessage is empty as usual so there is no way to know what failed."
     The alerts carry the answer and are keyed by syncRunId; nobody was going
     to go and join them by hand, and a number with no cause is a number
     people learn to scroll past.
     Grouped by type and counted, because the shape is what matters at this
     altitude: "19 rows with no identifying model, 10 duplicate SKUs" is a
     diagnosis, while the first alert's text is an anecdote. The per-row
     detail stays where it already is, in the alerts for this run. */
  const errorsByType = await db.inventoryAlert.groupBy({
    by: ["type"],
    where: { syncRunId: syncRun.id, severity: "CRITICAL" },
    _count: { type: true },
    orderBy: { _count: { type: "desc" } },
  });
  const errorMessage =
    errorsByType.length === 0
      ? null
      : errorsByType
          .map((e) => `${INVENTORY_ALERT_TYPE_LABELS[e.type as InventoryAlertType] ?? e.type}: ${e._count.type}`)
          .join(" · ");

  // One IndexNow submission for the whole run, listing every product this
  // sync actually moved. Read back from updatedAt rather than threaded
  // through the loop: the loop already writes the timestamp, and one query
  // is cheaper than carrying a set through four call sites that would each
  // have to remember to add to it.
  //
  // Only what is on the site: a product that is unpublished or out of stock
  // has no page to re-crawl, and asking Bing to fetch a 404 is how a
  // submitter's URLs stop being trusted.
  //
  // Only what actually changed. updatedAt moves on every row every run —
  // lastExcelSyncAt is written whether or not stock moved — so reading it
  // back submitted the whole catalogue on every sync, and Bing's own
  // dashboard said so: a submitter that announces 1,300 unchanged pages as
  // changed is deprioritised, which delays the ones that did change. The
  // loop now records which rows were created or had stock move, and that
  // set is the submission.
  const touched =
    changedProductIds.size > 0
      ? await db.product.findMany({
          where: { ...PUBLIC_PRODUCT_WHERE, id: { in: [...changedProductIds] } },
          select: { slug: true },
        })
      : [];
  if (touched.length > 0) await submitUrls(productPaths(touched.map((p) => p.slug)));

  return db.inventorySyncRun.update({
    where: { id: syncRun.id },
    data: {
      status: "SUCCESS",
      sourceIds: JSON.stringify(scannedSourceIds),
      rowsScanned: totalRowsScanned,
      productsAdded,
      productsUpdated,
      productsMissing,
      priceChanges,
      pricesAdopted,
      stockChanges,
      errorCount,
      errorMessage,
      finishedAt: new Date(),
    },
  });
}
