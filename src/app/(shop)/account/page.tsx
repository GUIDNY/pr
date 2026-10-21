import Link from "next/link";
import { Package, Heart, MapPin, ArrowLeft, Trophy, Gamepad2 } from "lucide-react";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_COLORS,
  type OrderStatus,
} from "@/lib/enums";
import { formatPrice, formatDate } from "@/lib/format";
import { ConsentToggle } from "@/components/account/consent-toggle";
import { purchaseLevel } from "@/lib/game-levels";
import { listMemberCoupons } from "@/lib/member-coupons";
import { mallViewerEmail } from "@/lib/mall-access-server";
import { MallAnchor } from "@/components/layout/mall-link";

export default async function AccountDashboardPage() {
  const session = await getSession();
  if (!session) return null;

  const [
    orderCount,
    favoriteCount,
    addressCount,
    recentOrders,
    account,
    club,
    coupons,
  ] = await Promise.all([
    db.order.count({ where: { userId: session.sub } }),
    db.favorite.count({ where: { userId: session.sub } }),
    db.address.count({ where: { userId: session.sub } }),
    db.order.findMany({
      where: { userId: session.sub },
      orderBy: { createdAt: "desc" },
      take: 3,
    }),
    db.user.findUnique({
      where: { id: session.sub },
      select: { phone: true, whatsappOptIn: true, marketingOptIn: true },
    }),
    purchaseLevel(session.sub),
    listMemberCoupons(session.sub),
  ]);
  const nextTier = club.tiers[club.level] ?? null;
  const showClub = !!(await mallViewerEmail()); // the mall is private for now: lib/mall-access.ts

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">
          שלום, {session.name.split(" ")[0]}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          ברוכים הבאים לאזור האישי שלכם
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Link
          href="/account/orders"
          className="border-border hover:border-brand/40 rounded-xl border p-4 text-center transition-colors"
        >
          <Package className="text-brand mx-auto mb-2 size-6" />
          <p className="text-xl font-bold">{orderCount}</p>
          <p className="text-muted-foreground text-xs">הזמנות</p>
        </Link>
        <Link
          href="/account/favorites"
          className="border-border hover:border-brand/40 rounded-xl border p-4 text-center transition-colors"
        >
          <Heart className="text-brand mx-auto mb-2 size-6" />
          <p className="text-xl font-bold">{favoriteCount}</p>
          <p className="text-muted-foreground text-xs">מועדפים</p>
        </Link>
        <Link
          href="/account/addresses"
          className="border-border hover:border-brand/40 rounded-xl border p-4 text-center transition-colors"
        >
          <MapPin className="text-brand mx-auto mb-2 size-6" />
          <p className="text-xl font-bold">{addressCount}</p>
          <p className="text-muted-foreground text-xs">כתובות</p>
        </Link>
      </div>

      {/* The way into the game, for the accounts that may see it. Nothing
          public on the shop points at the mall while it is private, so the
          personal area is where a management account finds the door; the
          club card below it is the standing, this is the entrance. */}
      {showClub && (
        <MallAnchor
          medium="account-home"
          className="from-brand to-brand-hover text-brand-foreground flex items-center gap-4 rounded-xl bg-gradient-to-l p-4 shadow-sm transition-opacity hover:opacity-95"
        >
          <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-white/20">
            <Gamepad2 className="size-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">כניסה לקניון התלת־ממדי</p>
            <p className="text-xs opacity-90">המשחק פתוח כרגע לצוות ההנהלה בלבד</p>
          </div>
          <ArrowLeft className="size-4 shrink-0" />
        </MallAnchor>
      )}

      {/* The mall's club in one line: the level, the cashback, the coupons waiting. */}
      {showClub && (
        <Link
          href="/account/club"
          className="border-brand/30 bg-brand/5 hover:border-brand/60 flex items-center gap-4 rounded-xl border p-4 transition-colors"
        >
          <div className="bg-brand text-brand-foreground grid size-12 shrink-0 place-items-center rounded-xl">
            <Trophy className="size-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              מועדון הקניון · רמה {club.level}
              {club.cashback ? ` · ${club.cashback}% קאשבק` : ""}
            </p>
            <p className="text-muted-foreground text-xs">
              {coupons.length
                ? `${coupons.length} הטבות מחכות לכם`
                : "אין כרגע הטבות פעילות"}
              {nextTier
                ? ` · עוד ${formatPrice(Math.max(0, nextTier.spend - club.spent))} לרמה ${nextTier.level}`
                : ""}
            </p>
          </div>
          <ArrowLeft className="text-brand size-4 shrink-0" />
        </Link>
      )}

      {/* The one setting a customer comes here to change. Under the counts
          and above the orders, because the orders are what it is about. */}
      <div className="flex flex-col gap-3">
        <ConsentToggle
          kind="whatsapp"
          initial={account?.whatsappOptIn ?? true}
          phone={account?.phone ?? null}
        />
        <ConsentToggle
          kind="marketing"
          initial={account?.marketingOptIn ?? false}
        />
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">הזמנות אחרונות</h2>
          <Link
            href="/account/orders"
            className="text-brand flex items-center gap-1 text-sm hover:underline"
          >
            כל ההזמנות <ArrowLeft className="size-3.5" />
          </Link>
        </div>
        {recentOrders.length === 0 ? (
          <p className="text-muted-foreground border-border rounded-xl border p-6 text-center text-sm">
            עדיין לא ביצעתם הזמנות.
          </p>
        ) : (
          <ul className="divide-border border-border divide-y rounded-xl border">
            {recentOrders.map((order) => (
              <li key={order.id}>
                <Link
                  href={`/account/orders/${order.orderNumber}`}
                  className="hover:bg-muted flex items-center justify-between p-4"
                >
                  <div>
                    <p className="font-medium">{order.orderNumber}</p>
                    <p className="text-muted-foreground text-xs">
                      {formatDate(order.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${ORDER_STATUS_COLORS[order.status as OrderStatus]}`}
                    >
                      {ORDER_STATUS_LABELS[order.status as OrderStatus]}
                    </span>
                    <span className="font-semibold tabular-nums">
                      {formatPrice(order.total)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
