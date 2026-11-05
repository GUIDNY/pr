import { redirect } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { getSession } from "@/lib/auth";
import { backOfficeHome, isBackOffice } from "@/lib/permissions";
import { mallHref } from "@/lib/mall";
import {
  SINGLES_DAY_ITEMS,
  SINGLES_DAY_SOCIAL_PLAN,
  canSeeSinglesDay,
  singlesDayIsOver,
} from "@/lib/campaigns/singles-day-2026";

export const metadata = { title: "יום הרווקים 11.11 | Buy Today Admin" };
export const dynamic = "force-dynamic";

/* The clock, read once per request outside render. */
async function requestTime(): Promise<number> {
  return Date.now();
}

const ils = (n: number) => `${n.toLocaleString("he-IL")} ₪`;

/**
 * Singles' Day in the back office: the list of deals, a link to the live
 * page, a link to the mall, the social plan. Nothing else.
 *
 * The owner asked for exactly that on 5 November: "פשוט רשימת מוצרים
 * שבמבצע ואז קישור לדף של יום הרווקים הפעיל, קישור לקניון ותכנון סושיאל
 * וזהו", with no headings and no other words. The earlier version had
 * a hero, stats, margin and live-catalogue checks, and he took them off.
 * Sellers and catalog roles see the same page. It shows no cost, so the
 * page needs no per-role split.
 *
 * From 12.11 at midnight it is gone for everyone: the address sends a
 * person to their own back-office home, and the nav drops the entry.
 */
export default async function SinglesDayPage() {
  const session = await getSession();
  if (!session || !isBackOffice(session.role)) redirect("/admin/login");
  if (!canSeeSinglesDay(session.role) || singlesDayIsOver(await requestTime())) redirect(backOfficeHome(session.role));

  const plan = SINGLES_DAY_SOCIAL_PLAN;

  return (
    <div className="max-w-3xl space-y-6">
      <ol className="divide-y overflow-hidden rounded-2xl border bg-card text-sm">
        {SINGLES_DAY_ITEMS.map((item) => (
          <li key={item.sku} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-2.5">
            <span className="font-medium">{item.label}</span>
            <span className="flex items-baseline gap-2 whitespace-nowrap">
              <span className="text-muted-foreground text-xs line-through">{ils(item.plannedPrice)}</span>
              <span className="font-bold">{ils(item.salePrice)}</span>
              <span className="text-xs font-semibold text-red-600 dark:text-rose-400">{item.discountPct}%-</span>
            </span>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap gap-3">
        <a
          href="/singles-day"
          target="_blank"
          className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white shadow hover:bg-red-700"
        >
          <ExternalLink className="size-4" />
          דף יום הרווקים
        </a>
        <a
          href={mallHref("admin-singles-day", false)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-xl border px-4 py-2.5 text-sm font-bold hover:bg-muted"
        >
          <ExternalLink className="size-4" />
          הקניון
        </a>
      </div>

      <p className="rounded-2xl border bg-card px-4 py-3 text-sm font-medium">
        {plan.headline} {plan.creative} · {ils(plan.budgetIls)} ל{plan.days === 2 ? "יומיים" : `-${plan.days} ימים`}
      </p>
    </div>
  );
}
