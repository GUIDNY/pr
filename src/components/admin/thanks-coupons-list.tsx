import Link from "next/link";
import { getThanksCoupons } from "@/lib/queries/thanks-coupons";
import { formatDateTime } from "@/lib/format";

/** Coupons the owner made as a thank-you, for the coupons screen. */
export async function ThanksCouponsList() {
  const rows = await getThanksCoupons();
  return (
    <section className="border-border bg-card mt-8 rounded-xl border p-4">
      <h2 className="mb-1 font-semibold">קופוני תודה ({rows.length})</h2>
      <p className="text-muted-foreground mb-3 text-xs">5%, שימוש אחד, נוצרים רק בלחיצה בעמוד הזמנה שנשלחה.</p>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">עדיין לא נוצרו.</p>
      ) : (
        <ul className="divide-border divide-y text-sm">
          {rows.map((r) => (
            <li key={r.code} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
              <span className="font-mono font-semibold" dir="ltr">{r.code}</span>
              <span>
                {r.orderNumber ? (
                  <Link href={`/admin/orders/${r.orderNumber}`} className="text-brand hover:underline">{r.orderNumber}</Link>
                ) : "—"}{" "}
                · {r.customer}
              </span>
              <span className="text-muted-foreground text-xs">נוצר {formatDateTime(r.createdAt)}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  r.used ? "bg-green-100 text-green-900" : r.expired ? "bg-muted text-muted-foreground" : "bg-yellow-100 text-yellow-900"
                }`}
              >
                {r.used ? "נוצל" : r.expired ? "פג תוקף" : "לא נוצל"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
