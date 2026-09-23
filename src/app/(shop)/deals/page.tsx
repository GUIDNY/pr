import Link from "next/link";
import { Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductCard } from "@/components/product/product-card";
import { getDeals, getCatalogSize } from "@/lib/queries/products";

export const metadata = { title: "מבצעים" };

export default async function DealsPage() {
  const products = await getDeals(48);
  /* Only when there is nothing to show — the empty state names the size of
     the catalogue, and a number typed into the copy would be wrong by the
     next sync. Counted rather than guessed, and not counted at all on the
     normal path. */
  const catalog = products.length === 0 ? await getCatalogSize() : null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <span className="bg-brand text-brand-foreground flex size-11 items-center justify-center rounded-full">
          <Tag className="size-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold">מבצעים</h1>
          <p className="text-muted-foreground text-sm">{products.length} מוצרים במבצע</p>
        </div>
      </div>

      {products.length === 0 ? (
        /* "אין כרגע מוצרים במבצע." on its own was a full stop. This page is
           linked from the header's מבצעים, from the mobile menu and from
           whatever banner an admin points here, so an empty sale is a
           regular destination rather than an edge case — and every one of
           those arrivals was a dead end with nowhere to go but Back.

           Fixed here rather than by hiding each link, which would have
           meant counting live deals on every page render to decide whether
           to show a header link, and would still leave a banner pointing
           at it. One destination that knows what to do when it is empty
           covers every way in, including the ones not written yet. */
        <div className="border-border flex flex-col items-center gap-4 rounded-2xl border border-dashed px-6 py-16 text-center">
          <p className="font-medium">אין כרגע מוצרים במבצע</p>
          <p className="text-muted-foreground max-w-md text-sm">
            אנחנו מעדכנים מבצעים לעיתים קרובות. בינתיים אפשר לעבור על הקטלוג —{" "}
            {catalog ? `${catalog.products.toLocaleString("he-IL")} מוצרים במלאי` : "כל המוצרים שבמלאי"},
            {" "}עם המחיר כתוב ובלי צורך להתקשר.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="brand" asChild>
              <Link href="/#products">לכל המוצרים</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/finder">עזרה בבחירה</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}
