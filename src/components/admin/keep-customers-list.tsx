"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, Phone } from "lucide-react";
import { dismissKeepCustomerAction } from "@/actions/admin-keep-customers";
import { waHref } from "@/lib/notify/whatsapp-link";
import { formatPrice } from "@/lib/format";

export type KeepRow = {
  key: string;
  name: string | null;
  phone: string | null;
  titles: string[];
  amount: number;
  attempts: number;
  lastAt: string;
  reason: string;
};

export function KeepCustomersList({ rows }: { rows: KeepRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  if (rows.length === 0)
    return <p className="text-muted-foreground border-border rounded-xl border border-dashed p-8 text-center text-sm">אין כרגע לקוחות לטיפול.</p>;

  return (
    <ul className="space-y-3">
      {rows.map((r) => {
        const first = r.name?.trim().split(/\s+/)[0] || "שלום";
        const product = r.titles[0] ? (r.titles.length > 1 ? `${r.titles[0]} ועוד ${r.titles.length - 1}` : r.titles[0]) : "המוצר שבחרת";
        const wa = waHref(r.phone, `שלום ${first}, כאן Buy Today. ראינו שניסית להזמין ${product} ולא הסתיים התשלום. אפשר לעזור?`);
        const tel = r.phone?.replace(/[^\d+]/g, "");
        return (
          <li key={r.key} className="border-border rounded-xl border p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-bold">{r.name ?? "ללא שם"}</p>
                <p className="text-muted-foreground text-sm" dir="ltr">{r.phone ?? "אין טלפון"}</p>
              </div>
              <span className="bg-muted rounded-full px-2.5 py-1 text-xs font-semibold">{r.reason}</span>
            </div>
            <p className="mt-2 text-sm">
              {r.titles.join(", ")} · <b className="tabular-nums">{formatPrice(r.amount)}</b>
            </p>
            <p className="text-muted-foreground text-xs">
              {r.attempts} ניסיונות · אחרון {new Date(r.lastAt).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "short" })}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {wa && (
                <a href={wa} target="_blank" rel="noreferrer" className="flex h-10 items-center gap-1.5 rounded-lg bg-green-600 px-3 text-sm font-semibold text-white">
                  <MessageCircle className="size-4" /> וואטסאפ
                </a>
              )}
              {tel && (
                <a href={`tel:${tel}`} className="border-border flex h-10 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold">
                  <Phone className="size-4" /> התקשר
                </a>
              )}
              {(["HANDLED", "NOT_RELEVANT"] as const).map((why) => (
                <button
                  key={why}
                  disabled={pending}
                  onClick={() => start(async () => { await dismissKeepCustomerAction(r.key, why); router.refresh(); })}
                  className="text-muted-foreground hover:text-foreground h-10 px-3 text-sm"
                >
                  {why === "HANDLED" ? "טופל" : "לא רלוונטי"}
                </button>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
