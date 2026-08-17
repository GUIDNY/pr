import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { Star, Truck, ShieldCheck, CreditCard, PackageCheck } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProductImagePlaceholder } from "@/components/product/product-image-placeholder";
import { PriceBlock } from "@/components/product/price-block";
import { StockBadge } from "@/components/product/stock-badge";
import { FavoriteButton } from "@/components/product/favorite-button";
import { CompareButton } from "@/components/product/compare-button";
import { PurchasePanel } from "@/components/product/purchase-panel";
import { MobileBuyBar } from "@/components/product/mobile-buy-bar";
import { ConsultSection } from "@/components/product/consult-section";
import { ProductRail } from "@/components/home/product-rail";
import { getProductBySlug, getRelatedProducts } from "@/lib/queries/products";
import { getFavoriteProductIdsAction } from "@/actions/favorites";
import { formatDate } from "@/lib/format";
import type { StockStatus } from "@/lib/enums";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return {};
  return {
    title: product.title,
    description: product.shortDescription ?? product.description ?? undefined,
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product || !product.isPublished || product.stockQty <= 0) notFound();

  const [related, favoriteIds] = await Promise.all([
    getRelatedProducts(product.categoryId, product.id, 4),
    getFavoriteProductIdsAction(),
  ]);

  const categoryIcon = product.category.parent?.icon ?? product.category.icon;
  const maxQuantity = Math.max(1, Math.min(product.stockQty, 10));

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 pb-24 lg:pb-6">
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

      <div className="mt-5 grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* gallery */}
        <div className="relative">
          <div className="bg-muted sticky top-24 aspect-square overflow-hidden rounded-2xl">
            <ProductImagePlaceholder title={product.title} brand={product.brand.name} icon={categoryIcon} />
            <FavoriteButton
              productId={product.id}
              initialFavorite={favoriteIds.includes(product.id)}
              className="absolute top-4 end-4"
            />
          </div>
        </div>

        {/* purchase column */}
        <div className="flex flex-col gap-4">
          <div>
            <Link href={`/brand/${product.brand.slug}`} className="text-brand text-sm font-semibold hover:underline">
              {product.brand.name}
            </Link>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">{product.title}</h1>
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

          <PriceBlock
            price={product.price}
            compareAtPrice={product.compareAtPrice}
            installmentMonths={product.installmentMonths}
            size="lg"
          />

          <div className="flex items-center gap-4">
            <StockBadge status={product.stockStatus as StockStatus} />
            <span className="text-muted-foreground flex items-center gap-1 text-sm">
              <Truck className="size-4" /> משלוח תוך {product.deliveryDays} ימים
            </span>
          </div>

          <PurchasePanel productId={product.id} stockStatus={product.stockStatus as StockStatus} maxQuantity={maxQuantity} />

          <CompareButton productId={product.id} className="w-fit" />

          <div className="border-border grid grid-cols-1 gap-3 rounded-xl border p-4 sm:grid-cols-3">
            <div className="flex items-center gap-2 text-sm">
              <ShieldCheck className="text-brand size-5 shrink-0" />
              אחריות {product.warrantyMonths} חודשים
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Truck className="text-brand size-5 shrink-0" />
              משלוח עד הבית
            </div>
            <div className="flex items-center gap-2 text-sm">
              <CreditCard className="text-brand size-5 shrink-0" />
              תשלום מאובטח
            </div>
          </div>

          <ConsultSection productTitle={product.title} />
        </div>
      </div>

      {/* info tabs */}
      <div className="mt-10">
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">סקירה כללית</TabsTrigger>
            <TabsTrigger value="specs">מפרט טכני</TabsTrigger>
            <TabsTrigger value="delivery">משלוח ואחריות</TabsTrigger>
            <TabsTrigger value="reviews">ביקורות ({product.reviews.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="max-w-3xl py-4 text-sm leading-relaxed">
            {product.description ?? product.shortDescription}
          </TabsContent>

          <TabsContent value="specs" className="py-4">
            {product.attributeValues.length === 0 ? (
              <p className="text-muted-foreground text-sm">אין מפרט טכני זמין למוצר זה.</p>
            ) : (
              <dl className="grid max-w-2xl grid-cols-1 gap-x-8 sm:grid-cols-2">
                {product.attributeValues.map((av) => (
                  <div key={av.id} className="border-border flex justify-between border-b py-2.5 text-sm">
                    <dt className="text-muted-foreground">
                      {av.attribute.label} {av.attribute.unit && `(${av.attribute.unit})`}
                    </dt>
                    <dd className="font-medium">{av.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </TabsContent>

          <TabsContent value="delivery" className="max-w-2xl space-y-3 py-4 text-sm leading-relaxed">
            <div className="flex items-start gap-3">
              <Truck className="text-brand mt-0.5 size-5 shrink-0" />
              <p>משלוח עד הבית תוך {product.deliveryDays} ימי עסקים בכל הארץ. ניתן גם לאסוף עצמאית מהסניף.</p>
            </div>
            <div className="flex items-start gap-3">
              <ShieldCheck className="text-brand mt-0.5 size-5 shrink-0" />
              <p>אחריות יבואן רשמי למשך {product.warrantyMonths} חודשים מיום הרכישה.</p>
            </div>
            <div className="flex items-start gap-3">
              <PackageCheck className="text-brand mt-0.5 size-5 shrink-0" />
              <p>ניתן להחזיר את המוצר באריזתו המקורית בהתאם לתקנון האתר.</p>
            </div>
          </TabsContent>

          <TabsContent value="reviews" className="max-w-2xl py-4">
            {product.reviews.length === 0 ? (
              <p className="text-muted-foreground text-sm">אין עדיין ביקורות למוצר זה.</p>
            ) : (
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
            )}
          </TabsContent>
        </Tabs>
      </div>

      <ProductRail title="מוצרים דומים" products={related} favoriteIds={favoriteIds} />

      <MobileBuyBar productId={product.id} price={product.price} stockStatus={product.stockStatus as StockStatus} />
    </div>
  );
}
