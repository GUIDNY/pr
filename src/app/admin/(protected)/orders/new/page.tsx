import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { requireBackOffice } from "@/lib/auth";
import { ManualOrderForm } from "@/components/admin/manual-order-form";

export const metadata = { title: "הזמנה ידנית | Buy Today Admin" };

/**
 * A sale that happened on the phone, typed in.
 *
 * Open to everyone the back office is open to, salespeople included — they
 * are the ones taking the calls, and an order they cannot record is an
 * order the shop does not have. Everything a mistake here could cost is
 * reversible: the order can be edited, cancelled or binned, no stock moves
 * and no message reaches the customer.
 */
export default async function NewManualOrderPage() {
  await requireBackOffice();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link
          href="/admin/orders"
          className="text-muted-foreground hover:text-foreground mb-2 flex w-fit items-center gap-1 text-sm font-semibold"
        >
          <ArrowRight className="size-4" /> חזרה להזמנות
        </Link>
        <h1 className="text-2xl font-bold">הזמנה ידנית</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          להזמנה שנסגרה בטלפון או בוואטסאפ. המלאי לא משתנה, והלקוח לא מקבל הודעה.
        </p>
      </div>

      <ManualOrderForm />
    </div>
  );
}
