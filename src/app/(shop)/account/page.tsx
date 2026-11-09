import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { purchaseLevel } from "@/lib/game-levels";
import { listMemberCoupons } from "@/lib/member-coupons";
import { owedReferralFor, referralCodeFor, referralProgress } from "@/lib/referral";
import { SITE_URL } from "@/lib/site-url";
import { AccountOverview } from "@/components/account/account-overview";
import { mallViewerEmail } from "@/lib/mall-access-server";

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
      select: { phone: true, whatsappOptIn: true, marketingOptIn: true, createdAt: true },
    }),
    purchaseLevel(session.sub),
    listMemberCoupons(session.sub),
  ]);
  const [referralCode, referral, owedFriend] = await Promise.all([
    referralCodeFor(session.sub),
    referralProgress(session.sub),
    owedReferralFor(session.sub),
  ]);
  const nextTier = club.tiers[club.level] ?? null;
  const showClub = !!(await mallViewerEmail()); // the mall is private for now: lib/mall-access.ts

  return (
    <AccountOverview
      firstName={session.name.split(" ")[0]}
      since={account?.createdAt ?? null}
      counts={{ orders: orderCount, favorites: favoriteCount, addresses: addressCount }}
      owedFriend={owedFriend}
      coupons={coupons}
      referral={{ link: `${SITE_URL}/r/${referralCode}`, friends: referral.friends, nextReward: referral.nextReward }}
      club={showClub ? { level: club.level, cashback: club.cashback, toNext: nextTier ? { spend: Math.max(0, nextTier.spend - club.spent), level: nextTier.level } : null } : null}
      recentOrders={recentOrders.map((o) => ({ id: o.id, orderNumber: o.orderNumber, createdAt: o.createdAt, status: o.status, total: o.total }))}
      consent={{ whatsapp: account?.whatsappOptIn ?? true, marketing: account?.marketingOptIn ?? false, phone: account?.phone ?? null }}
    />
  );
}
