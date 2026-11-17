import { requireCatalogPage } from "@/lib/auth";
import Link from "next/link";
import { ArrowRight, Search, SlidersHorizontal } from "lucide-react";
import { getComplaintMetrics, getAssignableStaff, getComplaintDetail } from "@/lib/queries/admin-complaints";
import { getInboxList, getInboxStats, type InboxItem } from "@/lib/queries/admin-complaints-inbox";
import { ComplaintConversation } from "@/components/admin/complaint-conversation";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  CLOSED_COMPLAINT_STATUSES,
  COMPLAINT_STATUS_LABELS,
  COMPLAINT_STATUS_COLORS,
  COMPLAINT_SEVERITIES,
  COMPLAINT_SEVERITY_LABELS,
  COMPLAINT_CATEGORIES,
  COMPLAINT_CATEGORY_LABELS,
  type ComplaintCategory,
  type ComplaintSeverity,
  type ComplaintStatus,
} from "@/lib/enums";

export const metadata = { title: "תלונות | Buy Today Admin" };
export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;

/* An inbox, laid out like the leads-and-chats screen the owner pointed at
   (17 November): KPIs across the top, status chips with counts, a search,
   the list of threads on the start side and the selected conversation
   beside it. On a phone the list is the page and a thread opens on its own,
   with a way back. Everything lives in the URL — the filters and the open
   thread — so any view can be sent to someone as a link. */

const CHIPS = [
  { key: "ALL", label: "הכל" },
  { key: "OPEN", label: COMPLAINT_STATUS_LABELS.OPEN },
  { key: "IN_PROGRESS", label: COMPLAINT_STATUS_LABELS.IN_PROGRESS },
  { key: "WAITING_CUSTOMER", label: COMPLAINT_STATUS_LABELS.WAITING_CUSTOMER },
  { key: "CLOSED", label: "נסגרו" },
] as const;
type ChipKey = (typeof CHIPS)[number]["key"];

const CHIP_DOT: Record<ChipKey, string> = {
  ALL: "",
  OPEN: "bg-brand",
  IN_PROGRESS: "bg-accent-foreground",
  WAITING_CUSTOMER: "bg-warning",
  CLOSED: "bg-success",
};

function withParams(sp: SP, changes: Record<string, string | undefined>) {
  const next = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
  for (const [k, v] of Object.entries(changes)) {
    if (v) next.set(k, v);
    else next.delete(k);
  }
  const qs = next.toString();
  return `/admin/complaints${qs ? `?${qs}` : ""}`;
}

function ago(date: Date): string {
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return "עכשיו";
  if (minutes < 60) return `לפני ${minutes} דק׳`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "לפני שעה" : `לפני ${hours} שע׳`;
  const days = Math.round(hours / 24);
  if (days === 1) return "אתמול";
  return `לפני ${days} ימים`;
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className={cn("border-border bg-card rounded-xl border p-3.5", tone)}>
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      <p className="mt-1 text-2xl leading-tight font-bold">{value}</p>
      {sub && <p className="text-muted-foreground mt-0.5 text-xs">{sub}</p>}
    </div>
  );
}

function Dot({ item }: { item: InboxItem }) {
  const open = !CLOSED_COMPLAINT_STATUSES.includes(item.status as ComplaintStatus);
  const urgent = open && (item.severity === "HIGH" || item.severity === "CRITICAL");
  const cls = urgent ? "bg-destructive" : item.awaitingUs ? "bg-warning" : open ? "bg-brand" : "bg-muted-foreground/40";
  const title = urgent ? "דחוף" : item.awaitingUs ? "מחכה לתשובה מאיתנו" : open ? "פתוחה" : "סגורה";
  return <span className={cn("inline-block size-2.5 shrink-0 rounded-full", cls)} title={title} aria-label={title} />;
}

function ListItem({ item, href, active }: { item: InboxItem; href: string; active: boolean }) {
  const status = item.status as ComplaintStatus;
  return (
    <Link
      href={href}
      scroll={false}
      className={cn(
        "border-border hover:bg-muted/50 block border-b px-4 py-3 transition-colors",
        active && "bg-brand/5 border-s-brand border-s-4",
      )}
    >
      <div className="flex items-center gap-2">
        <Dot item={item} />
        <span className="truncate font-semibold">{item.customerName ?? "ללא שם"}</span>
        <span
          className={cn(
            "shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold",
            item.waId === "mall" ? "bg-muted text-muted-foreground" : "bg-[#25D366]/15 text-[#128C4B]",
          )}
        >
          {item.waId === "mall" ? "קניון" : "WhatsApp"}
        </span>
        <span className="text-muted-foreground ms-auto shrink-0 text-xs">{ago(item.lastMessageAt)}</span>
      </div>
      <p className="text-muted-foreground mt-1 line-clamp-1 text-sm" dir="auto">
        {item.lastCustomerBody || item.subject}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
        <span className={cn("rounded-full px-2 py-0.5 font-semibold", COMPLAINT_STATUS_COLORS[status])}>
          {COMPLAINT_STATUS_LABELS[status] ?? item.status}
        </span>
        <span className="text-muted-foreground">
          {COMPLAINT_CATEGORY_LABELS[item.category as ComplaintCategory] ?? item.category}
        </span>
        {item.product && (
          <span className="text-foreground truncate" title={item.product.title}>
            <bdi className="font-mono">{item.product.model}</bdi> · {formatPrice(item.product.price)}
          </span>
        )}
        {item.awaitingUs && <span className="text-warning-foreground ms-auto font-semibold">לא נענה</span>}
      </div>
    </Link>
  );
}

export default async function ComplaintsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireCatalogPage();
  const sp = await searchParams;
  const chip: ChipKey = (CHIPS.find((c) => c.key === sp.status)?.key ?? "ALL") as ChipKey;
  const selectedId = sp.id;

  const [items, stats, metrics, staff, selected] = await Promise.all([
    getInboxList(
      {
        status: chip === "ALL" || chip === "CLOSED" ? "ALL" : (chip as ComplaintStatus),
        severity: sp.severity as ComplaintSeverity | undefined,
        category: sp.category as ComplaintCategory | undefined,
        assignedToId: sp.assignee,
        q: sp.q?.trim() || undefined,
      },
      { closedOnly: chip === "CLOSED" },
    ),
    getInboxStats(),
    getComplaintMetrics(),
    getAssignableStaff(),
    selectedId ? getComplaintDetail(selectedId) : Promise.resolve(null),
  ]);

  const firstResponse =
    metrics.averageFirstResponseMinutes === null
      ? "—"
      : metrics.averageFirstResponseMinutes >= 60
        ? `${Math.round(metrics.averageFirstResponseMinutes / 60)} שע׳`
        : `${metrics.averageFirstResponseMinutes} דק׳`;
  const secondaryActive = Boolean(sp.category || sp.severity || sp.assignee);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">תלונות ופניות</h1>
          <p className="text-muted-foreground mt-1 text-sm">שיחות וואטסאפ שאלפרד לא סגר לבד. פנימי: הלקוח לא יודע שנפתחה תלונה.</p>
        </div>
      </div>

      <div className={cn("mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6", selected && "max-lg:hidden")}>
        <Kpi label="פניות" value={String(stats.last30)} sub={`ב־30 יום · ${stats.today} היום`} />
        <Kpi label="פתוחות" value={String(stats.open)} sub={`${metrics.critical} קריטיות`} />
        <Kpi
          label="מחכות לתשובה מאיתנו"
          value={String(stats.awaitingUs)}
          sub="הלקוח כתב אחרון"
          tone={stats.awaitingUs > 0 ? "border-warning/50 bg-warning/5" : undefined}
        />
        <Kpi label="נסגרו" value={String(stats.closed30)} sub="ב־30 יום" tone="border-success/40" />
        <Kpi
          label="זמן תגובה ראשון"
          value={firstResponse}
          sub={metrics.firstResponseSample ? `ממוצע של ${metrics.firstResponseSample} פניות` : "אין עדיין תשובות"}
        />
        <Kpi label="מכירה פוטנציאלית" value={String(stats.potentialSale)} sub="מזכירות דגם שאנחנו מוכרים" />
      </div>

      <div className={cn("mb-3 flex flex-wrap items-center gap-2", selected && "max-lg:hidden")}>
        {CHIPS.map((c) => (
          <Link
            key={c.key}
            href={withParams(sp, { status: c.key === "ALL" ? undefined : c.key, id: undefined })}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium",
              chip === c.key ? "bg-foreground text-background" : "border-border hover:bg-muted border",
            )}
          >
            {CHIP_DOT[c.key] && <span className={cn("size-2 rounded-full", CHIP_DOT[c.key])} />}
            {c.label} · {stats.chips[c.key]}
          </Link>
        ))}
      </div>

      <div className={cn("mb-4 flex flex-wrap items-start gap-2", selected && "max-lg:hidden")}>
        <form action="/admin/complaints" className="relative min-w-60 flex-1 sm:max-w-sm">
          {Object.entries(sp)
            .filter(([k, v]) => v && k !== "q" && k !== "id")
            .map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
          <Search className="text-muted-foreground pointer-events-none absolute inset-y-0 start-3 my-auto size-4" />
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="חיפוש שם, טלפון, הודעה…"
            className="border-border bg-background focus:ring-brand/30 w-full rounded-full border py-2 ps-9 pe-3 text-sm focus:ring-2 focus:outline-none"
          />
        </form>
        <details className="group" open={secondaryActive}>
          <summary className="border-border hover:bg-muted inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm">
            <SlidersHorizontal className="size-4" />
            סינון נוסף{secondaryActive ? " ·" : ""}
          </summary>
          <div className="border-border bg-card mt-2 flex max-w-3xl flex-col gap-2 rounded-xl border p-3">
            <div className="flex flex-wrap gap-1.5">
              {COMPLAINT_CATEGORIES.map((c) => (
                <Link
                  key={c}
                  href={withParams(sp, { category: sp.category === c ? undefined : c, id: undefined })}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs",
                    sp.category === c ? "bg-primary text-primary-foreground" : "border-border hover:bg-muted border",
                  )}
                >
                  {COMPLAINT_CATEGORY_LABELS[c]}
                </Link>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {COMPLAINT_SEVERITIES.map((s) => (
                <Link
                  key={s}
                  href={withParams(sp, { severity: sp.severity === s ? undefined : s, id: undefined })}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs",
                    sp.severity === s ? "bg-primary text-primary-foreground" : "border-border hover:bg-muted border",
                  )}
                >
                  {COMPLAINT_SEVERITY_LABELS[s]}
                </Link>
              ))}
              <span className="border-border mx-1 border-s" />
              <Link
                href={withParams(sp, { assignee: sp.assignee === "UNASSIGNED" ? undefined : "UNASSIGNED", id: undefined })}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs",
                  sp.assignee === "UNASSIGNED" ? "bg-primary text-primary-foreground" : "border-border hover:bg-muted border",
                )}
              >
                לא משויך
              </Link>
              {staff.map((s) => (
                <Link
                  key={s.id}
                  href={withParams(sp, { assignee: sp.assignee === s.id ? undefined : s.id, id: undefined })}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs",
                    sp.assignee === s.id ? "bg-primary text-primary-foreground" : "border-border hover:bg-muted border",
                  )}
                >
                  {s.name}
                </Link>
              ))}
            </div>
            {secondaryActive && (
              <Link
                href={withParams(sp, { category: undefined, severity: undefined, assignee: undefined, id: undefined })}
                className="text-muted-foreground hover:text-foreground text-xs"
              >
                ניקוי הסינון הנוסף
              </Link>
            )}
          </div>
        </details>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(20rem,26rem)_1fr]">
        <section
          className={cn(
            "border-border bg-card overflow-hidden rounded-xl border lg:max-h-[calc(100vh-11rem)] lg:overflow-y-auto",
            selected && "max-lg:hidden",
          )}
          aria-label="רשימת פניות"
        >
          {items.length === 0 ? (
            <p className="text-muted-foreground p-10 text-center text-sm">אין פניות שתואמות את הסינון.</p>
          ) : (
            items.map((item) => (
              <ListItem key={item.id} item={item} href={withParams(sp, { id: item.id })} active={item.id === selectedId} />
            ))
          )}
        </section>

        <section
          className={cn(
            "border-border bg-card min-w-0 rounded-xl border p-4 lg:max-h-[calc(100vh-11rem)] lg:overflow-y-auto",
            !selected && "max-lg:hidden",
          )}
          aria-label="שיחה"
        >
          {selected ? (
            <>
              <Link
                href={withParams(sp, { id: undefined })}
                scroll={false}
                className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-sm lg:hidden"
              >
                <ArrowRight className="size-4" /> לכל הפניות
              </Link>
              <ComplaintConversation complaint={selected} staff={staff} />
            </>
          ) : (
            <p className="text-muted-foreground flex h-full min-h-60 items-center justify-center text-sm">
              {selectedId ? "הפנייה לא נמצאה" : "בחרו פנייה מהרשימה"}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
