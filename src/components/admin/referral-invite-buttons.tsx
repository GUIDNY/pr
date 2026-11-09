"use client";

import { useTransition } from "react";
import { Mail, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { sendReferralInviteAction } from "@/actions/referral-invite";

export function ReferralInviteButtons({ orderId, hasEmail, hasPhone }: { orderId: string; hasEmail: boolean; hasPhone: boolean }) {
  const [pending, start] = useTransition();
  const send = (channel: "EMAIL" | "WHATSAPP") =>
    start(async () => {
      const res = await sendReferralInviteAction(orderId, channel);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (res.whatsappUrl) window.open(res.whatsappUrl, "_blank", "noopener,noreferrer");
      toast.success(res.message);
    });
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        disabled={pending || !hasEmail}
        onClick={() => send("EMAIL")}
        className="border-border hover:bg-muted flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold disabled:opacity-50"
      >
        <Mail className="size-4" /> שליחה במייל
      </button>
      <button
        type="button"
        disabled={pending || !hasPhone}
        onClick={() => send("WHATSAPP")}
        className="flex h-9 items-center gap-1.5 rounded-lg bg-[#25D366] px-3 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-50"
      >
        <MessageCircle className="size-4" /> פתיחה בוואטסאפ
      </button>
    </div>
  );
}
