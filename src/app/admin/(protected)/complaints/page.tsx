import Link from "next/link";
import { AlertTriangle, Clock, CheckCircle2, Inbox } from "lucide-react";
import { getComplaints, getComplaintMetrics, getAssignableStaff } from "@/lib/queries/admin-complaints";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import {
  COMPLAINT_STATUSES,
  COMPLAINT_STATUS_LABELS,
  COMPLAINT_STATUS_COLORS,
  COMPLAINT_SEVERITIES,
  COMPLAINT_SEVERITY_LABELS,
  COMPLAINT_SEVERITY_COLORS,
  COMPLAINT_CATEGORIES,
  COMPLAINT_CATEGORY_LABELS,
  type ComplaintCategory,
  type ComplaintSeverity,
  type ComplaintStatus,
} from "@/lib/enums";

export const metadata = { title: "תלונות | A&I Electronics Admin" };
export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;

/** Filters live in the URL so a row can be sent to someone as a link. */
function withParam(sp: SP, key: string, value: string | undefined) {
  const next = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
  if (value) next.set(key, value);
  else next.delete(key);
  const qs = next.toString();
  return `/admin/complaints${qs ? `?${qs}` : ""}`;
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={
        active
          ? "bg-primary text-primary-foreground rounded-full px-3 py-1.5 text-sm font-medium"
          : "border-border hover:bg-muted rounded-full border px-3 py-1.5 text-sm"
      }
    >
      {children}
    </Link>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Inbox;
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="border-border bg-card flex items-center gap-3 rounded-xl border p-3.5">
      <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${tone ?? "bg-muted text-muted-foreground"}`}>
        <Icon className="size-4.5" />
      </span>
      <span className="min-w-0">
        <span className="block text-lg leading-tight font-bold">{value}</span>
        <span className="text-muted-foreground block text-xs">{label}</span>
      </span>
    </div>
  );
}

export default async function ComplaintsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const status = (sp.status as ComplaintStatus | "ALL" | undefined) ?? "OPEN_ONLY";

  const [complaints, metrics, staff] = await Promise.all([
    getComplaints({
      status: status as ComplaintStatus | "ALL" | "OPEN_ONLY",
      severity: sp.severity as ComplaintSeverity | undefined,
      category: sp.category as ComplaintCategory | undefined,
      assignedToId: sp.assignee,
      from: sp.from,
      to: sp.to,
      q: sp.q?.trim() || undefined,
    }),
    getComplaintMetrics(),
    getAssignableStaff(),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold">תלונות</h1>
      <p className="text-muted-foreground mt-1 mb-4 text-sm">
        שיחות וואטסאפ שאלפרד לא הצליח לסגור לבד, מסודרות לפי חומרה ואז לפי ההודעה האחרונה.
        השרשורים כאן פנימיים — הלקוח אינו יודע שנפתחה תלונה.
      </p>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric icon={Inbox} label="תלונות פתוחות" value={String(metrics.open)} tone="bg-brand/10 text-brand" />
        <Metric
          icon={AlertTriangle}
          label="מתוכן קריטיות"
          value={String(metrics.critical)}
          tone={metrics.critical > 0 ? "bg-destructive/10 text-destructive" : undefined}
        />
        <Metric
          icon={Clock}
          label={
            metrics.averageFirstResponseMinutes === null
              ? "זמן תגובה ראשון"
              : `זמן תגובה ראשון (${metrics.firstResponseSample} פניות)`
          }
          value={
            metrics.averageFirstResponseMinutes === null
              ? "—"
              : metrics.averageFirstResponseMinutes >= 60
                ? `${Math.round(metrics.averageFirstResponseMinutes / 60)} שעות`
                : `${metrics.averageFirstResponseMinutes} דק׳`
          }
        />
        <Metric icon={CheckCircle2} label="נסגרו השבוע" value={String(metrics.resolvedThisWeek)} tone="bg-success/10 text-success" />
      </div>

      <form className="mb-3 flex flex-wrap items-end gap-2" action="/admin/complaints">
        {Object.entries(sp)
          .filter(([k, v]) => v && k !== "q")
          .map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
        <label className="min-w-56 flex-1">
          <span className="text-muted-foreground mb-1 block text-xs font-medium">חיפוש</span>
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="שם, מספר וואטסאפ, מספר פנייה או תוכן ההודעות"
            className="border-border bg-background focus:ring-brand/30 w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
          />
        </label>
        <label>
          <span className="text-muted-foreground mb-1 block text-xs font-medium">מתאריך</span>
          <input type="date" name="from" defaultValue={sp.from ?? ""} className="border-border bg-background rounded-lg border px-3 py-2 text-sm" />
        </label>
        <label>
          <span className="text-muted-foreground mb-1 block text-xs font-medium">עד תאריך</span>
          <input type="date" name="to" defaultValue={sp.to ?? ""} className="border-border bg-background rounded-lg border px-3 py-2 text-sm" />
        </label>
        <button type="submit" className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium">
          סינון
        </button>
        <Link href="/admin/complaints" className="text-muted-foreground hover:text-foreground px-2 py-2 text-sm">
          ניקוי
        </Link>
      </form>

      <div className="mb-2 flex flex-wrap gap-2">
        <Chip href={withParam(sp, "status", undefined)} active={status === "OPEN_ONLY"}>
          פתוחות
        </Chip>
        {COMPLAINT_STATUSES.map((s) => (
          <Chip key={s} href={withParam(sp, "status", s)} active={status === s}>
            {COMPLAINT_STATUS_LABELS[s]}
          </Chip>
        ))}
        <Chip href={withParam(sp, "status", "ALL")} active={status === "ALL"}>
          הכל
        </Chip>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {COMPLAINT_SEVERITIES.map((s) => (
          <Chip key={s} href={withParam(sp, "severity", sp.severity === s ? undefined : s)} active={sp.severity === s}>
            {COMPLAINT_SEVERITY_LABELS[s]}
          </Chip>
        ))}
        <span className="border-border mx-1 border-s" />
        {COMPLAINT_CATEGORIES.map((c) => (
          <Chip key={c} href={withParam(sp, "category", sp.category === c ? undefined : c)} active={sp.category === c}>
            {COMPLAINT_CATEGORY_LABELS[c]}
          </Chip>
        ))}
        <span className="border-border mx-1 border-s" />
        <Chip href={withParam(sp, "assignee", sp.assignee === "UNASSIGNED" ? undefined : "UNASSIGNED")} active={sp.assignee === "UNASSIGNED"}>
          לא משויך
        </Chip>
        {staff.map((s) => (
          <Chip key={s.id} href={withParam(sp, "assignee", sp.assignee === s.id ? undefined : s.id)} active={sp.assignee === s.id}>
            {s.name}
          </Chip>
        ))}
      </div>

      {complaints.length === 0 ? (
        <div className="border-border text-muted-foreground rounded-xl border border-dashed p-10 text-center text-sm">
          אין תלונות שתואמות את הסינון.
        </div>
      ) : (
        <div className="border-border bg-card overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>פנייה</TableHead>
                <TableHead>לקוח</TableHead>
                <TableHead>נושא</TableHead>
                <TableHead>קטגוריה</TableHead>
                <TableHead>חומרה</TableHead>
                <TableHead>סטטוס</TableHead>
                <TableHead>מטפל</TableHead>
                <TableHead>הודעות</TableHead>
                <TableHead>הודעה אחרונה</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {complaints.map((c) => (
                <TableRow key={c.id} className="hover:bg-muted/40">
                  <TableCell className="font-mono text-sm font-semibold">
                    <Link href={`/admin/complaints/${c.id}`} className="hover:text-brand">
                      #{c.ticketNumber}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link href={`/admin/complaints/${c.id}`} className="block">
                      <span className="block font-medium">{c.customerName ?? "ללא שם"}</span>
                      <span className="text-muted-foreground block font-mono text-xs" dir="ltr">
                        {c.waId}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-[26rem]">
                    <Link href={`/admin/complaints/${c.id}`} className="hover:text-brand line-clamp-2 text-sm">
                      {c.subject}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {COMPLAINT_CATEGORY_LABELS[c.category as ComplaintCategory] ?? c.category}
                  </TableCell>
                  <TableCell>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${COMPLAINT_SEVERITY_COLORS[c.severity as ComplaintSeverity]}`}>
                      {COMPLAINT_SEVERITY_LABELS[c.severity as ComplaintSeverity] ?? c.severity}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${COMPLAINT_STATUS_COLORS[c.status as ComplaintStatus]}`}>
                      {COMPLAINT_STATUS_LABELS[c.status as ComplaintStatus] ?? c.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{c.assignedTo?.name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{c._count.messages}</TableCell>
                  <TableCell className="text-muted-foreground text-sm whitespace-nowrap">{formatDateTime(c.lastMessageAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
