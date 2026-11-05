import Image from "next/image";
import { redirect } from "next/navigation";
import {
  ArrowUpLeft,
  Gift,
  Megaphone,
  Sparkles,
  Store,
  Video,
  Wallet,
} from "lucide-react";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
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
 * Singles' Day in the back office: three blocks and nothing else.
 * "המוצרים שבמבצע" holds the deals, with a photograph each. "דוגמאות" holds
 * the live page and the mall. "התוכנית הממומנת" holds the social plan.
 *
 * The owner set the content on 5 November: the list, the two links and the
 * plan. He then asked for it to look like something he can show. The
 * earlier version had a hero, stats, margins and live-catalogue checks, and
 * he took them off. He then asked for each product's cost and its profit at
 * the sale price, and for the sellers to see them too. That exception is
 * deliberate and covers this page only.
 *
 * From 12.11 at midnight it is gone for everyone: the address sends a
 * person to their own back-office home, and the nav drops the entry.
 */
export default async function SinglesDayPage() {
  const session = await getSession();
  if (!session || !isBackOffice(session.role)) redirect("/admin/login");
  if (!canSeeSinglesDay(session.role) || singlesDayIsOver(await requestTime()))
    redirect(backOfficeHome(session.role));

  /* Cost and profit are shown to everyone who can open this page, sellers
     included. The owner decided that on 5 November for this campaign only.
     The rest of the back office still keeps supplier cost from a seller. */
  const products = await db.product.findMany({
    where: { sku: { in: SINGLES_DAY_ITEMS.map((i) => i.sku) } },
    select: {
      sku: true,
      supplierCost: true,
      images: { select: { url: true }, take: 1, orderBy: { sortOrder: "asc" } },
    },
  });
  const photoBySku = new Map(
    products.map((p) => [p.sku, p.images[0]?.url ?? null]),
  );
  const costBySku = new Map(
    products.map((p) => [
      p.sku,
      p.supplierCost != null && p.supplierCost > 0 ? p.supplierCost : null,
    ]),
  );
  const plan = SINGLES_DAY_SOCIAL_PLAN;

  return (
    <div className="space-y-8">
      {/* ── the deals ─────────────────────────────────────────────── */}
      <section>
        <Heading
          icon={<Gift className="size-5" />}
          title="המוצרים שבמבצע"
          note={`${SINGLES_DAY_ITEMS.length} מוצרים`}
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
          {SINGLES_DAY_ITEMS.map((item) => {
            const photo = photoBySku.get(item.sku) ?? null;
            const cost = costBySku.get(item.sku) ?? null;
            const profit = cost !== null ? item.salePrice - cost : null;
            return (
              <article
                key={item.sku}
                className="group flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="relative aspect-square bg-white">
                  {photo ? (
                    <Image
                      src={photo}
                      alt={item.label}
                      fill
                      sizes="(min-width: 1536px) 20vw, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                      className="object-contain p-4 transition group-hover:scale-[1.04]"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-4xl font-black text-red-600/15">
                      11.11
                    </div>
                  )}
                  <span className="absolute top-2.5 right-2.5 rounded-full bg-gradient-to-l from-rose-600 to-red-600 px-2.5 py-0.5 text-xs font-black text-white shadow">
                    {item.discountPct}%-
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-2 border-t p-3">
                  <h3 className="line-clamp-2 text-sm leading-snug font-semibold">
                    {item.label}
                  </h3>
                  <div className="mt-auto flex items-baseline gap-2">
                    <span className="text-lg font-black text-red-600 dark:text-rose-400">
                      {ils(item.salePrice)}
                    </span>
                    <span className="text-muted-foreground text-xs line-through">
                      {ils(item.plannedPrice)}
                    </span>
                  </div>
                  <dl className="grid grid-cols-2 gap-1.5 rounded-xl bg-muted/60 p-2 text-center text-xs">
                    <div>
                      <dt className="text-muted-foreground">עלות</dt>
                      <dd className="font-bold">
                        {cost !== null ? ils(cost) : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">רווח במבצע</dt>
                      <dd
                        className={`font-bold ${profit === null ? "" : profit > 0 ? "text-success" : "text-destructive"}`}
                      >
                        {profit !== null ? ils(profit) : "—"}
                      </dd>
                    </div>
                  </dl>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* ── examples: the live page and the mall ──────────────────── */}
      <section>
        <Heading icon={<Sparkles className="size-5" />} title="דוגמאות" />
        <div className="grid gap-3 sm:grid-cols-2">
          <a
            href="/singles-day"
            target="_blank"
            className="group relative flex min-h-36 flex-col justify-end overflow-hidden rounded-2xl bg-[radial-gradient(120%_140%_at_85%_0%,#ff2a3d_0%,#e3001b_45%,#a8000f_100%)] p-5 text-white shadow-md transition hover:shadow-lg"
          >
            <span
              aria-hidden
              dir="ltr"
              className="pointer-events-none absolute -bottom-6 left-2 text-[7rem] leading-none font-black tracking-[-0.05em] text-transparent select-none [-webkit-text-stroke:1.5px_rgb(255_210_90/0.35)]"
            >
              11.11
            </span>
            <span className="relative text-xl font-black">דף יום הרווקים</span>
            <span className="relative mt-1 flex items-center gap-1 text-sm font-semibold text-[#ffd25a]">
              כמו שהלקוחות רואים אותו
              <ArrowUpLeft className="size-4 transition group-hover:-translate-x-0.5 group-hover:-translate-y-0.5" />
            </span>
          </a>
          <a
            href={mallHref("admin-singles-day", false)}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative flex min-h-36 flex-col justify-end overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 via-indigo-900 to-slate-900 p-5 text-white shadow-md transition hover:shadow-lg"
          >
            <Store
              aria-hidden
              className="pointer-events-none absolute top-4 left-4 size-20 text-white/10"
            />
            <span className="relative text-xl font-black">הקניון</span>
            <span className="relative mt-1 flex items-center gap-1 text-sm font-semibold text-white/75">
              הקניון התלת־ממדי של Buy Today
              <ArrowUpLeft className="size-4 transition group-hover:-translate-x-0.5 group-hover:-translate-y-0.5" />
            </span>
          </a>
        </div>
      </section>

      {/* ── the paid plan ─────────────────────────────────────────── */}
      <section>
        <Heading
          icon={<Megaphone className="size-5" />}
          title="התוכנית הממומנת"
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <PlanTile
            icon={<Megaphone className="size-5" />}
            label="ערוץ"
            value={plan.headline}
          />
          <PlanTile
            icon={<Video className="size-5" />}
            label="חומרים"
            value={plan.creative}
          />
          <PlanTile
            icon={<Wallet className="size-5" />}
            label="תקציב"
            value={`${ils(plan.budgetIls)} ל${plan.days === 2 ? "יומיים" : `-${plan.days} ימים`}`}
          />
        </div>
      </section>
    </div>
  );
}

function Heading({
  icon,
  title,
  note,
}: {
  icon: React.ReactNode;
  title: string;
  note?: string;
}) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span className="flex size-9 items-center justify-center rounded-xl bg-red-600/10 text-red-600 dark:text-rose-400">
        {icon}
      </span>
      <h2 className="text-lg font-black">{title}</h2>
      {note && <span className="text-muted-foreground text-sm">{note}</span>}
    </div>
  );
}

function PlanTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border bg-card p-4 shadow-sm">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-red-600/10 text-red-600 dark:text-rose-400">
        {icon}
      </span>
      <div>
        <div className="text-muted-foreground text-xs font-semibold">
          {label}
        </div>
        <div className="mt-0.5 font-bold">{value}</div>
      </div>
    </div>
  );
}
