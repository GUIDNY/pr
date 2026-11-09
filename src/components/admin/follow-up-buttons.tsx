"use client";

import { useTransition } from "react";
import { Mail, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { sendReviewRequestAction } from "@/actions/follow-up";
import { sendReferralInviteAction } from "@/actions/referral-invite";

/** Email + WhatsApp for one follow-up on one order: a review request, or the promotion (consent only). */
export function FollowUpButtons({
  orderId,
  kind,
  hasEmail,
  hasPhone,
}: {
  orderId: string;
  kind: "review" | "promo";
  hasEmail: boolean;
  hasPhone: boolean;
}) {
  const [pending, start] = useTransition();
  const send = (channel: "EMAIL" | "WHATSAPP") =>
    start(async () => {
      const res = kind === "review" ? await sendReviewRequestAction(orderId, channel) : await sendReferralInviteAction(orderId, channel);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (res.whatsappUrl) window.open(res.whatsappUrl, "_blank", "noopener,noreferrer");
      toast.success(res.message);
    });
  return (
    <div className="flex gap-1.5">
      <button
        type="button"
        title="מייל"
        disabled={pending || !hasEmail}
        onClick={() => send("EMAIL")}
        className="border-border hover:bg-muted grid size-8 place-items-center rounded-lg border disabled:opacity-40"
      >
        <Mail className="size-4" />
      </button>
      <button
        type="button"
        title="וואטסאפ"
        disabled={pending || !hasPhone}
        onClick={() => send("WHATSAPP")}
        className="grid size-8 place-items-center rounded-lg bg-[#25D366] text-white hover:brightness-95 disabled:opacity-40"
      >
        <MessageCircle className="size-4" />
      </button>
    </div>
  );
}
