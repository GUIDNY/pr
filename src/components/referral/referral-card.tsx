"use client";

import { useState } from "react";
import { Check, Copy, Gift, Mail, Share2 } from "lucide-react";
import { toast } from "sonner";
import { REFERRAL_FRIEND_PERCENT, REFERRAL_MIN_ORDER, REFERRAL_REWARDS } from "@/lib/referral-rules";

/**
 * The customer's own חבר מביא חבר link, and the buttons to send it.
 *
 * Every send here is the customer's own — their WhatsApp, their mail client,
 * their clipboard — to people they choose. Nothing leaves the shop's
 * systems, which is what keeps it on the right side of the spam law
 * (Communications Law §30A covers what the *advertiser* sends).
 */
export function ReferralCard({
  link,
  friends,
  nextReward,
  compact = false,
}: {
  link: string;
  friends: number;
  nextReward: number;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const message =
    `היי! אני קונה ב-Buy Today — מוצרי חשמל עם אחריות ומשלוח עד הבית. ` +
    `דרך הקישור שלי מקבלים ${REFERRAL_FRIEND_PERCENT}% הנחה בהזמנה הראשונה: ${link}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("הקישור הועתק");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("לא הצלחנו להעתיק — אפשר לסמן את הקישור ולהעתיק ידנית");
    }
  };
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Buy Today", text: message, url: link });
        return;
      } catch {
        /* cancelled — fall through to nothing */
        return;
      }
    }
    void copy();
  };

  return (
    <section className="border-border bg-card overflow-hidden rounded-2xl border">
      <div className="bg-brand/10 flex items-start gap-3 p-4 sm:p-5">
        <span className="bg-brand text-brand-foreground flex size-10 shrink-0 items-center justify-center rounded-full">
          <Gift className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-bold">חבר מביא חבר</h2>
          <p className="text-muted-foreground mt-0.5 text-sm leading-relaxed">
            החבר מקבל {REFERRAL_FRIEND_PERCENT}% הנחה בהזמנה הראשונה, ואתם מקבלים מתנה לקנייה הבאה כשהוא קונה
            ב-{REFERRAL_MIN_ORDER} ₪ ומעלה.
          </p>
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        {/* the steps */}
        {!compact && (
          <ol className="grid grid-cols-3 gap-2 text-center">
            {REFERRAL_REWARDS.map((value, i) => {
              const done = friends > i;
              return (
                <li
                  key={value}
                  className={`rounded-xl border p-2.5 ${done ? "border-success/40 bg-success/10" : i === friends ? "border-brand/50 bg-brand/5" : "border-border"}`}
                >
                  <div className="text-muted-foreground text-[11px]">חבר {i + 1}</div>
                  <div className="text-lg font-black tabular-nums">₪{value}</div>
                  <div className="text-[11px] font-medium">{done ? "✓ התקבל" : i === friends ? "הבא בתור" : ""}</div>
                </li>
              );
            })}
          </ol>
        )}
        <p className="text-sm">
          {friends > 0 ? (
            <>
              הבאתם כבר <b>{friends}</b> {friends === 1 ? "חבר" : "חברים"}. המתנה הבאה: <b>₪{nextReward}</b>.
            </>
          ) : (
            <>
              המתנה על החבר הראשון: <b>₪{nextReward}</b>. המתנות מופיעות כאן בקופונים שלכם.
            </>
          )}
        </p>

        {/* the link */}
        <div className="flex items-stretch gap-2">
          <input
            readOnly
            value={link}
            dir="ltr"
            onFocus={(e) => e.currentTarget.select()}
            className="border-border bg-muted/40 min-w-0 flex-1 rounded-lg border px-3 py-2 font-mono text-sm"
            aria-label="הקישור האישי שלכם"
          />
          <button
            type="button"
            onClick={copy}
            className="border-border hover:bg-muted flex shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold"
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "הועתק" : "העתקה"}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(message)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#25D366] font-bold text-white hover:brightness-95"
          >
            <svg viewBox="0 0 24 24" className="size-5 fill-current" aria-hidden="true">
              <path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.8.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.4-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.6-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3M12 21.8c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4c-1-1.6-1.5-3.4-1.5-5.2 0-5.4 4.4-9.8 9.8-9.8 2.6 0 5.1 1 6.9 2.9 1.8 1.8 2.9 4.3 2.9 6.9 0 5.4-4.4 9.8-9.8 9.8m8.4-18.2A11.8 11.8 0 0 0 12 0C5.5 0 .2 5.3.2 11.8c0 2.1.5 4.1 1.6 5.9L.1 24l6.4-1.7c1.7.9 3.6 1.4 5.6 1.4 6.5 0 11.8-5.3 11.8-11.8 0-3.2-1.2-6.1-3.5-8.3" />
            </svg>
            שליחה בוואטסאפ
          </a>
          <a
            href={`mailto:?subject=${encodeURIComponent(`${REFERRAL_FRIEND_PERCENT}% הנחה ב-Buy Today`)}&body=${encodeURIComponent(message)}`}
            className="border-border hover:bg-muted flex h-11 items-center justify-center gap-2 rounded-xl border font-semibold"
          >
            <Mail className="size-4" /> שליחה במייל
          </a>
          <button
            type="button"
            onClick={share}
            className="border-border hover:bg-muted flex h-11 items-center justify-center gap-2 rounded-xl border font-semibold"
          >
            <Share2 className="size-4" /> שיתוף אחר
          </button>
        </div>
        <p className="text-muted-foreground text-xs leading-relaxed">
          ההנחה לחבר תקפה בהזמנה הראשונה שלו בלבד. המתנה שלכם נכנסת לאזור האישי אחרי שהחבר שילם על הזמנה של{" "}
          {REFERRAL_MIN_ORDER} ₪ ומעלה, ותקפה ל-90 יום.
        </p>
      </div>
    </section>
  );
}
