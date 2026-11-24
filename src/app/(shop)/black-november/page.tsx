import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { BlackNovember } from "@/components/home/black-november";
import { BlackNovemberUntil } from "@/components/campaigns/black-november-until";
import { getBlackNovemberProducts } from "@/lib/queries/products";
import { BLACK_NOVEMBER_UNTIL } from "@/lib/campaigns/black-november";

// The campaign's own page: every marked product, where the homepage shows a
// row of them. Offered to search engines since 24 November (owner): it is the
// page a "black november" search should land on, and it says the dates and
// links the terms. It stays out of the index only while it is empty — a page
// with the "no products" message is nothing to rank, and that is also what it
// becomes when the sheet no longer marks any row after the campaign.
export async function generateMetadata(): Promise<Metadata> {
  const live = (await getBlackNovemberProducts(1)).length > 0;
  return {
    title: { absolute: `בלאק נובמבר ב-Buy Today | מוצרי חשמל שהוזלו ${BLACK_NOVEMBER_UNTIL}` },
    description: `מוצרי חשמל במחיר בלאק נובמבר ב-Buy Today. המבצע ${BLACK_NOVEMBER_UNTIL}, עד גמר המלאי ובכפוף לתקנון. משלוח עד הבית.`,
    alternates: { canonical: "/black-november" },
    robots: live ? { index: true, follow: true } : { index: false, follow: true },
  };
}

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

  return (
    <>
      <BlackNovember products={products} layout="grid" heading="h1" />
      <p className="text-muted-foreground mx-auto max-w-7xl px-4 pb-8 text-xs">
        <BlackNovemberUntil />
      </p>
    </>
  );
}
