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

## The price on the site is the price list's price, and Ninja is the only exception

Stated by the owner on 13 October, after a sweep found the catalogue holding
36 hand-set prices nobody remembered setting: **nothing is priced by hand any
more except Ninja.** Every other product shows whatever `resolvedPrice` reads
off its row — the minimum of `מחיר מוצג`, `מינימום למכירה` and `קוד מנכ"ל`.

`priceManualAt` is what refuses an adoption, so it is now the whole policy in
one column, and it may be set for exactly four reasons:

- **Ninja.** Nine live products, eight of them on a running `compareAtPrice`.
- **The sheet's own price is below the sheet's own cost.** 200052 (LG OLED 65
  G5: cost 8,100, `קוד מנכ"ל` 6,900) and 200131 (1,800 against 1,790). Adopting
  those would break "אין אפשרות שמחיר יהיה מתחת לעלות", so `adoptPrice` refuses
  on its own and no flag is needed — but the refusal is the reason those two
  read as a gap in any reconciliation, and they are not a bug.
- **The supplier put one SKU on two rows.** 101058 is `JCF58 IX` at 3,200 on
  מקררים 74 and `JCF88 BK` at 3,600 on row 75. Position is matched before SKU,
  but row 75 has no claimant of its own, so the SKU lookup hands it our product
  and the later row wins every run. The freeze is what keeps 3,200 — the price
  of its *own* row — on the page. Repointing does not survive a sync; only the
  supplier splitting the SKU does.
- **A row that was reassigned** — `ROW_NAMES_ANOTHER_MODEL`, below.

Everything else that looked manual was not. All 36 flags were written in one
batch at 14:55 on 12 October by `rowModelWasReassigned` firing over a whole
catalogue at once, and 34 of them were wrong: the row's description named our
product exactly (`7800B` against a Sauter Cuisine-7850B, both "77 ליטר 10
תוכניות"), and only the model *column* disagreed, because it carries the
supplier's shorthand. **The guard compares model to model; a person has to
compare the row to the product.** Before trusting a batch of these, read the
row's title — `tools/dump-rows.ts` prints it — and do not read agreement
between our price and the row's price as evidence of anything, because our
price was adopted from that row in the first place.

## The source price sheets are read-only. Never write to them.

The three price lists on the company's file server — מחירון מלאי אלקטרוניקה,
מחירון ליין קטן, מחירון ליין לבן מסכים — are the company's own record, maintained
in the ERP and exported for everyone who needs them. This shop is one consumer of
that export among several.

**Nothing in this project may modify, rename, move, delete or re-save any of them,
under any circumstances.** Not to mark a row as processed, not to normalise a
header, not to fix a typo in a title, not "just to re-save it as a cleaner xlsx".
A corrected value belongs in this database, where the field-ownership table above
says it belongs; the sheet is never the place to write a correction back to.

What that rules out in practice, because these are the ways it happens by accident:

- opening a workbook with a library in write mode. `openpyxl.load_workbook()`
  followed by any `save()` rewrites the whole file and drops the formatting the
  parser depends on — the highlighted brand headers and the yellow section
  dividers are load-bearing (see brand attribution below).
- driving Excel or LibreOffice to convert or export. Both rewrite on close.
- the "move it to a processed/ folder when done" pattern. The file stays where it
  is; what has been seen is recorded on our side, by hash.
- reading the original repeatedly. Anything that fetches a sheet copies the bytes
  once to local scratch and works on the copy from there.

Any agent that pushes these files to the site reads with `open(path, "rb")` and
nothing else, and records the file's sha256 before and after its own run so that a
violation is caught rather than trusted. The server never has a route back to that
share at all, which is the one guarantee that holds without anybody remembering it.

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

## `Product.model` is enrichment's field, so the matcher compares row to row

The sheet's model column is the supplier's shorthand; `Product.model` is what
enrichment wrote after checking the manufacturer — `8780IN` becomes
`CTAC8780AFSNE`, `SIH 8080` is stored as `SHI8080`, `CMA583MBO` as `CMA583MB0`
because the supplier typed a letter O for a zero. They are *supposed* to
diverge, and a correction is the normal case rather than the exception.

So no identity test may compare the row against `Product.model` alone. On
12 October the 04:30 run did, on both the position and the content-key paths,
and took **fourteen enriched, photographed, published products off the site in
one run** — replacing each with a blank record on the same sheet, the same row
index and the same `sourceRowKey`. The key matched exactly. The guard refused
it because enrichment had corrected the model since, so every successful
enrichment looked like a different product.

`lastRowModel` is the answer and it is written for this: the model *the row*
carried on the previous run, by the sync and by nothing else. All fourteen rows
arrived carrying exactly the string the product's `lastRowModel` already held.
`rowStillNamesThisProduct` asks the product's own model first and falls back to
that, which is strictly row-against-row and therefore immune to anything a
person or the agent edits. It does not loosen the protection it replaces — a
shifted block puts a *different* row at the position, and a different row's
model matches neither field. `npm run check:guards` carries all fourteen pairs
plus the moved-row and silent cases.

## A real SKU is the supplier's key, not a promise about what it points at

Every guard above is about a row with *no* SKU. A row that carries one was
believed outright — `bindingIsAssertable` read `!row.skuIsSynthetic` and
stopped there — because the SKU is the supplier's own identifier and the
signal the whole import rests on.

It is also one they are free to reuse. On 12 October a customer was offered a
Samsung RT53DG7A14WW, a 530-litre top-freezer, at **6,200 ₪**. SKU 107012 in
`מקררים` row 550 had become a **RF60C7012SL** — a 660-litre four-door costing
5,700 — and 6,200 is that row's `קוד מנכ"ל`. The fridge's own record, holding
row 536 whose model does say RT53DG7A14WW, was sitting hidden at **3,600 ₪**
after a duplicate merge kept the wrong half. The shop was asking 2,600 ₪ too
much and nothing anywhere reported it, because the SKU matched and a matching
SKU was the whole test.

Two halves to the fix, because they answer different questions:

- **`rowModelWasReassigned`** (sync, blocking). A row whose model *moves* into
  one the product's own model contradicts is a reassignment: stock is still
  adopted, price and cost are not, `priceManualAt` is set so the refusal
  outlives the run, and `ROW_NAMES_ANOTHER_MODEL` is raised. The test is "did
  the row change", never "does the row disagree" — disagreement is the normal
  case, since `Product.model` is enrichment's field and `8780IN` becoming
  `CTAC8780AFSNE` would otherwise freeze the price of every properly enriched
  product. What is distinguishable is *which side moved*: enrichment moves our
  model, a reassignment moves the row, and `lastRowModel` is the only field
  that can tell you.
- **`rowBindingLooksForeign`** (watchdog, advisory). A SKU that had already
  moved before anybody was watching is invisible to the test above by
  construction — the row has not changed in months. So the catalogue is swept
  from outside, and 20 live products were in exactly that state, 72,676 ₪ of
  listed price. It cannot be settled from the database, so it raises a flag
  and blocks nothing: once per product, ever, because the answer needs
  somebody to open the price list and re-asking every three hours teaches
  people to resolve it without looking.

The advisory one keeps its precision with filters that were measured, not
guessed — 61 raw hits down to 20. A shared three-character run clears it
(every enrichment correction keeps the manufacturer's stem); a model column
with no digit is a brand name (`CASO`, `Ninja`, `Charleston`); `1200W` is a
wattage; and a row model that is *mostly* the product's own SKU is the
supplier's shorthand. That last one has a trap in it: the first version
cleared any row containing the SKU's last four characters, and the first thing
the fixtures did was clear SKU 107012 against RF60C7012SL — the founding case
— because the Samsung's code happens to contain `7012`. A filter written from
"the SKU matches, so the row is ours" fails the same way the bug did.

`npm run check:guards` carries all of it: the 14 enrichment corrections
asserted against both guards, 12 reassignment transitions, and the 61 swept
products split into the 22 the sweep should flag and the 40 it must not.

## The third shape: our own title naming a different product

The two guards above are both about the price list. This one is not — the row
is right, the price is right, and the two halves of our own record contradict
each other.

SKU 0902 was a page titled **"טלוויזיה סמסונג Samsung Crystal UHD 65U8000H"**
at 10,500 ₪ whose model, row, brand, structured specs and photograph were all
an **LG OLED evo C6 77"** costing 9,900. Only the title, the short description
and the long description were a different television's. A customer searching
for that Samsung found this page at 10,500 while the real Samsung 65U8000H sat
at 2,400 under SKU 0867, and the LG could not be found by its own name at all.
**Nothing was wrong with its price**, which is why every price check in this
file is blind to it.

`titleNamesAnotherModel` reports the pair and does not pick a side. Often the
title and the row agree and it is `Product.model` that is stale — three
Blomberg ovens here have a title and a price-list row that both read HGN9335Z
against a model field of HGN9333Z. Settling that needs the manufacturer.

Its filters are where the work is, and every one came from running the thing
over the catalogue rather than reasoning about it — 119 raw hits down to 16,
and all 16 are genuine:

- **A token never spans a space.** The first draft matched across them and
  turned "Miele M 7244 TC CleanSteel 46" into a single 24-character "code"
  that matched nothing. That one mistake was most of the 119.
- **Fold O to zero *after* testing for a digit.** Folding first turns
  `NoFrost` into `N0FR0ST` and `Dolby Atmos` into `D0LBYATM0S`, and two
  products were flagged for model codes the function had invented itself.
- **Same characters in a different order is a rewrite.** Tornado's air
  conditioners are stored "SMART 30 INV לבן" and titled "SMART-INV-30".
- **A trailing unit is a measurement** — "543BTU" is the tail of "20,543BTU"
  split on its comma.
- **Three or more foreign codes is a compatibility list** — a DAVO bowl's
  title names the three mixers it fits.

There was a fourth rule, for a screen size in the title contradicting the size
in the model code. It is not here: after the one product it would have caught
was fixed, a sweep found no other, and its only remaining hit was LG writing
`85QNED85B` for an 86-inch set, where the leading digits are the series rather
than the size. A rule with no work to do and a known false positive is worse
than no rule.

## `enrichmentStatus` has three values, and the database now says so

`enums.ts` is described above as the single source of truth for every
enum-like column. It was true of the code and false of the database: 209
products carried **twelve** values that no type, schema or label knew about —
`DUPLICATE_DO_NOT_PUBLISH`, `MODEL_CONFLICT_DO_NOT_PUBLISH`,
`NEEDS_MODEL_VERIFICATION`, `ENRICHED_NIGHT_NO_IMAGE_YET` — each one written
by an agent (this one included) reaching for a word it needed and writing it
straight in with raw SQL.

Each is a lie in the TypeScript union, a blank cell wherever
`ENRICHMENT_STATUS_LABELS` is indexed, and a silent fall-through in every
`=== "ENRICHED"` *and* `!== "ENRICHED"` branch at once. The back office had
grown a whole layer that read them back with `status.includes("DO_NOT_PUBLISH")`,
so the invented vocabulary was load-bearing by the time anyone noticed.

The reason a record is held was never a lifecycle state, which is why it never
fitted: it has an author, a date, a body of text and an end, and
`InventoryAlert` has all four. So the column is back to its three values, the
objection lives in an alert (`QUARANTINE_ALERT_TYPES`), and both `Product`
enum-like columns now carry a CHECK constraint — a rule that lives only in a
document is one every new agent gets to rediscover.

## A SKU-less row is identified by every name it has ever used

577 of the 2,031 rows carry no SKU, and a SKU is the only identifier that
does not have to be guessed at. For those rows the import had three guesses —
the row's position, a hash of the row's text, and the model the row printed
last run — and each is overwritten every sync, so all three describe the sheet
as it looked last time and all three go stale together. On 11 and 12 October
they did: the supplier re-sorted a tab, rewrote the row text, and enrichment
had since corrected our model. 59 live products were marked gone and replaced
with blank records, ~₪340,000 off the site, both runs reporting `SUCCESS`.

`ProductRowAlias` is the fourth signal and the only one that accumulates.
Every model string and every row hash a product has been seen under is kept,
so `8780IN` becoming `CTAC8780AFSNE` **adds** a name rather than losing one.
0883 now answers to both; 0897 to `SIH8080` and `SHI8080`; 0909 to
`H2861BGREY` and `H2861BGRAY` — the three renames that broke it. Same idea as
`ProductSlugHistory`, and for the same reason: what people and suppliers do to
an identifier is change it.

Unique on `(sourceId, sheetName, kind, value)`, so a name two products claim is
not an identity — the holder keeps it and the newcomer falls through to the
ordinary guesses instead of stealing a row. An alias never revives a product
the price list has dropped; that was a decision the sync made deliberately.

It narrows the window, it does not close it. A SKU in the sheet is still the
only thing that removes the guessing — see `docs/supplier-sheet-issues-*.md`.

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
`isPublished && stockQty > 0 && images.some && stockStatus != NEEDS_REVIEW &&
missingFromSourceSince == null && price > 0 && the source is an active EXCEL
price list`. That last one closed a hole: `missingFromSourceSince` answers
"has the sheet stopped carrying it", not "is it in a price list at all", so a
product created by the admin form or by `POST /api/integrations/products`
carried null there and passed. The rule held only because nobody had used
those paths yet. Store policy: an out-of-stock product is
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

## The sheet's dimensions column is mislabelled, and not row-consistent

The source row carries a column headed `עומקXגובהXרוחב` — depth × height × width —
present on 199 of the 202 products in the five cooling leaves, and it is the obvious
place to read a width from. It is also wrong: on 166 of the 181 rows that can be
checked against the description, the **first** number matches the stated width, not
the third. The header's first and last labels are swapped against its own data — and
on a handful of rows (LG GM-859RSCE, Bauknecht GKIE IL 3000, Maxwell MAX-RDNH440X)
the order really is depth-first as labelled.

A column whose field order varies row to row cannot be parsed, so it is used only to
corroborate. `backfill-dimension-specs.ts` (`npm run check:dimensions`) reads width and
depth out of `Product.description` — written from the manufacturer's figures, with the
URL in `descriptionSourceUrl` — and writes nothing at all where the two disagree by
more than 2 cm, listing those products for a person instead. 12 widths and 31 depths
are withheld on that rule.

Two things to know before adding to it: dimension values are stored as **bare numbers**
(`"90.8"`), because `product-content.ts` appends the attribute's unit only to a value
that is bare and `"60 ס"מ"` would render the unit twice; and `רוחב`/`עומק` must be
matched immediately followed by the number, so that `רוחב נישה` and
`רוחב מינימלי להתקנה` — the opening's measurement, not the appliance's — are skipped.

The five cooling leaves also carry a legacy attribute set keyed `width`/`capacity`,
while `seed-category-attributes.ts` uses `width_cm`/`capacity_liters` and does not
cover those slugs at all. The filled seeded schema sits on the *department*
(`refrigeration`), which is also why 71 products parked there have a width in their
text and nowhere to put it. Adopting the seeder's keys on a leaf that already has
`width` would leave two רוחב rows per category, so the legacy key stays until someone
merges the two sets deliberately.

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

- **Vercel's Redeploy button republishes the commit that is already live**, not the
  newest one on `main`. It looks like "fetch the latest and build it" and it is the
  opposite: a rebuild of the same source. That alone only wastes a build — the cost
  is the ordering. A Redeploy pressed after a push lands *after* it, and whichever
  deployment finishes last takes the domain, so the redeploy silently rolls
  production back to the older code and the change that was just pushed disappears
  with no error anywhere. It has happened twice: once to a Pelecard stylesheet fix,
  once to the payment-lane change, and both times the symptom was "the fix isn't
  live" rather than anything that looked like a rollback. **A push already builds and
  publishes by itself. There is nothing to press.**

- **Preview builds fail.** Env vars are set for Production only, so `DATABASE_URL` is
  empty in Preview and `/sitemap.xml` — which queries the database at build time —
  takes the build down with `Can't reach database server at 127.0.0.1:5432`.
- **A new Prisma field silently does not write until the client is
  regenerated.** `prisma generate` ran only in `postinstall`. Vercel restores
  `node_modules` from its build cache when `package.json` has not changed, and
  a restored install skips `postinstall` — so a deploy carries the client from
  whichever build last really installed, and the generated client is gitignored
  so nothing in the repo disagrees. A column added to the schema and to the
  database is then absent from the client, Prisma 7 drops the unknown key out
  of `data` instead of refusing it, the update succeeds, and the value is never
  written: no error, no alert, no failed row. On 11 October `lastMatchPath` and
  `lastRowModel` were written by 3,601 rows and landed nowhere, while
  `pricesAdopted` — added two builds earlier, when an install really happened —
  was written on the same run. The read direction is worse: a client that does
  not know `priceManualAt` returns `undefined` for it, so `=== null` is false
  and the sync stops adopting prices, or with the condition inverted overwrites
  every price a person set. `build` now runs `prisma generate` first and
  `npm run check:prisma` guards it.

- **`prisma db push` hangs against the pooler** (PgBouncer, port 6543). For schema
  changes use direct DDL via `db.$executeRawUnsafe`, then `prisma generate`.
- **`npm install` depends on the container's egress policy.** `xlsx` is pinned to
  a tarball on `cdn.sheetjs.com` rather than the npm registry, so any install has
  to reach that host. It has been blocked; on 2026-09-15 it answered 200 and
  `npm install @icons-pack/react-simple-icons` completed normally. Try it before
  assuming it is unavailable — and if it is blocked, that is the reason, so the
  workaround is to vendor the one thing you need rather than to fight the install.
- **Manufacturer sites are unreachable** from every cloud container (`samsung.com`,
  `lg.com` → `connect_rejected`). Product images and manufacturer specs can only be
  fetched by a session running on a real machine.
- **Supabase counts database egress against the same quota as storage, and a
  card query is where it goes.** In September the free tier's 5 GB ran out and
  Storage answered 402 for four days. The photographs were blamed and were
  innocent: the whole bucket is 61 MB and the image route served under 500 MB a
  month. It was `cardInclude` in `queries/products.ts`, an `include` where a
  `select` belonged — every column of `Product` on every card of every grid,
  8,559 bytes fetched for the 232 a card renders, and a category page is
  twenty-four of them. Nothing in the types showed it, because
  `ProductWithRelations` was already written as the narrow shape. Before
  suspecting a file, price the queries.

- **Every inventory alert is written by a sync run, so a sync that never starts
  reports nothing.** The same outage killed the price-sheet upload, which is
  upstream of the run, and the shop sold against four-day-old stock with every
  back-office screen looking normal. `inventory/sync-watchdog.ts` now asks from
  outside, on its own cron, whether a sheet has *arrived* in the last 18 hours
  — arrival, not a successful run, because the agent correctly skips the sync
  when the supplier changed nothing, and the last run before anyone noticed
  read `SUCCESS`. Anything new that can stop the catalog updating needs a check
  that does not live inside the thing that stops.

  The same watchdog now also asks whether a run **swapped a live product for a
  blank record on its own row** — `checkReplacedProducts`. It happened twice in
  two days (45 products on 11 October at 19:39, 14 more on 12 October at 04:30,
  ~₪340,000 of stock off the site) and both runs reported `SUCCESS` with a tidy
  "N added, N missing". It is keyed on one run's own change log —
  `PRODUCT_MISSING_FROM_SOURCE` and `NEW_PRODUCT` on the same tab and row in the
  same pass — and not on `sourceRowKey`. The first version paired on that hash
  and produced 55 matches against the live catalogue, one of them a ₪2,400
  cooktop against a ₪10,500 one, which read as the hash colliding. Measured
  properly afterwards it is not: of 399 keyed products exactly one pair shares
  a key, and that pair is now excluded (a row with no model and no title of its
  own used to key on the forward-filled brand alone). The 55 were keys stamped
  from *older* versions of the sheet, on records the price list has since
  dropped — a key is only evidence about the sheet that wrote it. Pair across
  time by the run that did it, not by the key.

- **Secrets live in the Vercel dashboard only** — `PRODUCT_ENRICH_SECRET`,
  `SUPABASE_SERVICE_ROLE_KEY` and the rest are not in `.env` and not in the repo.

## Enum-like columns

Status/role fields are `String` columns backed by the TS unions + Zod schemas in
`src/lib/enums.ts`. That file is the single source of truth for every "enum" — add
values there, not in the schema.
