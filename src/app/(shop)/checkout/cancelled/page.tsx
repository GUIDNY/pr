import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = { title: "התשלום בוטל" };

/**
 * Where Pelecard sends a customer who backed out of the payment page.
 *
 * Nothing is written here. The order stays as it is — awaiting payment, not
 * failed — and the cart was never emptied, so picking up where they left off
 * is one click.
 */
export default async function CheckoutCancelledPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order: orderNumber } = await searchParams;

  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <div className="flex flex-col items-center gap-3 text-center">
        <ShoppingCart className="text-muted-foreground size-14" strokeWidth={1.5} />
        <h1 className="text-2xl font-bold">התשלום בוטל</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          לא בוצע חיוב. העגלה שלכם נשמרה בדיוק כפי שהייתה, ואפשר להמשיך מאותה נקודה.
        </p>
        {orderNumber && (
          <p className="text-muted-foreground text-sm">
            מספר הזמנה <span className="text-foreground font-semibold">{orderNumber}</span> — ממתינה לתשלום.
          </p>
        )}
      </div>

      <div className="mt-8 flex flex-col gap-2 sm:flex-row">
        <Button variant="brand" asChild className="flex-1">
          <Link href="/cart">חזרה לעגלה</Link>
        </Button>
        <Button variant="outline" asChild className="flex-1">
          <Link href="/">המשך בקניות</Link>
        </Button>
      </div>
    </div>
  );
}
