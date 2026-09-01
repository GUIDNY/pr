import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, EyeOff, Phone, ShieldAlert } from "lucide-react";
import { getComplaintDetail, getAssignableStaff } from "@/lib/queries/admin-complaints";
import { ComplaintControls, ComplaintNoteBox, ComplaintMediaButton } from "@/components/admin/complaint-controls";
import { formatDateTime, formatPrice } from "@/lib/format";
import {
  COMPLAINT_STATUS_LABELS,
  COMPLAINT_STATUS_COLORS,
  COMPLAINT_SEVERITY_LABELS,
  COMPLAINT_SEVERITY_COLORS,
  COMPLAINT_CATEGORY_LABELS,
  COMPLAINT_MESSAGE_ROLE_LABELS,
  ORDER_STATUS_LABELS,
  type ComplaintCategory,
  type ComplaintMessageRole,
  type ComplaintSeverity,
  type ComplaintStatus,
  type OrderStatus,
} from "@/lib/enums";

export const dynamic = "force-dynamic";

// One visual language per speaker, so the thread reads as a conversation
// rather than a log: the customer on the start edge, everyone on our side on
// the end edge, and SYSTEM as a thin centred line that is plainly not
// something a person typed.
const ROLE_STYLE: Record<ComplaintMessageRole, string> = {
  CUSTOMER: "me-auto bg-muted",
  BOT: "ms-auto bg-accent/60",
  STAFF: "ms-auto bg-brand/10 border-brand/30 border",
  SYSTEM: "mx-auto bg-transparent",
};

export default async function ComplaintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [complaint, staff] = await Promise.all([getComplaintDetail(id), getAssignableStaff()]);
  if (!complaint) notFound();

  const waHref = `https://wa.me/${complaint.waId}`;

  return (
    <div>
      <Link href="/admin/complaints" className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-sm">
        <ArrowRight className="size-4" /> חזרה לתלונות
      </Link>

      {/* Kept at the top of the page, not in a tooltip, because the rule has
          to survive the next person who works on this — and the moment it is
          forgotten is the moment a customer is told they have a complaint. */}
      <div className="border-warning/40 bg-warning/10 mb-4 flex items-start gap-2.5 rounded-xl border p-3 text-sm">
        <EyeOff className="text-warning-foreground mt-0.5 size-4 shrink-0" />
        <p>
          <strong>שרשור זה פנימי.</strong> הלקוח אינו רואה אותו ואינו יודע שנפתחה תלונה. שינוי סטטוס, שיוך והערות
          נשמרים כאן בלבד ואינם נשלחים לוואטסאפ.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">פנייה #{complaint.ticketNumber}</h1>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${COMPLAINT_SEVERITY_COLORS[complaint.severity as ComplaintSeverity]}`}>
          {COMPLAINT_SEVERITY_LABELS[complaint.severity as ComplaintSeverity] ?? complaint.severity}
        </span>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${COMPLAINT_STATUS_COLORS[complaint.status as ComplaintStatus]}`}>
          {COMPLAINT_STATUS_LABELS[complaint.status as ComplaintStatus] ?? complaint.status}
        </span>
        <span className="text-muted-foreground text-sm">
          {COMPLAINT_CATEGORY_LABELS[complaint.category as ComplaintCategory] ?? complaint.category}
        </span>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0">
          <div className="border-border bg-card mb-3 rounded-xl border p-4">
            <h2 className="text-muted-foreground mb-1 text-xs font-medium">נושא</h2>
            <p className="text-sm">{complaint.subject}</p>
          </div>

          <div className="flex flex-col gap-2.5">
            {complaint.messages.map((m) => {
              const role = m.role as ComplaintMessageRole;
              const redacted: string[] = m.redactedFields ? (JSON.parse(m.redactedFields) as string[]) : [];
              if (role === "SYSTEM") {
                return (
                  <p key={m.id} className="text-muted-foreground py-1 text-center text-xs">
                    {m.body} · {formatDateTime(m.createdAt)}
                  </p>
                );
              }
              return (
                <div key={m.id} className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${ROLE_STYLE[role]}`}>
                  <div className="text-muted-foreground mb-1 flex items-center gap-2 text-[11px] font-medium">
                    <span>
                      {COMPLAINT_MESSAGE_ROLE_LABELS[role] ?? role}
                      {m.author?.name ? ` · ${m.author.name}` : ""}
                    </span>
                    <span>{formatDateTime(m.createdAt)}</span>
                  </div>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap" dir="auto">
                    {m.body || <span className="text-muted-foreground">(ללא טקסט)</span>}
                  </p>
                  {redacted.length > 0 && (
                    <p className="text-muted-foreground mt-1.5 flex items-center gap-1 text-[11px]">
                      <ShieldAlert className="size-3" />
                      פרטים רגישים הוסרו לפני השמירה ואינם נשמרים בשום מקום
                    </p>
                  )}
                  {m.mediaMime &&
                    (m.mediaStoragePath ? (
                      <ComplaintMediaButton messageId={m.id} mime={m.mediaMime} />
                    ) : (
                      <p className="text-muted-foreground mt-2 text-xs">הלקוח שלח קובץ שלא נשמר ({m.mediaMime})</p>
                    ))}
                </div>
              );
            })}
          </div>

          <div className="mt-4">
            <ComplaintNoteBox id={complaint.id} />
          </div>
        </div>

        <aside className="flex flex-col gap-4">
          <div className="border-border bg-card rounded-xl border p-4">
            <h2 className="mb-3 text-sm font-bold">הלקוח</h2>
            <dl className="flex flex-col gap-2 text-sm">
              <div>
                <dt className="text-muted-foreground text-xs">שם</dt>
                <dd>{complaint.customerName ?? complaint.user?.name ?? "לא ידוע"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">וואטסאפ</dt>
                <dd>
                  <a href={waHref} target="_blank" rel="noreferrer" className="text-brand inline-flex items-center gap-1 font-mono" dir="ltr">
                    <Phone className="size-3.5" />
                    {complaint.waId}
                  </a>
                </dd>
              </div>
              {complaint.user && (
                <div>
                  <dt className="text-muted-foreground text-xs">חשבון באתר</dt>
                  <dd>{complaint.user.email ?? complaint.user.phone ?? complaint.user.name}</dd>
                </div>
              )}
              <div>
                <dt className="text-muted-foreground text-xs">נפתחה</dt>
                <dd>{formatDateTime(complaint.firstMessageAt)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">הודעה אחרונה</dt>
                <dd>{formatDateTime(complaint.lastMessageAt)}</dd>
              </div>
            </dl>
          </div>

          {complaint.order && (
            <div className="border-border bg-card rounded-xl border p-4">
              <h2 className="mb-2 text-sm font-bold">הזמנה מקושרת</h2>
              <Link href={`/admin/orders/${complaint.order.id}`} className="text-brand block font-mono text-sm">
                {complaint.order.orderNumber}
              </Link>
              <p className="text-muted-foreground mt-1 text-sm">
                {ORDER_STATUS_LABELS[complaint.order.status as OrderStatus] ?? complaint.order.status} ·{" "}
                {formatPrice(complaint.order.total)}
              </p>
            </div>
          )}

          <div className="border-border bg-card rounded-xl border p-4">
            <h2 className="mb-3 text-sm font-bold">טיפול</h2>
            <ComplaintControls
              id={complaint.id}
              status={complaint.status}
              severity={complaint.severity}
              category={complaint.category}
              assignedToId={complaint.assignedTo?.id ?? null}
              staff={staff}
              orderNumber={complaint.order?.orderNumber ?? null}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
