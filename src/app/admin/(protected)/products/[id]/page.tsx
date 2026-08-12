import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ProductForm } from "@/components/admin/product-form";
import { ProductActions } from "@/components/admin/product-actions";
import { getAdminProductById, getFormOptions } from "@/lib/queries/admin-products";
import type { ProductInput } from "@/lib/product-schema";
import type { StockStatus } from "@/lib/enums";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product, options] = await Promise.all([getAdminProductById(id), getFormOptions()]);
  if (!product) notFound();

  const initial: ProductInput = {
    title: product.title,
    slug: product.slug,
    sku: product.sku,
    model: product.model ?? "",
    brandId: product.brandId,
    categoryId: product.categoryId,
    supplierId: product.supplierId ?? undefined,
    price: product.price,
    compareAtPrice: product.compareAtPrice,
    stockStatus: product.stockStatus as StockStatus,
    stockQty: product.stockQty,
    warrantyMonths: product.warrantyMonths,
    deliveryDays: product.deliveryDays,
    shortDescription: product.shortDescription ?? "",
    description: product.description ?? "",
    isPublished: product.isPublished,
    isFeatured: product.isFeatured,
    isBestSeller: product.isBestSeller,
  };

  return (
    <div>
      <Link href="/admin/products" className="text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1 text-sm">
        <ArrowRight className="size-4 rtl:rotate-180" /> חזרה למוצרים
      </Link>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{product.title}</h1>
        <ProductActions productId={product.id} slug={product.slug} isPublished={product.isPublished} />
      </div>
      <ProductForm mode="edit" productId={product.id} initial={initial} options={options} />
    </div>
  );
}
