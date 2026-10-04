// The field vocabulary of the two agent-facing endpoints, and the check
// that reads a request against it.
//
// Deliberately importless: no Prisma, no next/server. It is the one part of
// the integration API that can be held to its own rules by a plain script,
// and it is the part most worth checking — these tables now decide whether
// a request is answered or rejected.
//
// Every key the endpoints understand is listed where it is handled, and
// anything else used to be dropped without a word. That is the quietest
// failure in this API and the one that cost the most: an agent sent
// `title`, got 200 and an empty `applied`, and concluded the title was not
// writable — it is, under the name `name`. Same for `isPublished`, which is
// refused on purpose but said so nowhere.
//
// So an unrecognised key is a 400 naming it, and where the caller almost
// certainly meant a real field, naming that too. A body the server does not
// understand is a bug in the caller, not a case to absorb.

export type KeyCheck = {
  known: readonly string[];
  /**
   * Wrong name -> the real one, for the mistakes worth guiding out of.
   * A value wrapped in parentheses is used as the explanation itself,
   * which is how a field that is refused on purpose says why instead of
   * pointing at a field that does not exist.
   */
  aliases?: Readonly<Record<string, string>>;
};

export function unknownKeysIn(record: Record<string, unknown>, check: KeyCheck): string[] {
  const known = new Set(check.known);
  return Object.keys(record).filter((k) => !known.has(k));
}

// ---------------------------------------------------------------------------
// The vocabularies, one per endpoint, kept here so a check can hold them to
// their own rules — an alias that points at a field which does not exist
// sends a caller somewhere there is nothing.
// ---------------------------------------------------------------------------

// The whole vocabulary of this endpoint, in one place, because it is now
// enforced. A single item may also be sent unwrapped at the top level, so
// the top-level set is the batch flags plus every item field.
export const ENRICH_ITEM_KEYS: KeyCheck = {
  known: [
    "sku", "name", "title", "model", "gtin13", "colorName", "description", "descriptionSourceUrl",
    "technicalSpec", "specSourceUrl", "images", "removeImages", "appendImages", "replaceImages",
    "overwriteDescription", "brand", "category", "warranty", "supplier", "sourceUrl",
    "sourceBackfillOnly", "overwrite",
    // refused, but by name and with a reason — see the skipped entries
    "price", "stockQty", "isPublished",
  ],
  aliases: {
    productTitle: "title",
    productName: "title",
    desc: "description",
    specs: "technicalSpec",
    spec: "technicalSpec",
    technicalSpecs: "technicalSpec",
    imageUrls: "images",
    image: "images",
    categorySlug: "category",
    brandName: "brand",
    color: "colorName",
    // The barcode under every name it is written by. Stored as gtin13, sent
    // to Google as g:gtin and to schema.org as gtin13 when it is 13 digits.
    gtin: "gtin13",
    ean: "gtin13",
    ean13: "gtin13",
    barcode: "gtin13",
    upc: "gtin13",
    published: "isPublished",
    active: "isPublished",
    visible: "isPublished",
    hidden: "isPublished",
    isActive: "isPublished",
    status: "isPublished",
    source: "sourceUrl",
    sourcePageUrl: "sourceUrl",
  },
};

const ENRICH_BATCH_FLAGS = ["items", "dryRun", "appendImages", "replaceImages", "overwriteDescription", "sourceBackfillOnly", "overwrite"];
export const ENRICH_TOP_LEVEL_KEYS: KeyCheck = {
  known: [...new Set([...ENRICH_BATCH_FLAGS, ...ENRICH_ITEM_KEYS.known])],
  aliases: { ...ENRICH_ITEM_KEYS.aliases, products: "items", data: "items", rows: "items", product: "items" },
};


// Same enforcement as product-enrich: a key this endpoint does not
// understand is a bug in the caller, and answering 200 to a body that was
// half ignored is how an agent comes to report a product as uploaded when
// it is not.
export const CREATE_ITEM_KEYS: KeyCheck = {
  known: [
    "sku", "title", "brand", "category", "price", "model", "gtin13", "colorName", "description",
    "descriptionSourceUrl", "technicalSpec", "specSourceUrl", "images", "warranty",
    "supplier", "stockQty", "sourceUrl",
  ],
  aliases: {
    gtin: "gtin13",
    ean: "gtin13",
    ean13: "gtin13",
    barcode: "gtin13",
    upc: "gtin13",
    name: "title",
    productTitle: "title",
    desc: "description",
    specs: "technicalSpec",
    technicalSpecs: "technicalSpec",
    imageUrls: "images",
    image: "images",
    categorySlug: "category",
    brandName: "brand",
    color: "colorName",
    // Creation is always isPublished:false, on purpose — say so rather
    // than accepting the field and ignoring it.
    isPublished: "(not settable — every product created here waits for a human in \"מוכן לפרסום\")",
    published: "(not settable — every product created here waits for a human in \"מוכן לפרסום\")",
  },
};
export const CREATE_TOP_LEVEL_KEYS: KeyCheck = {
  known: [...new Set(["items", "dryRun", ...CREATE_ITEM_KEYS.known])],
  aliases: { ...CREATE_ITEM_KEYS.aliases, products: "items", data: "items", rows: "items", product: "items" },
};

// ---------------------------------------------------------------------------
// /api/integrations/brands — the brand page's content, for the agent that
// writes it. Everything on a Brand row that is text about the brand; never
// the name or the slug, which are public in URLs and in product titles.
// ---------------------------------------------------------------------------
export const BRAND_ITEM_KEYS: KeyCheck = {
  known: ["slug", "name", "description", "aboutContent", "pageContent", "seoTitle", "seoDesc", "logoUrl"],
  aliases: {
    brand: "slug",
    brandSlug: "slug",
    brandName: "name",
    about: "aboutContent",
    aboutText: "aboutContent",
    content: "pageContent",
    page: "pageContent",
    pageText: "pageContent",
    guide: "pageContent",
    metaTitle: "seoTitle",
    metaDescription: "seoDesc",
    seoDescription: "seoDesc",
    logo: "logoUrl",
    image: "logoUrl",
  },
};
const BRAND_BATCH_FLAGS = ["items", "dryRun"];
export const BRAND_TOP_LEVEL_KEYS: KeyCheck = {
  known: [...new Set([...BRAND_BATCH_FLAGS, ...BRAND_ITEM_KEYS.known])],
  aliases: { ...BRAND_ITEM_KEYS.aliases, brands: "items", data: "items", rows: "items" },
};
