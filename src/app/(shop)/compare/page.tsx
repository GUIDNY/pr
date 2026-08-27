"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Scale, X, Check, Minus } from "lucide-react";
import { useCompareStore } from "@/stores/compare-store";
import { getProductsForCompareAction } from "@/actions/products";
import { ProductImagePlaceholder } from "@/components/product/product-image-placeholder";
import { PriceBlock } from "@/components/product/price-block";
import { StockBadge } from "@/components/product/stock-badge";
import { AddToCartButton } from "@/components/product/add-to-cart-button";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/format";

type CompareProduct = Awaited<ReturnType<typeof getProductsForCompareAction>>[number];

export default function ComparePage() {
  const productIds = useCompareStore((s) => s.productIds);
  const remove = useCompareStore((s) => s.remove);
  const [products, setProducts] = useState<CompareProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getProductsForCompareAction(productIds).then((rows) => {
      setProducts(rows);
      setLoading(false);
    });
  }, [productIds]);

  const attrKeys = Array.from(
    new Map(
      products.flatMap((p) => p.attributeValues.map((av) => [av.attribute.key, av.attribute] as const))
    ).values()
  );

  if (!loading && products.length === 0) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 px-4 py-24 text-center">
        <Scale className="text-muted-foreground/40 size-16" strokeWidth={1} />
        <h1 className="text-xl font-bold">אין מוצרים להשוואה</h1>
        <p className="text-muted-foreground text-sm">הוסיפו מוצרים להשוואה מדפי המוצרים כדי לראות אותם כאן.</p>
        <Button variant="brand" asChild className="mt-2">
          <Link href="/">חזרה לחנות</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">השוואת מוצרים</h1>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="w-40"></th>
              {products.map((p) => (
                <th key={p.id} className="border-border bg-card min-w-56 border p-4 text-start align-top">
                  <button
                    onClick={() => remove(p.id)}
                    aria-label="הסר מהשוואה"
                    className="text-muted-foreground hover:text-destructive float-left"
                  >
                    <X className="size-4" />
                  </button>
                  <Link href={`/product/${p.slug}`} className="bg-muted relative mb-2 block aspect-square size-24 overflow-hidden rounded-lg">
                    {p.images[0] ? (
                      <Image src={p.images[0].url} alt={p.title} fill className="object-cover" sizes="96px" />
                    ) : (
                      <ProductImagePlaceholder title={p.title} icon={p.category.parent?.icon ?? p.category.icon} />
                    )}
                  </Link>
                  <Link href={`/product/${p.slug}`} className="line-clamp-2 text-sm font-semibold hover:underline">
                    {p.title}
                  </Link>
                  <p className="text-muted-foreground mt-0.5 text-xs">{p.brand.name}</p>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="text-muted-foreground p-3 text-sm font-medium">מחיר</td>
              {products.map((p) => {
                const min = Math.min(...products.map((x) => x.price));
                return (
                  <td key={p.id} className="border-border border p-3">
                    <PriceBlock price={p.price} compareAtPrice={p.compareAtPrice} size="sm" />
                    {p.price === min && products.length > 1 && (
                      <span className="text-success mt-1 flex items-center gap-1 text-xs font-medium">
                        <Check className="size-3.5" /> המחיר הנמוך ביותר
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
            <tr>
              <td className="text-muted-foreground p-3 text-sm font-medium">זמינות</td>
              {products.map((p) => (
                <td key={p.id} className="border-border border p-3">
                  <StockBadge status={p.stockStatus as never} />
                </td>
              ))}
            </tr>
            <tr>
              <td className="text-muted-foreground p-3 text-sm font-medium">אחריות</td>
              {products.map((p) => (
                <td key={p.id} className="border-border border p-3 text-sm">
                  {p.warrantyMonths} חודשים
                </td>
              ))}
            </tr>
            <tr>
              <td className="text-muted-foreground p-3 text-sm font-medium">זמן אספקה</td>
              {products.map((p) => (
                <td key={p.id} className="border-border border p-3 text-sm">
                  עד {p.deliveryDays} ימים
                </td>
              ))}
            </tr>
            {attrKeys.map((attr) => (
              <tr key={attr.key}>
                <td className="text-muted-foreground p-3 text-sm font-medium">
                  {attr.label} {attr.unit && `(${attr.unit})`}
                </td>
                {products.map((p) => {
                  const value = p.attributeValues.find((av) => av.attribute.key === attr.key)?.value;
                  return (
                    <td key={p.id} className="border-border border p-3 text-sm">
                      {value ?? <Minus className="text-muted-foreground/40 size-4" />}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <td></td>
              {products.map((p) => (
                <td key={p.id} className="border-border border p-3">
                  <AddToCartButton
                    productId={p.id}
                    disabled={p.stockStatus === "OUT_OF_STOCK" || p.stockStatus === "DISPLAY_ONLY"}
                    className="w-full"
                    openDrawerOnAdd
                  />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      {products.length > 0 && (
        <p className="text-muted-foreground mt-4 text-xs">
          מחירים החל מ-{formatPrice(Math.min(...products.map((p) => p.price)))}
        </p>
      )}
    </div>
  );
}
