import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { Star, Truck, ShieldCheck, PackageCheck, Pencil } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProductGallery } from "@/components/product/product-gallery";
import { PriceBlock } from "@/components/product/price-block";
import { ProductPriceEditor } from "@/components/product/product-price-editor";
import { ProductTitleEditor } from "@/components/product/product-title-editor";
import { ProductSpecsEditor } from "@/components/product/product-specs-editor";
import { ProductDescriptionEditor } from "@/components/product/product-description-editor";
import { BrandHighlight } from "@/components/product/brand-highlight";
import { BrandAboutSection } from "@/components/product/brand-about-section";
import {
  ProductFactCard,
  ProductSummary,
  ProductFeatureList,
  ProductBulletList,
  ProductProse,
  ProductSections,
} from "@/components/product/product-overview";
import { ProductSpecTable, ProductDimensionsBlock } from "@/components/product/product-spec-table";
import { parseProductContent, buildSpecRows, splitDimensions, pickHighlights } from "@/lib/product-content";
import { StockBadge } from "@/components/product/stock-badge";
import { CompareButton } from "@/components/product/compare-button";
import { ProductReviewFlagButton } from "@/components/product/product-review-flag-button";
import { PurchasePanel } from "@/components/product/purchase-panel";
import { MobileBuyBar } from "@/components/product/mobile-buy-bar";
import { ConsultSection } from "@/components/product/consult-section";
import { ProductRail } from "@/components/home/product-rail";
import { StickyTabsBar } from "@/components/product/sticky-tabs-bar";
import { getProductBySlug, getRelatedProducts, getCategoryAttributesFor, getProductsByBrandSlug } from "@/lib/queries/products";
import { getProductReviewFlag } from "@/lib/queries/admin-inventory";
import {
  SCHEMA_AVAILABILITY,
  SCHEMA_AVAILABILITY_FALLBACK,
  SCHEMA_CURRENCY,
  feedDescription,
} from "@/lib/feeds/google-merchant";
import { absoluteUrl } from "@/lib/site-url";
import { getFavoriteProductIdsAction } from "@/actions/favorites";
import { getSession } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import type { StockStatus } from "@/lib/enums";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product || !product.isPublished || product.stockQty <= 0 || product.images.length === 0) return {};
  return {
    title: product.title,
    description: product.shortDescription ?? product.description ?? undefined,
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product || product.stockQty <= 0) notFound();

  const session = await getSession();
  const isAdminViewer = session?.role === "ADMIN" || session?.role === "STAFF";
  // A regular visitor still gets a 404 for anything unpublished, and for
  // anything with no photograph — the two conditions PUBLIC_PRODUCT_WHERE
  // gates every listing on, enforced here too so a direct link or a stale
  // Google result can't reach a page that no listing would show. An admin
  // needs to actually open the page to fix it (that's the whole point of
  // the inline editors below), so they're let through with an explicit
  // "not live" notice instead.
  const offSiteForVisitors = !product.isPublished || product.images.length === 0;
  if (offSiteForVisitors && !isAdminViewer) notFound();

  const [related, favoriteIds, brandProductsResult] = await Promise.all([
    getRelatedProducts(product.categoryId, product.id, 4),
    getFavoriteProductIdsAction(),
    getProductsByBrandSlug(product.brand.slug, { pageSize: 8 }),
  ]);
  const brandProducts = brandProductsResult.products.filter((p) => p.id !== product.id);
  // Only fetched for admins — every other visitor never needs the full
  // attribute list, just whichever ones already have a value.
  const categoryAttributes = isAdminViewer ? await getCategoryAttributesFor(product.categoryId) : [];
  const reviewFlag = isAdminViewer ? await getProductReviewFlag(product.id) : "NONE";

  // One parse of the product's own text, feeding every section below.
  // parseProductContent only ever returns substrings of what is already
  // stored — see lib/product-content.ts for the shapes it recognises and
  // what it refuses to guess at.
  const content = parseProductContent(product.description, product.shortDescription);
  // Structured attributes first, then scraped extraSpecsRaw, then whatever
  // could be parsed out of sentences — merged rather than either/or, which
  // is what left a product with 16 real spec pairs in extraSpecsRaw showing
  // a table of one because it happened to have a single CategoryAttribute.
  const allSpecRows = buildSpecRows(product.attributeValues, product.extraSpecsRaw, content.specs);
  const { specs: specRows, dimensions: dimensionRows } = splitDimensions(allSpecRows);
  // The highlight strip is drawn from the same list the spec table shows in
  // full, so the two can never disagree — but not simply its first six rows:
  // a yes/no row ("סאב-ווופר אלחוטי") carries no meaning as a bare value.
  const highlightFacts = pickHighlights(specRows);

  const categoryIcon = product.category.parent?.icon ?? product.category.icon;
  const maxQuantity = Math.max(1, Math.min(product.stockQty, 10));

  // ProductGallery is a Client Component, so whatever's in its `images`
  // prop gets serialized into the page's hydration payload for every
  // visitor, not just the ones who see the admin-only source badge it's
  // rendered from — passing the raw rows through unconditionally would leak
  // the scraped source URLs to a plain "view source" even though they're
  // never painted on screen for a non-admin. Stripped down to just id/url
  // for anyone who isn't an admin viewer.
  const galleryImages = isAdminViewer ? product.images : product.images.map((img) => ({ id: img.id, url: img.url }));

  // Fallback for when a source's spec fields didn't map to a real
  // CategoryAttribute — shown only when there's no structured spec at all,
  // so a real, filterable spec table always wins when one exists.
  let rawSpecs: Record<string, string> | null = null;
  if (product.attributeValues.length === 0 && product.extraSpecsRaw) {
    try {
      rawSpecs = JSON.parse(product.extraSpecsRaw);
    } catch {
      rawSpecs = null;
    }
  }

  // Structured data for the product, which is what Google actually reads
  // when it says it is "scanning the site" — there is no crawler looking at
  // the rendered page and inferring a price from it. It is also the half of
  // the Merchant Center setup that the feed can't cover on its own: Google
  // compares a feed item against the JSON-LD on the page it links to, and a
  // page carrying none is the mismatch it warns about.
  //
  // Only emitted for a page a visitor can actually reach. An admin looking
  // at an unpublished or photo-less product is being shown a preview, and
  // marking it up as a live offer would advertise something the store has
  // deliberately not put on sale.
  const productJsonLd = offSiteForVisitors
    ? null
    : {
        "@context": "https://schema.org",
        "@type": "Product",
        name: product.title,
        // The same text the feed sends, from the same helper — description
        // is stored as HTML for the page, and JSON-LD wants plain text.
        description: feedDescription(product),
        sku: product.sku,
        // The manufacturer's model number, never the internal sku — the two
        // are different fields here and schema.org's mpn means the former.
        mpn: product.model ?? undefined,
        color: product.colorName ?? undefined,
        image: product.images.map((img) => img.url),
        brand: { "@type": "Brand", name: product.brand.name },
        offers: {
          "@type": "Offer",
          url: absoluteUrl(`/product/${product.slug}`),
          priceCurrency: SCHEMA_CURRENCY,
          price: product.price.toFixed(2),
          itemCondition: "https://schema.org/NewCondition",
          availability:
            SCHEMA_AVAILABILITY[product.stockStatus as StockStatus] ?? SCHEMA_AVAILABILITY_FALLBACK,
        },
        // Only when there is a real rating behind it. schema.org rejects an
        // aggregateRating with a zero reviewCount, and inventing one is the
        // kind of thing that costs a merchant its rich results outright.
        aggregateRating:
          product.ratingCount > 0
            ? {
                "@type": "AggregateRating",
                ratingValue: product.ratingAvg.toFixed(1),
                reviewCount: product.ratingCount,
              }
            : undefined,
      };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 pb-24 lg:pb-6">
      {productJsonLd && (
        <script
          type="application/ld+json"
          // Every "<" escaped to its JSON \u form. Descriptions are stored
          // HTML written by the enrichment agent, and a "</script>" anywhere
          // in one would otherwise close this tag early and put the rest of
          // the product's text into the page as live markup.
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(productJsonLd).replace(/</g, "\\u003c"),
          }}
        />
      )}

      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">ראשי</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          {product.category.parent && (
            <>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href={`/category/${product.category.parent.slug}`}>{product.category.parent.name}</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
            </>
          )}
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={`/category/${product.category.slug}`}>{product.category.name}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="line-clamp-1">{product.title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {isAdminViewer && offSiteForVisitors && (
        <div className="border-destructive/30 bg-destructive/10 text-destructive mt-4 rounded-xl border px-4 py-2.5 text-sm font-medium">
          {!product.isPublished
            ? "המוצר הזה לא מפורסם באתר כרגע ורק אתם רואים אותו — הוסיפו תמונה או מפרט טכני כדי שיחזור לתצוגה אוטומטית."
            : "למוצר הזה אין תמונה, ולכן הוא לא מוצג באתר ורק אתם רואים אותו — הוסיפו תמונה והוא יחזור לתצוגה מיד."}
        </div>
      )}

      {isAdminViewer && (
        <Link
          href={`/admin/products/${product.id}`}
          className="fixed bottom-20 end-4 z-40 flex items-center gap-1.5 rounded-full bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-amber-600 lg:bottom-6"
        >
          <Pencil className="size-4" />
          ערוך מוצר
        </Link>
      )}

      <div className="mt-5 grid grid-cols-1 gap-8 lg:grid-cols-2">
        <ProductGallery
          productId={product.id}
          images={galleryImages}
          title={product.title}
          brand={product.brand.name}
          categoryIcon={categoryIcon}
          isFavorite={favoriteIds.includes(product.id)}
          isAdmin={isAdminViewer}
          warrantyMonths={product.warrantyMonths}
        />

        {/* purchase column */}
        <div className="flex flex-col gap-4">
          <div>
            <Link href={`/brand/${product.brand.slug}`} className="text-brand text-sm font-semibold hover:underline">
              {product.brand.name}
            </Link>
            {isAdminViewer ? (
              <ProductTitleEditor productId={product.id} title={product.title} />
            ) : (
              <h1 className="mt-1 text-2xl font-bold sm:text-3xl">{product.title}</h1>
            )}
            <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-3 text-sm">
              <span>מק&quot;ט: {product.sku}</span>
              {product.model && <span>דגם: {product.model}</span>}
              {product.ratingCount > 0 && (
                <span className="flex items-center gap-1">
                  <Star className="fill-warning text-warning size-4" />
                  {product.ratingAvg.toFixed(1)} ({product.ratingCount} ביקורות)
                </span>
              )}
            </div>
          </div>

          {isAdminViewer ? (
            <ProductPriceEditor
              productId={product.id}
              price={product.price}
              compareAtPrice={product.compareAtPrice}
              installmentMonths={product.installmentMonths}
            />
          ) : (
            <PriceBlock
              price={product.price}
              compareAtPrice={product.compareAtPrice}
              installmentMonths={product.installmentMonths}
              size="lg"
            />
          )}

          <div className="flex items-center gap-4">
            <StockBadge status={product.stockStatus as StockStatus} />
            <span className="text-muted-foreground flex items-center gap-1 text-sm">
              <Truck className="size-4" /> משלוח תוך {product.deliveryDays} ימים
            </span>
          </div>

          <PurchasePanel productId={product.id} stockStatus={product.stockStatus as StockStatus} maxQuantity={maxQuantity} />

          <div className="flex flex-wrap gap-2">
            {/* On mobile this sat alone as a small, orphaned pill floating
                in whitespace below the two full-width CTAs — a full-width
                secondary button reads as part of the same button group
                instead. Desktop keeps its original compact inline size. */}
            <CompareButton productId={product.id} className="h-11 w-full justify-center sm:h-7 sm:w-fit" />
            {isAdminViewer && <ProductReviewFlagButton productId={product.id} initialFlag={reviewFlag} />}
          </div>

          {/* The full warranty/delivery/payment trio used to repeat here
              AND in the "משלוח ואחריות" tab below — same three facts twice
              on one page. Warranty now lives as a badge on the gallery
              photo itself instead (see ProductGallery); delivery/payment
              stay covered by the tab, so nothing here duplicates it. */}

          <ConsultSection productTitle={product.title} />
        </div>
      </div>

      {/* info tabs */}
      <div className="mt-6">
        <Tabs defaultValue="overview">
          <StickyTabsBar>
            <div className="overflow-x-auto">
              {/* gap/text shrink on mobile so all four tabs fit the
                  viewport without needing the horizontal scroll below to
                  actually be used — overflow-x-auto stays on the wrapper
                  as a safety net for a narrower phone or a longer label,
                  not as the expected everyday interaction. */}
              <TabsList
                variant="line"
                className="border-border h-auto w-full min-w-max justify-start gap-3 rounded-none border-b bg-transparent p-0 sm:gap-6"
              >
                {[
                  { value: "overview", label: "סקירה כללית" },
                  { value: "specs", label: "מפרט טכני" },
                  { value: "delivery", label: "משלוח ואחריות" },
                  { value: "reviews", label: `ביקורות (${product.reviews.length})` },
                ].map((tab) => (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className="text-muted-foreground data-active:text-foreground hover:text-foreground shrink-0 rounded-none border-0 bg-transparent px-0.5 pb-3 text-xs shadow-none data-active:bg-transparent data-active:font-bold data-active:shadow-none after:bg-brand after:h-0.5 sm:px-1 sm:text-sm"
                  >
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          </StickyTabsBar>

          <TabsContent value="overview" className="py-4">
            {/* Narrow reading column, product-first the whole way down:
                1. על המוצר (heading + short desc + real highlight bullets)
                2. נתונים מרכזיים (key facts strip) — used to be followed by
                   a separate "למה לבחור" card grid restating the exact same
                   facts as value+label a second time (real, ugly repetition
                   confirmed live on a product whose attribute values are
                   long phrases, not short specs — "מכונות קפה Faber" shown
                   twice back to back). Without real spec->benefit copy to
                   translate them into, that second section could only ever
                   repeat the first one, so it's gone rather than kept as
                   filler.
                3. תכונות וטכנולוגיות מרכזיות (remaining description prose,
                   given the premium alternating-block treatment instead of
                   a flat "מידע נוסף" wall of text — same real content, just
                   nothing left over to duplicate in a separate section)
                4. מידות (real dimension attributes only)
                5. אודות המותג (brand banner + about card) — deliberately
                   last, after every product-specific fact, not competing
                   with the product for attention up top.
                6. מוצרים נוספים של אותו מותג (full-width, outside the
                   column) */}
            {/* Two columns from lg: the description reads at its own
                measure on one side, the facts sit on the other. One column
                at 1100px meant a 62ch paragraph against 600px of nothing,
                with a section rule ruled the whole way across it — the
                width was there, nothing was using it. */}
            <div className="grid max-w-[980px] grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-12">
              <div className="flex min-w-0 flex-col gap-9">
                <ProductSummary summary={content.summary} />

                {isAdminViewer ? (
                  <ProductDescriptionEditor
                    productId={product.id}
                    description={product.description ?? product.shortDescription ?? ""}
                    sourceUrl={product.descriptionSourceUrl}
                  />
                ) : (
                  <>
                    <ProductFeatureList features={content.features} />
                    <ProductBulletList bullets={content.bullets} title="מה עוד יש במוצר" />
                    <ProductProse paragraphs={content.prose} />
                    <ProductSections sections={content.sections} />
                  </>
                )}
              </div>

              <ProductFactCard
                facts={highlightFacts}
                brand={product.brand.name}
                model={product.model}
                warrantyMonths={product.warrantyMonths}
              />
            </div>

            <div className="mt-10 flex max-w-[980px] flex-col gap-9">
              <BrandHighlight brand={product.brand} />

              <BrandAboutSection
                brandId={product.brand.id}
                brandName={product.brand.name}
                aboutContent={product.brand.aboutContent}
                images={product.brand.images}
                isAdmin={isAdminViewer}
              />
            </div>

            {/* Breaks out of the narrow column on purpose — a product
                carousel reads better at full width, same as the "מוצרים
                דומים" rail at the bottom of the page. */}
            {brandProducts.length > 0 && (
              <div className="mt-8">
                <ProductRail
                  title={`עוד מוצרים של ${product.brand.name}`}
                  products={brandProducts}
                  viewAllHref={`/brand/${product.brand.slug}`}
                  favoriteIds={favoriteIds}
                />
              </div>
            )}
          </TabsContent>

          <TabsContent value="specs" className="py-4">
            {/* Visitors get the merged table (attributes + extraSpecsRaw +
                whatever parsed out of the description) plus the dimensions
                block; admins keep the editor, which is the only thing that
                can write those values back. Overview never repeats this —
                it shows the first six of the same rows as highlights and
                stops. */}
            {isAdminViewer ? (
              <ProductSpecsEditor
                productId={product.id}
                attributes={categoryAttributes}
                initialValues={product.attributeValues.map((av) => ({
                id: av.id,
                attributeId: av.attributeId,
                value: av.value,
                // Label/unit are the spec table's own headers, not admin-only
                // data — every visitor needs them to read the table at all
                // (see ProductSpecsEditor's AttributeValue type).
                attribute: { key: av.attribute.key, label: av.attribute.label, unit: av.attribute.unit },
              }))}
                rawSpecs={rawSpecs}
                isAdmin={isAdminViewer}
              // Unlike ProductDescriptionEditor, this component renders for
              // every visitor (isAdmin just switches its internal branch),
              // so its props reach the hydration payload for everyone —
              // only pass the source URL down when there's an admin to see
              // it, same reasoning as galleryImages above.
                specSourceUrl={product.specSourceUrl}
              />
            ) : specRows.length === 0 && dimensionRows.length === 0 ? (
              <p className="text-muted-foreground text-sm">אין עדיין מפרט טכני למוצר זה.</p>
            ) : (
              <div className="flex max-w-[1100px] flex-col gap-8">
                {specRows.length > 0 && (
                  <section>
                    <h3 className="mb-3 text-sm font-bold">מפרט טכני</h3>
                    <ProductSpecTable rows={specRows} />
                  </section>
                )}
                <ProductDimensionsBlock dimensions={dimensionRows} />
              </div>
            )}
          </TabsContent>

          <TabsContent value="delivery" className="flex max-w-2xl flex-col gap-3 py-4">
            <div className="border-border bg-card flex items-start gap-3.5 rounded-xl border p-4 shadow-sm">
              <span className="bg-brand/10 text-brand flex size-10 shrink-0 items-center justify-center rounded-full">
                <Truck className="size-5" />
              </span>
              <div>
                <p className="font-bold">משלוח עד הבית</p>
                <p className="text-muted-foreground mt-0.5 text-sm leading-relaxed">
                  תוך {product.deliveryDays} ימי עסקים בכל הארץ. ניתן גם לאסוף עצמאית מהסניף.
                </p>
              </div>
            </div>
            <div className="border-border bg-card flex items-start gap-3.5 rounded-xl border p-4 shadow-sm">
              <span className="bg-brand/10 text-brand flex size-10 shrink-0 items-center justify-center rounded-full">
                <ShieldCheck className="size-5" />
              </span>
              <div>
                <p className="font-bold">אחריות יבואן רשמי</p>
                <p className="text-muted-foreground mt-0.5 text-sm leading-relaxed">
                  {product.warrantyMonths} חודשים מיום הרכישה, ישירות מול היבואן בישראל.
                </p>
              </div>
            </div>
            <div className="border-border bg-card flex items-start gap-3.5 rounded-xl border p-4 shadow-sm">
              <span className="bg-brand/10 text-brand flex size-10 shrink-0 items-center justify-center rounded-full">
                <PackageCheck className="size-5" />
              </span>
              <div>
                <p className="font-bold">מדיניות החזרות</p>
                <p className="text-muted-foreground mt-0.5 text-sm leading-relaxed">
                  ניתן להחזיר את המוצר באריזתו המקורית בהתאם לתקנון האתר.
                </p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="reviews" className="max-w-2xl py-4">
            {product.reviews.length === 0 ? (
              <p className="text-muted-foreground text-sm">אין עדיין ביקורות למוצר זה.</p>
            ) : (
              <>
                <div className="border-border bg-card mb-6 flex flex-col items-center gap-4 rounded-xl border p-5 shadow-sm sm:flex-row">
                  <div className="shrink-0 text-center">
                    <p className="text-4xl font-black">{product.ratingAvg.toFixed(1)}</p>
                    <div className="mt-1 flex justify-center">
                      {Array.from({ length: 5 }, (_, i) => (
                        <Star
                          key={i}
                          className={`size-4 ${i < Math.round(product.ratingAvg) ? "fill-warning text-warning" : "text-muted-foreground/30"}`}
                        />
                      ))}
                    </div>
                    <p className="text-muted-foreground mt-1 text-xs">{product.ratingCount} ביקורות</p>
                  </div>
                  <div className="flex w-full flex-1 flex-col gap-1.5">
                    {[5, 4, 3, 2, 1].map((star) => {
                      const count = product.reviews.filter((r) => r.rating === star).length;
                      const pct = product.reviews.length > 0 ? Math.round((count / product.reviews.length) * 100) : 0;
                      return (
                        <div key={star} className="flex items-center gap-2 text-xs">
                          <span className="text-muted-foreground w-3 shrink-0 text-end">{star}</span>
                          <Star className="fill-warning text-warning size-3 shrink-0" />
                          <div className="bg-secondary h-2 flex-1 overflow-hidden rounded-full">
                            <div className="bg-warning h-full rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-muted-foreground w-6 shrink-0">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <ul className="flex flex-col gap-4">
                {product.reviews.map((r) => (
                  <li key={r.id} className="border-border border-b pb-4">
                    <div className="flex items-center gap-2">
                      <div className="flex">
                        {Array.from({ length: 5 }, (_, i) => (
                          <Star
                            key={i}
                            className={`size-3.5 ${i < r.rating ? "fill-warning text-warning" : "text-muted-foreground/30"}`}
                          />
                        ))}
                      </div>
                      <span className="text-sm font-medium">{r.authorName}</span>
                      <span className="text-muted-foreground text-xs">{formatDate(r.createdAt)}</span>
                    </div>
                    {r.title && <p className="mt-1.5 text-sm font-medium">{r.title}</p>}
                    {r.body && <p className="text-muted-foreground mt-0.5 text-sm">{r.body}</p>}
                  </li>
                ))}
                </ul>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <ProductRail title="מוצרים דומים" products={related} favoriteIds={favoriteIds} />

      <MobileBuyBar productId={product.id} price={product.price} stockStatus={product.stockStatus as StockStatus} />
    </div>
  );
}
