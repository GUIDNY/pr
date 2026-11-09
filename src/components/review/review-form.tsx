"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { Star, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { submitReviewsAction } from "@/actions/reviews";

type Item = { productId: string; title: string; imageUrl: string | null };

/** One row of five stars. */
function Stars({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-1" role="radiogroup" aria-label={label} dir="ltr">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} כוכבים`}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(n)}
          className="p-0.5"
        >
          <Star className={`size-8 transition-colors ${(hover || value) >= n ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`} />
        </button>
      ))}
    </div>
  );
}

export function ReviewForm({ orderNumber, token, items }: { orderNumber: string; token: string; items: Item[] }) {
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [bodies, setBodies] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <CheckCircle2 className="text-success size-14" />
        <h2 className="text-2xl font-black">תודה רבה!</h2>
        <p className="text-muted-foreground max-w-sm">הביקורת שלכם התקבלה ותופיע באתר אחרי בדיקה קצרה. זה עוזר מאוד ללקוחות הבאים.</p>
      </div>
    );
  }

  const submit = () =>
    start(async () => {
      const entries = items
        .filter((i) => ratings[i.productId])
        .map((i) => ({ productId: i.productId, rating: ratings[i.productId], body: bodies[i.productId] }));
      const res = await submitReviewsAction(orderNumber, token, entries);
      if (!res.ok) {
        toast.error(res.error ?? "לא הצלחנו לשמור");
        return;
      }
      setDone(true);
    });

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={item.productId} className="bg-card rounded-2xl border p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <div className="relative size-16 shrink-0 overflow-hidden rounded-xl border bg-white">
              {item.imageUrl && <Image src={item.imageUrl} alt="" fill sizes="64px" className="object-contain p-1" referrerPolicy="no-referrer" />}
            </div>
            <p className="line-clamp-2 font-semibold">{item.title}</p>
          </div>
          <div className="mt-3">
            <Stars value={ratings[item.productId] ?? 0} onChange={(v) => setRatings((r) => ({ ...r, [item.productId]: v }))} label={`דירוג ל${item.title}`} />
          </div>
          {ratings[item.productId] ? (
            <textarea
              value={bodies[item.productId] ?? ""}
              onChange={(e) => setBodies((b) => ({ ...b, [item.productId]: e.target.value }))}
              placeholder="ספרו בכמה מילים איך המוצר (לא חובה)"
              rows={3}
              maxLength={2000}
              className="border-border bg-background mt-3 w-full rounded-xl border p-3 text-sm"
            />
          ) : null}
        </div>
      ))}
      <button
        type="button"
        onClick={submit}
        disabled={pending || Object.keys(ratings).length === 0}
        className="bg-brand text-brand-foreground hover:bg-brand-hover h-12 w-full rounded-xl text-base font-bold disabled:opacity-50"
      >
        {pending ? "שולחים…" : "שליחת הביקורת"}
      </button>
    </div>
  );
}
