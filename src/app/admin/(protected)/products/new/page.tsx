import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ProductForm } from "@/components/admin/product-form";
import { getFormOptions } from "@/lib/queries/admin-products";
import type { ProductInput } from "@/lib/product-schema";

export const metadata = { title: "מוצר חדש | PREC Admin" };

const EMPTY: ProductInput = {
  title: "",
  slug: "",
  sku: "",
  model: "",
  brandId: "",
  categoryId: "",
  supplierId: undefined,
  price: 0,
  compareAtPrice: null,
  stockStatus: "IN_STOCK",
  stockQty: 0,
  warrantyMonths: 12,
  deliveryDays: 5,
  shortDescription: "",
  description: "",
  isPublished: false,
  isFeatured: false,
  isBestSeller: false,
};

export default async function NewProductPage() {
  const options = await getFormOptions();

  return (
    <div>
      <Link href="/admin/products" className="text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1 text-sm">
        <ArrowRight className="size-4 rtl:rotate-180" /> חזרה למוצרים
      </Link>
      <h1 className="mb-6 text-2xl font-bold">מוצר חדש</h1>
      <ProductForm mode="create" initial={EMPTY} options={options} />
    </div>
  );
}
