"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, Phone } from "lucide-react";
import { addKeepNoteAction, dismissKeepCustomerAction, setKeepContactedAction } from "@/actions/admin-keep-customers";
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
  contacted: boolean;
  contactedBy: string | null;
  contactedAt: string | null;
  notes: { at: string; author: string; body: string }[];
};

export function KeepCustomersList({ rows }: { rows: KeepRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [text, setText] = useState("");

  if (rows.length === 0)
    return <p className="text-muted-foreground border-border rounded-xl border border-dashed p-8 text-center text-sm">אין כרגע לקוחות לטיפול.</p>;

  const fresh = rows.filter((r) => !r.contacted);
  const done = rows.filter((r) => r.contacted);
  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 font-bold">חדשים ({fresh.length})</h2>
        {fresh.length === 0 ? <p className="text-muted-foreground text-sm">אין חדשים.</p> : renderList(fresh)}
      </section>
      <section>
        <h2 className="text-muted-foreground mb-2 font-bold">דיברנו כבר ({done.length})</h2>
        {done.length === 0 ? <p className="text-muted-foreground text-sm">עדיין לא סומנו.</p> : renderList(done)}
      </section>
    </div>
  );

  function renderList(list: KeepRow[]) {
  return (
    <ul className="space-y-3">
      {list.map((r) => {
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
            {r.contacted && r.contactedAt && (
              <p className="text-xs font-semibold text-green-700">
                דיברנו · {r.contactedBy ?? "—"} · {new Date(r.contactedAt).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "short" })}
              </p>
            )}
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
              <button type="button" onClick={() => { setOpenKey(openKey === r.key ? null : r.key); setText(""); }} className="border-border h-10 rounded-lg border px-3 text-sm font-semibold">
                הערה
              </button>
              <button
                disabled={pending}
                onClick={() => start(async () => { await setKeepContactedAction(r.key, !r.contacted); router.refresh(); })}
                className="border-border h-10 rounded-lg border px-3 text-sm font-semibold"
              >
                {r.contacted ? "החזר לחדשים" : "דיברנו כבר"}
              </button>
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
            {openKey === r.key && (
              <div className="mt-3 flex flex-col gap-2">
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={1000} className="border-border bg-background w-full rounded-md border p-2 text-sm" />
                <button
                  type="button"
                  disabled={pending || !text.trim()}
                  onClick={() => start(async () => { await addKeepNoteAction(r.key, text); setText(""); setOpenKey(null); router.refresh(); })}
                  className="bg-primary text-primary-foreground h-9 w-fit rounded-md px-3 text-sm font-semibold"
                >
                  שמירת הערה
                </button>
              </div>
            )}
            {r.notes.length > 0 && (
              <ul className="border-border mt-3 space-y-1.5 border-t pt-3 text-sm">
                {r.notes.map((n, i) => (
                  <li key={i}>
                    <span className="text-muted-foreground text-xs">
                      {n.author} · {new Date(n.at).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "short" })}
                    </span>
                    <p className="whitespace-pre-wrap">{n.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
  }
}
