"use client";

import { useTransition } from "react";
import { Check, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { approveReviewAction, deleteReviewAction } from "@/actions/reviews";

export function ReviewModerationButtons({ reviewId }: { reviewId: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => { await approveReviewAction(reviewId); toast.success("הביקורת אושרה ומופיעה באתר"); })}
        className="bg-success flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        <Check className="size-4" /> אישור
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => { await deleteReviewAction(reviewId); toast.success("הביקורת נמחקה"); })}
        className="border-border hover:bg-muted flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold disabled:opacity-50"
      >
        <Trash2 className="size-4" /> מחיקה
      </button>
    </div>
  );
}
