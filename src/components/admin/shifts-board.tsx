"use client";

import { useState, useTransition } from "react";
import { setShiftAction, saveShiftPhonesAction } from "@/actions/admin-shifts";
import { DAY_NAMES, SHIFT_PEOPLE, shortDate } from "@/lib/shifts/week";

export function ShiftsBoard({
  dates,
  initial,
  waText,
  phones,
}: {
  dates: string[];
  initial: Record<string, string>;
  waText: string;
  phones: { idan: string; asaf: string };
}) {
  const [shifts, setShifts] = useState(initial);
  const [pending, start] = useTransition();
  const [idan, setIdan] = useState(phones.idan);
  const [asaf, setAsaf] = useState(phones.asaf);
  const [msg, setMsg] = useState("");

  const text = `משמרות הזמנות Buy Today · ${shortDate(dates[0])}–${shortDate(dates[6])}\n${dates
    .map((d, i) => `${DAY_NAMES[i]} ${shortDate(d)}: ${shifts[d] ?? "—"}`)
    .join("\n")}`;
  void waText;

  function change(date: string, person: string) {
    const prev = shifts[date];
    setShifts((s) => {
      const n = { ...s };
      if (person) n[date] = person;
      else delete n[date];
      return n;
    });
    start(async () => {
      const r = await setShiftAction(date, person);
      if (!r.ok) {
        setMsg(r.error);
        setShifts((s) => ({ ...s, ...(prev ? { [date]: prev } : {}) }));
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="border-border overflow-hidden rounded-xl border">
        <table className="w-full text-sm">
          <tbody className="divide-border divide-y">
            {dates.map((d, i) => (
              <tr key={d}>
                <td className="p-3 font-semibold">{DAY_NAMES[i]}</td>
                <td className="text-muted-foreground p-3">{shortDate(d)}</td>
                <td className="p-3">
                  <select
                    value={shifts[d] ?? ""}
                    onChange={(e) => change(d, e.target.value)}
                    disabled={pending}
                    className="border-border bg-background rounded-md border px-2 py-1.5"
                  >
                    <option value="">— לא משובץ —</option>
                    {SHIFT_PEOPLE.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {msg && <p className="text-destructive text-sm">{msg}</p>}

      <a
        href={`https://wa.me/?text=${encodeURIComponent(text)}`}
        target="_blank"
        rel="noreferrer"
        className="bg-primary text-primary-foreground inline-block rounded-lg px-4 py-2 text-sm font-semibold"
      >
        שלח לוואטסאפ
      </a>

      <form
        className="border-border space-y-3 rounded-xl border p-4"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            await saveShiftPhonesAction(idan, asaf);
            setMsg("הטלפונים נשמרו");
          });
        }}
      >
        <h2 className="font-semibold">טלפונים לתזכורות (נשמרים במסד, לא בקוד)</h2>
        <label className="block text-sm">
          עידן
          <input dir="ltr" value={idan} onChange={(e) => setIdan(e.target.value)} placeholder="9725XXXXXXXX" className="border-border bg-background mt-1 block w-full rounded-md border px-2 py-1.5" />
        </label>
        <label className="block text-sm">
          אסף
          <input dir="ltr" value={asaf} onChange={(e) => setAsaf(e.target.value)} placeholder="9725XXXXXXXX" className="border-border bg-background mt-1 block w-full rounded-md border px-2 py-1.5" />
        </label>
        <button disabled={pending} className="border-border rounded-md border px-3 py-1.5 text-sm font-semibold">
          שמירה
        </button>
      </form>
    </div>
  );
}
