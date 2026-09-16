"use client";

import { useState } from "react";
import { Loader2, Server, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { migrateImagesBatchAction } from "@/actions/admin-image-migration";

/**
 * The browser drives the loop; the server does one batch per call.
 *
 * Not because that is elegant, but because no route here sets maxDuration,
 * so a request is capped at the platform default and 2,600 images is not a
 * request. Batching in the client also means the count on screen is real
 * progress rather than a spinner over a request that may already have been
 * killed — and stopping is just not asking for the next batch, so a run can
 * be abandoned safely at any point. Every image migrated before that stays
 * migrated.
 */
type Group = {
  key: string;
  label: string;
  hosts?: string[];
  note: string;
  /** Known to refuse us. The button stays — that is how anyone finds out
      the block has been lifted — but it is marked, because the first two
      runs of this screen were both spent on it by accident. */
  blocked?: boolean;
};

export function ImageMigrationPanel({ groups }: { groups: Group[] }) {
  const [running, setRunning] = useState<string | null>(null);
  const [done, setDone] = useState(0);
  const [failures, setFailures] = useState<{ url: string; reason: string }[]>([]);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [touched, setTouched] = useState(0);

  async function run(group: Group) {
    setRunning(group.key);
    setDone(0);
    setFailures([]);
    setTouched(0);
    let migrated = 0;
    /* Ids already tried, passed back so the queue advances.
       A failed image is unchanged in the database, so without this the next
       batch is the same images again — which is why the loop used to stop
       the moment a batch migrated nothing. That rule turned four unlucky
       images at the front of the queue into "0 migrated" for the whole
       catalogue: the first four by id are a price comparison site, a
       manufacturer, a competitor and an importer, and the two that refuse
       robots were standing in front of three thousand that would have
       worked. */
    const tried: string[] = [];
    for (;;) {
      const result = await migrateImagesBatchAction(group.hosts, tried);
      if (!result.configured) {
        toast.error("אחסון התמונות לא מוגדר — חסר SUPABASE_URL או SUPABASE_SERVICE_ROLE_KEY");
        setRunning(null);
        // Returning rather than breaking: the success toast below would
        // otherwise follow the error with "0 תמונות הועברו", which reads
        // like the run simply had nothing to do and buries the actual
        // reason it did nothing.
        return;
      }
      migrated += result.migrated;
      tried.push(...result.attemptedIds);
      setDone(migrated);
      setRemaining(result.remaining);
      setTouched(tried.length);
      if (result.failed.length > 0) {
        setFailures((prev) => [...prev, ...(result.failed as { url: string; reason: string }[])].slice(0, 100));
      }
      // The only end condition left: nothing matched the query. Since every
      // attempt is skipped next time, that now genuinely means the queue is
      // empty rather than that the front of it is stuck.
      if (result.attempted === 0) {
        if (migrated === 0) toast.info("לא נמצאו תמונות להעברה");
        break;
      }
    }
    setRunning(null);
    if (migrated > 0) toast.success(`${migrated} תמונות הועברו לשרת שלנו`);
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="flex items-center gap-2.5">
          <Server className="text-brand size-6" />
          <h1 className="text-2xl font-bold">העברת תמונות לשרת שלנו</h1>
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          כל תמונה מורדת מהמקור, מונחת על ריבוע לבן 800×800 בלי חיתוך ובלי מתיחה, נשמרת כ-WebP ומועלית
          לאחסון שלנו. תמונות ממארחים חסומים לא מועתקות — הן מטופלות בלשונית הנפרדת.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {groups.map((group) => (
          <div
            key={group.key}
            className={`rounded-xl border p-4 ${
              group.blocked ? "border-warning/40 bg-warning/5" : "border-border bg-card"
            }`}
          >
            <p className="font-semibold">
              {group.label}
              {group.blocked && (
                <span className="bg-warning/20 text-warning-foreground ms-2 rounded-full px-2 py-0.5 text-xs font-medium">
                  חסום
                </span>
              )}
            </p>
            <p className="text-muted-foreground mt-1 text-sm">{group.note}</p>
            <Button
              variant={group.blocked ? "outline" : "brand"}
              className="mt-3"
              disabled={running !== null}
              onClick={() => run(group)}
            >
              {running === group.key ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> {done} מתוך {touched}
                </>
              ) : (
                "התחלה"
              )}
            </Button>
          </div>
        ))}
      </div>

      {running !== null && (
        <p className="text-muted-foreground text-sm">
          אפשר לסגור את העמוד בכל רגע — מה שהועבר נשאר מועבר, וההרצה הבאה ממשיכה מאותה נקודה.
        </p>
      )}

      {done > 0 && running === null && (
        <div className="border-success/30 bg-success/5 flex items-start gap-3 rounded-xl border p-4">
          <CheckCircle2 className="text-success mt-0.5 size-5 shrink-0" />
          <div className="text-sm">
            <p className="font-semibold">{done} תמונות הועברו</p>
            {remaining !== null && <p className="text-muted-foreground mt-0.5">נותרו {remaining} תמונות חיצוניות</p>}
            <p className="text-muted-foreground mt-0.5">
              נבדקו {touched} תמונות.
            </p>
          </div>
        </div>
      )}

      {failures.length > 0 && (
        <div className="border-warning/40 bg-warning/10 rounded-xl border p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="size-4" /> {failures.length} תמונות לא עברו
          </p>
          {/* Nothing was deleted for these — the product still points at the
              hotlink it always did, so a failure costs nothing but a retry. */}
          <p className="text-muted-foreground mt-1 text-xs">
            התמונות האלה נשארו כפי שהיו. המוצר עדיין מציג אותן מהמקור החיצוני.
          </p>
          <ul className="mt-2 flex max-h-64 flex-col gap-1 overflow-y-auto text-xs">
            {failures.map((f, i) => (
              <li key={i} className="flex flex-wrap gap-2">
                <span className="text-destructive shrink-0 font-medium">{f.reason}</span>
                <span className="text-muted-foreground truncate" dir="ltr">{f.url}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
