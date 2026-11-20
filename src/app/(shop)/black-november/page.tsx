import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { BlackNovember } from "@/components/home/black-november";
import { getBlackNovemberProducts } from "@/lib/queries/products";

// The campaign's own page: every marked product, where the homepage shows a
// row of them. Not offered to search engines — it exists for a few weeks and
// lists nothing that the product pages do not already say.
export const metadata: Metadata = {
  title: "בלאק נובמבר",
  robots: { index: false, follow: true },
};

// Same reasoning as the homepage: the list moves with the price-list sync,
// twice a day, and nothing here differs between visitors.
export const revalidate = 300;

export default async function BlackNovemberPage() {
  const products = await getBlackNovemberProducts(200);

  if (products.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">בלאק נובמבר</h1>
        <p className="text-muted-foreground mt-2 text-sm">אין כרגע מוצרים במחיר בלאק נובמבר.</p>
        <Button variant="brand" asChild className="mt-6">
          <Link href="/">לדף הבית</Link>
        </Button>
      </div>
    );
  }

  return <BlackNovember products={products} layout="grid" heading="h1" />;
}
