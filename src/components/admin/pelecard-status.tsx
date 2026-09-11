import type { PelecardDiagnosis } from "@/lib/pelecard/config";

/**
 * Why checkout is showing the demo form — the answer, on a page.
 *
 * It exists because the question had no answer from inside the running site.
 * Six environment variables and a role decide whether a customer sees the real
 * payment form, all of them invisible, and a wrong one produces a demo form
 * that looks exactly like a deliberate one. The only way to tell was to open
 * the hosting dashboard, or to guess.
 *
 * So it leads with a single sentence naming the one thing to change, and the
 * table under it is there to be believed rather than read. Nothing here is a
 * credential: every row is a name and a yes, because this renders in a browser
 * and a debugging screen that prints a terminal number is a debugging screen
 * that ends up in a screenshot.
 */
export function PelecardStatus({ diagnosis }: { diagnosis: PelecardDiagnosis }) {
  const selling = diagnosis.guestLane === "gateway";

  return (
    <div className="flex flex-col gap-4">
      <div
        className={
          selling
            ? "rounded-xl border-2 border-emerald-500 bg-emerald-500/10 p-4"
            : "border-warning bg-warning/15 rounded-xl border-2 p-4"
        }
      >
        <p className="text-lg font-bold">
          {selling ? "החנות סולקת כרטיסים" : "הקופה במצב הדגמה — לקוחות לא מחויבים"}
        </p>
        <p className="mt-1 text-sm">
          {selling
            ? "לקוח או אורח שמגיע לקופה מקבל את טופס הסליקה האמיתי של פלאקארד."
            : diagnosis.blocker
              ? "כדי לפתוח את הסליקה צריך לשנות דבר אחד:"
              : "כל ההגדרות תקינות אך הקופה עדיין בהדגמה — זה לא אמור לקרות."}
        </p>
        {!selling && diagnosis.blocker && (
          <p className="bg-background/60 mt-2 rounded-lg px-3 py-2 font-mono text-sm" dir="ltr">
            {diagnosis.blocker}
          </p>
        )}
        {!selling && (
          <p className="text-muted-foreground mt-2 text-sm">
            המקום לשנות: Vercel ← הפרויקט ← Settings ← Environment Variables ← Production. שינוי נכנס לתוקף רק
            בדיפלוימנט חדש.
          </p>
        )}
      </div>

      <div className="border-border bg-card rounded-xl border p-5">
        <h2 className="mb-3 font-semibold">מה מוגדר כרגע</h2>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Row
            label="שרת הסליקה"
            ok={diagnosis.gateway.ok}
            value={
              diagnosis.gateway.ok
                ? `${diagnosis.gateway.host}${diagnosis.gateway.isSandbox ? " (בדיקות)" : " (אמיתי)"}`
                : diagnosis.gateway.error
            }
          />
          <Row label="PELECARD_TERMINAL" ok={diagnosis.credentials.terminal} value={yesNo(diagnosis.credentials.terminal)} />
          <Row label="PELECARD_USER" ok={diagnosis.credentials.user} value={yesNo(diagnosis.credentials.user)} />
          <Row label="PELECARD_PASSWORD" ok={diagnosis.credentials.password} value={yesNo(diagnosis.credentials.password)} />
          <Row label="PELECARD_CALLBACK_SECRET" ok={diagnosis.callbackSecret} value={yesNo(diagnosis.callbackSecret)} />
          <Row label="NEXT_PUBLIC_SITE_URL" ok={Boolean(diagnosis.siteUrl)} value={diagnosis.siteUrl ?? "לא מוגדר"} />
          <Row
            label="PELECARD_ENABLED"
            ok={diagnosis.killSwitch !== "off"}
            value={
              diagnosis.killSwitch === "unset"
                ? "לא מוגדר — כלומר החנות פתוחה (ברירת המחדל)"
                : diagnosis.killSwitch === "off"
                  ? 'מוגדר "false" — הסליקה כבויה'
                  : "מוגדר — החנות פתוחה"
            }
          />
          <Row label="הנתיב של אורח" ok={selling} value={selling ? "סליקה אמיתית" : "הדגמה"} />
        </dl>
        <p className="text-muted-foreground mt-4 text-xs">
          לא מוצגים כאן ערכים של קרדנשלים — רק אם הם קיימים. מנהלים, סטאף וסוכנים נשארים בהדגמה תמיד, לפי
          התפקיד, גם כשהחנות פתוחה.
        </p>
      </div>
    </div>
  );
}

function yesNo(ok: boolean) {
  return ok ? "מוגדר" : "לא מוגדר";
}

function Row({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  return (
    <div className="border-border/60 flex items-baseline justify-between gap-3 border-b py-1.5">
      <dt className="text-muted-foreground shrink-0 font-mono text-xs" dir="ltr">
        {label}
      </dt>
      <dd className={`text-end ${ok ? "" : "text-destructive font-semibold"}`} dir="auto">
        {value}
      </dd>
    </div>
  );
}
