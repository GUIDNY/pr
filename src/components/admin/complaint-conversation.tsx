import Link from "next/link";
import { EyeOff, MessageCircle, Phone, ShieldAlert } from "lucide-react";
import type { getComplaintDetail, getAssignableStaff } from "@/lib/queries/admin-complaints";
import { ComplaintControls, ComplaintNoteBox, ComplaintMediaButton, ComplaintWhatsAppReplyBox } from "@/components/admin/complaint-controls";
import { isServiceWindowOpen } from "@/lib/complaints/service-window";
import { formatDateTime, formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
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

type Detail = NonNullable<Awaited<ReturnType<typeof getComplaintDetail>>>;
type Staff = Awaited<ReturnType<typeof getAssignableStaff>>;

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

/**
 * One complaint as a chat: who it is and how to reach them, the whole
 * thread as bubbles, then the WhatsApp reply box (#167), the handling
 * controls and the internal note. Rendered inside the inbox's conversation
 * pane and, unchanged, by /admin/complaints/[id] for links sent between
 * staff.
 */
export function ComplaintConversation({ complaint, staff }: { complaint: Detail; staff: Staff }) {
  const lastCustomerMessageAt = [...complaint.messages].reverse().find((m) => m.role === "CUSTOMER")?.createdAt ?? null;
  const replyConfigured = Boolean(process.env.N8N_COMPLAINT_REPLY_WEBHOOK && process.env.INTERNAL_API_KEY);
  const isWhatsApp = complaint.channel !== "MALL";
  const name = complaint.customerName ?? complaint.user?.name ?? "ללא שם";

  return (
    <div className="flex min-h-0 flex-col">
      <header className="border-border flex flex-wrap items-start justify-between gap-3 border-b pb-3">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 text-lg font-bold">
            {name}
            <span className="text-muted-foreground font-mono text-sm font-normal">#{complaint.ticketNumber}</span>
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <span className={cn("rounded-full px-2 py-0.5 font-semibold", COMPLAINT_STATUS_COLORS[complaint.status as ComplaintStatus])}>
              {COMPLAINT_STATUS_LABELS[complaint.status as ComplaintStatus] ?? complaint.status}
            </span>
            <span className={cn("rounded-full px-2 py-0.5 font-semibold", COMPLAINT_SEVERITY_COLORS[complaint.severity as ComplaintSeverity])}>
              {COMPLAINT_SEVERITY_LABELS[complaint.severity as ComplaintSeverity] ?? complaint.severity}
            </span>
            <span className="text-muted-foreground">
              {COMPLAINT_CATEGORY_LABELS[complaint.category as ComplaintCategory] ?? complaint.category}
            </span>
            <span className="text-muted-foreground">· נפתחה {formatDateTime(complaint.firstMessageAt)}</span>
          </div>
          {complaint.order && (
            <p className="mt-1 text-xs">
              הזמנה{" "}
              <Link href={`/admin/orders/${complaint.order.id}`} className="text-brand font-mono">
                {complaint.order.orderNumber}
              </Link>{" "}
              · {ORDER_STATUS_LABELS[complaint.order.status as OrderStatus] ?? complaint.order.status} ·{" "}
              {formatPrice(complaint.order.total)}
            </p>
          )}
        </div>
        {isWhatsApp ? (
          <div className="flex shrink-0 items-center gap-2">
            <a
              href={`tel:+${complaint.waId}`}
              className="border-border hover:bg-muted inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-sm"
              dir="ltr"
            >
              <Phone className="size-3.5" />+{complaint.waId}
            </a>
            <a
              href={`https://wa.me/${complaint.waId}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#25D366] px-2.5 py-1.5 text-sm font-medium text-white"
            >
              <MessageCircle className="size-3.5" />
              וואטסאפ
            </a>
          </div>
        ) : (
          <span className="text-muted-foreground text-xs">דיווח מהצ&apos;אט בקניון</span>
        )}
      </header>

      {/* Kept above the thread, not in a tooltip, because the rule has to
          survive the next person who works on this. */}
      <p className="text-muted-foreground mt-2 flex items-start gap-1.5 text-xs">
        <EyeOff className="mt-0.5 size-3.5 shrink-0" />
        שרשור פנימי: הלקוח לא יודע שנפתחה תלונה. סטטוס, שיוך והערות לא נשלחים. רק התיבה הירוקה &quot;שלח תשובה
        בוואטסאפ&quot; מגיעה ללקוח.
      </p>

      <div className="mt-3 flex flex-col gap-2.5">
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

      {complaint.channel === "WHATSAPP" && (
        <div className="mt-4">
          <ComplaintWhatsAppReplyBox
            id={complaint.id}
            configured={replyConfigured}
            windowOpen={isServiceWindowOpen(lastCustomerMessageAt)}
            phone={complaint.waId}
          />
        </div>
      )}

      <div className="border-border bg-card mt-4 rounded-xl border p-4">
        <h3 className="mb-3 text-sm font-bold">טיפול</h3>
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

      <div className="mt-4">
        <ComplaintNoteBox id={complaint.id} />
      </div>
    </div>
  );
}
