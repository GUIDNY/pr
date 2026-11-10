import { requireCatalogPage } from "@/lib/auth";
import Link from "next/link";
import { Phone, MessageCircle } from "lucide-react";
import { getAbandonedCarts, getAnonymousCarts, DEFAULT_MIN_VALUE } from "@/lib/queries/abandoned-carts";
import { attributionFromJson, describeTouch } from "@/lib/attribution";
import { AbandonedCartActions } from "@/components/admin/abandoned-cart-actions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  CART_FOLLOW_UP_STATUSES,
  CART_FOLLOW_UP_STATUS_LABELS,
  CART_FOLLOW_UP_STATUS_COLORS,
  type CartFollowUpStatus,
} from "@/lib/enums";
import { formatPrice, formatDateTime } from "@/lib/format";

export const metadata = { title: "עגלות נטושות | Buy Today Admin" };

const TABS: { value: CartFollowUpStatus | "ALL" | "ANON"; label: string }[] = [
  ...CART_FOLLOW_UP_STATUSES.map((s) => ({ value: s, label: CART_FOLLOW_UP_STATUS_LABELS[s] })),
  { value: "ALL", label: "הכל" },
  /* Not a follow-up state: the carts with nobody to call. See
     getAnonymousCarts. */
  { value: "ANON", label: "בלי פרטים" },
];

/** 972 + drop the leading 0, which is the only form wa.me accepts. */
function whatsappHref(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const international = digits.startsWith("972") ? digits : `972${digits.replace(/^0/, "")}`;
  return `https://wa.me/${international}`;
}

export default async function AbandonedCartsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireCatalogPage();
  const sp = await searchParams;
  const tab = TABS.find((t) => t.value === sp.status)?.value ?? "NEW";
  if (tab === "ANON") return <AnonymousCarts />;
  const status = tab as CartFollowUpStatus | "ALL";
  const { carts, totalValue } = await getAbandonedCarts({ status });

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-bold">עגלות נטושות</h1>
        <span className="text-muted-foreground text-sm">
          {carts.length} עגלות · {formatPrice(totalValue)}
        </span>
      </div>
      <p className="text-muted-foreground mb-4 text-sm">
        לקוחות שמילאו פרטים בקופה ולא השלימו את ההזמנה, ממוינים לפי שווי העגלה. מוצגות עגלות מעל{" "}
        {formatPrice(DEFAULT_MIN_VALUE)} שלא נגעו בהן בחצי השעה האחרונה.
      </p>

      <Tabs current={status} />

      {carts.length === 0 ? (
        <div className="border-border text-muted-foreground rounded-xl border border-dashed p-10 text-center text-sm">
          אין עגלות נטושות בקטגוריה הזו כרגע.
        </div>
      ) : (
        <div className="border-border bg-card overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>מתי</TableHead>
                <TableHead>לקוח</TableHead>
                <TableHead>טלפון</TableHead>
                <TableHead>מה בעגלה</TableHead>
                <TableHead>שווי</TableHead>
                <TableHead>סטטוס</TableHead>
                <TableHead>פעולות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {carts.map((cart) => {
                const followUpStatus = cart.followUpStatus as CartFollowUpStatus;
                return (
                  <TableRow key={cart.id}>
                    <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                      {cart.contactAt ? formatDateTime(cart.contactAt) : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{cart.contactName || cart.user?.name || "—"}</div>
                      {(cart.contactEmail || cart.user?.email) && (
                        <div className="text-muted-foreground text-xs">{cart.contactEmail || cart.user?.email}</div>
                      )}
                      {cart.user && <div className="text-muted-foreground text-xs">לקוח רשום</div>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {cart.contactPhone ? (
                        <div className="flex items-center gap-1.5">
                          <a
                            href={`tel:${cart.contactPhone}`}
                            className="text-brand flex items-center gap-1 font-medium hover:underline"
                          >
                            <Phone className="size-3.5" />
                            {cart.contactPhone}
                          </a>
                          <a
                            href={whatsappHref(cart.contactPhone)}
                            target="_blank"
                            rel="noreferrer noopener"
                            aria-label="פתיחת וואטסאפ"
                            className="text-success hover:bg-success/10 rounded-md p-1"
                          >
                            <MessageCircle className="size-4" />
                          </a>
                        </div>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <ul className="flex flex-col gap-0.5 text-xs">
                        {cart.items.map((item) => (
                          <li key={item.id} className="truncate">
                            <Link href={`/product/${item.product.slug}`} className="hover:underline" target="_blank">
                              {item.product.title}
                            </Link>
                            {item.quantity > 1 && <span className="text-muted-foreground"> × {item.quantity}</span>}
                          </li>
                        ))}
                      </ul>
                    </TableCell>
                    <TableCell className="font-semibold tabular-nums whitespace-nowrap">
                      {formatPrice(cart.value)}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${CART_FOLLOW_UP_STATUS_COLORS[followUpStatus]}`}
                      >
                        {CART_FOLLOW_UP_STATUS_LABELS[followUpStatus]}
                      </span>
                      {cart.followUpBy && (
                        <div className="text-muted-foreground mt-0.5 text-xs">{cart.followUpBy.name}</div>
                      )}
                      {cart.followUpNote && (
                        <div className="text-warning-foreground mt-1 max-w-[14rem] text-xs leading-snug">{cart.followUpNote}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <AbandonedCartActions cartId={cart.id} status={followUpStatus} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function Tabs({ current }: { current: string }) {
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {TABS.map((tab) => (
        <Link
          key={tab.value}
          href={`/admin/abandoned?status=${tab.value}`}
          className={
            current === tab.value
              ? "bg-primary text-primary-foreground rounded-full px-3 py-1.5 text-sm font-medium"
              : "border-border hover:bg-muted rounded-full border px-3 py-1.5 text-sm"
          }
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}

/** Carts with items and no phone — nobody to call, but a picture of what is
    walked away from, how much, and from which channel. */
async function AnonymousCarts() {
  const { carts, totalValue } = await getAnonymousCarts();
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-bold">עגלות נטושות</h1>
        <span className="text-muted-foreground text-sm">
          {carts.length} עגלות · {formatPrice(totalValue)}
        </span>
      </div>
      <p className="text-muted-foreground mb-4 text-sm">
        עגלות מעל {formatPrice(DEFAULT_MIN_VALUE)} שאין בהן טלפון — אין למי להתקשר, אבל רואים מה נוטשים, כמה כסף ומאיזה
        ערוץ. &quot;מסלול&quot; הוא העמודים שהגולש ראה באותו ביקור.
      </p>
      <Tabs current="ANON" />
      {carts.length === 0 ? (
        <div className="border-border text-muted-foreground rounded-xl border border-dashed p-10 text-center text-sm">
          אין עגלות כאלה כרגע.
        </div>
      ) : (
        <div className="border-border bg-card overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>מתי</TableHead>
                <TableHead>מה בעגלה</TableHead>
                <TableHead>שווי</TableHead>
                <TableHead>מקור</TableHead>
                <TableHead>ביקור</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {carts.map((cart) => {
                const attribution = attributionFromJson(cart.attribution);
                const touch = attribution?.first;
                const last = attribution?.last;
                return (
                  <TableRow key={cart.id}>
                    <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                      {formatDateTime(cart.updatedAt)}
                      {cart.userId && <div>לקוח רשום</div>}
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <ul className="flex flex-col gap-0.5 text-xs">
                        {cart.items.map((item) => (
                          <li key={item.id} className="truncate">
                            <Link href={`/product/${item.product.slug}`} className="hover:underline" target="_blank">
                              {item.product.title}
                            </Link>
                            {item.quantity > 1 && <span className="text-muted-foreground"> × {item.quantity}</span>}
                          </li>
                        ))}
                      </ul>
                    </TableCell>
                    <TableCell className="font-semibold tabular-nums whitespace-nowrap">{formatPrice(cart.value)}</TableCell>
                    <TableCell className="max-w-[16rem] text-xs">
                      {touch ? (
                        <>
                          <div className="font-medium">{describeTouch(touch)}</div>
                          {last && describeTouch(last) !== describeTouch(touch) && (
                            <div className="text-muted-foreground">אחרון: {describeTouch(last)}</div>
                          )}
                          {cart.gclid && <div className="text-muted-foreground">קליק ממומן (gclid)</div>}
                          {touch.landing && (
                            <div className="text-muted-foreground truncate" dir="ltr" title={touch.landing}>
                              {touch.landing}
                            </div>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="max-w-[18rem] text-xs">
                      {cart.visitSid ? (
                        <>
                          <div className="text-muted-foreground font-mono text-[10px]" dir="ltr">
                            {cart.visitSid}
                          </div>
                          {cart.pages.length > 0 && (
                            <details className="mt-0.5">
                              <summary className="cursor-pointer">מסלול · {cart.pages.length} עמודים</summary>
                              <ol className="mt-1 list-decimal ps-4" dir="ltr">
                                {cart.pages.slice(0, 30).map((p, i) => (
                                  <li key={i} className="truncate">{p}</li>
                                ))}
                              </ol>
                            </details>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
