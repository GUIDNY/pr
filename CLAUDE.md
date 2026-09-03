@AGENTS.md

# A&I Electronics — orientation for any session working here

Hebrew/RTL storefront + admin back office, live at **pr-ayam.vercel.app**. Inventory
is imported from supplier Excel price sheets and enriched afterwards. Next.js 16 (App
Router) · React 19 · Tailwind v4 · Prisma 7 over Supabase Postgres (`ap-southeast-2`) ·
Vercel project `guidnys-projects/pr-ayam`.

More than one agent works on this repo and this database at the same time. Everything
below is here so that two of us don't quietly undo each other's work.

## `main` deploys to production

`main` is the production branch and Vercel builds it on push. **A push to `main` puts
code in front of customers** — there is no separate deploy step and no staging database.
Work on a branch unless the change is meant to go live.

A failed build never replaces the running site, so a bad push costs a cycle, not an
outage.

## Field ownership — the rule that keeps the catalog coherent

| Owner | Writes | Never touches |
|---|---|---|
| Sync — **new** product from a sheet row | the whole record: `sku`, `title`, `price`, `brandId`, `categoryId`, stock, colour — then flags it `NEW_FROM_SOURCE` so it lands in the "טיפול" queue for the agent | — |
| Sync — **existing** product | `stockQty`, `stockStatus`, `stockBreakdown` and the source-position bookkeeping. **Nothing else.** Not price, not title, not brand, not category, not `isPublished` | everything a person or the agent set |
| Enrichment (`POST /api/integrations/product-enrich`) | everything about a product's *content*: `title`, `categoryId`, brand, `model`, `colorName`, `description`, specs, images, supplier, warranty — sent means written, no opt-in needed | `price`, `stockQty`, `sku`, `slug` |
| Admin product form | everything on the form — and marks the product `ENRICHED` | — |
| Marketing | `Promotion` rows only | `Product` |

The sheet's job is stock. A product it already created is never re-derived from it
again: price is set once at creation and afterwards only a person or the agent changes
it, and the same goes for every content field. That is what finally stopped the cycle
where a morning's corrections were gone by the next morning — the sync has nothing left
to overwrite them with.

It also no longer runs on a schedule, so it and the endpoint cannot race. Someone
presses sync in the admin when the supplier sends a new sheet.

`slug` is never written by anything after creation — it is public in the product URL,
so renaming a product must not break links already shared.

## Brand attribution is derived, and it has been wrong before

`Product.brandId` is not typed into the sheet per row. It comes out of
`excel-parser.ts` + `brand-extractor.ts`: a BRAND column whose block headers are
sometimes highlighted and sometimes not, a forward-fill across the rows that leave it
blank, the manufacturer's name inside the free-text description, and the yellow section
divider above the row — in that order.

That chain has misfiled products five separate times, and every previous fix corrected
the *rows* rather than the derivation, so the next 05:00 sync re-derived the same wrong
answer. Before correcting brand data, run `npm run check:brands` and satisfy yourself
the import produces the right answer now; otherwise you are scheduling the same ticket
again.

The tell is cheap to look for: a product whose assigned brand contradicts the
manufacturer named in its own title (`Bosch` on a row titled `באוכנכט KFN96APEAL`).
That is never a typo in the sheet, it is the derivation.

## `enrichmentStatus` is load-bearing

`NOT_ENRICHED` → `ENRICHED` (or `NEEDS_REVIEW`). Two paths set it: the enrich endpoint
when it writes real content (provenance-only writes such as `descriptionSourceUrl` do
not count), and the admin product form on save.

Once a product is `ENRICHED` the nightly sync stops rewriting its `title` and
`categoryId`. Before that guard existed, every corrected title and leaf category was
reset to the sheet's raw `"{brand} {model}"` value by the next morning.

The flip is effectively permanent, so a wrong category set now will not self-correct.

## Product visibility

`PUBLIC_PRODUCT_WHERE` in `src/lib/queries/products.ts` is
`isPublished && stockQty > 0 && images.some`. Store policy: an out-of-stock product is
not shown at all, not even with a badge — and neither is a product with no photograph
of itself. Both are query-time gates, so a product returns to the site the moment it
has stock and a photo, with no sync run in between.

Every customer-facing query must spread that constant rather than re-deriving the
conditions. Search, the Finder, Alfred's pinned picks, compare, the cart's add
handler, the category counts and the product page each used to hand-roll
`isPublished: true, stockQty: { gt: 0 }`, which is exactly how a rule like this rots:
one place gets updated and seven keep the old behaviour.

The sync also unpublishes anything missing both an image and specs, and flags
everything in stock with no image into the "טיפול" tab (`MISSING_IMAGE`).

Consequence worth knowing before touching the catalog: a large share of invisible
products are invisible for missing *content*, not because anyone hid them.

## The Google Merchant Center feed is a read of the storefront

`/feeds/google-merchant.xml` is what Google fetches once a day for
[buytoday.co.il](https://buytoday.co.il) — the domain claimed in Merchant Center
account 5847431184. It is a pull-based feed on purpose, not the Merchant API:
there is no secret to hold, nothing writes back into the catalog, and stock only
moves when someone presses sync anyway.

It is built from `PUBLIC_PRODUCT_WHERE`, and that is not a detail. Google
compares every feed item against the page it links to and suspends accounts over
a feed that disagrees with the shop, so "what is in the feed" has to stay the
same predicate as "what is on the site" rather than a second copy that drifts.
The product page carries matching JSON-LD (`Product` + `Offer`) from the same
availability table, for the same reason.

Two things that are easy to undo by accident:

- **It lives under `/feeds/`, not `/api/`.** `robots.ts` disallows `/api` for
  every crawler and Merchant Center's fetcher honours robots.txt — moving it
  breaks the daily fetch with an error that never mentions robots.
- **`Product.description` is HTML** (`<h3>`, `<p>`, `<ul>` — the product page
  renders it). Google rejects markup in a feed description, so the feed sends
  `shortDescription`, falling back to the flattened long text. Sending
  `description` raw rejects every item.

`npm run check:feed` guards the escaping, the exclusions and the price/identifier
rules without needing a database.

## Structured specs hang off leaf categories

`CategoryAttribute` rows belong to leaf categories, not departments. `sheet-map.ts` maps
a whole tab to one broad category on purpose (the tabs mix sub-types with no per-row
category column), so a product parked in a department has **no spec schema to fill at
all**. Correcting its category is a prerequisite for specs, not a nicety.

## Never invent product data

Capacities, dimensions, energy ratings and the like must come from a real source, and
the source URL belongs in `descriptionSourceUrl` / `specSourceUrl`. A wrong spec on a
retail page is a customer ordering something other than what they saw. When a value
can't be verified, leave it empty and mark the product `NEEDS_REVIEW`.

The same rule covers images: `ProductImage.url` is only ever filled from the source
sheet's image column or a real manufacturer asset — never a guessed URL or a
search-result picture.

And the sheet's image column is not trusted blindly. Much of it hotlinks competing
Israeli retailers — 1,428 such images were deleted from the catalog, and every URL is
still in the source files. The sync fills an image only when a product has none, never
replaces one (a photo the enrichment agent found outranks the sheet), and skips the
hosts in `blocked-image-hosts.ts` outright. `npm run check:images` guards both rules.

## Environment traps, all confirmed the hard way

- **Preview builds fail.** Env vars are set for Production only, so `DATABASE_URL` is
  empty in Preview and `/sitemap.xml` — which queries the database at build time —
  takes the build down with `Can't reach database server at 127.0.0.1:5432`.
- **`prisma db push` hangs against the pooler** (PgBouncer, port 6543). For schema
  changes use direct DDL via `db.$executeRawUnsafe`, then `prisma generate`.
- **`npm install` fails**: `xlsx` is pinned to `cdn.sheetjs.com`, which the sandbox
  egress policy blocks.
- **Manufacturer sites are unreachable** from every cloud container (`samsung.com`,
  `lg.com` → `connect_rejected`). Product images and manufacturer specs can only be
  fetched by a session running on a real machine.
- **Secrets live in the Vercel dashboard only** — `PRODUCT_ENRICH_SECRET`,
  `SUPABASE_SERVICE_ROLE_KEY` and the rest are not in `.env` and not in the repo.

## Enum-like columns

Status/role fields are `String` columns backed by the TS unions + Zod schemas in
`src/lib/enums.ts`. That file is the single source of truth for every "enum" — add
values there, not in the schema.
