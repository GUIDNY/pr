import { Camera } from "lucide-react";
import { requireCatalogPage } from "@/lib/auth";
import { loadInsights, type Insights } from "@/lib/instagram-insights";

export const metadata = { title: "אינסטגרם | Buy Today Admin" };
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const n = (v: number | null) => (v === null ? "–" : v.toLocaleString("he-IL"));
const TYPE: Record<string, string> = { IMAGE: "תמונה", CAROUSEL: "קרוסלה", REELS: "רילס", STORY: "סטורי" };

/** Read-only numbers from Instagram's API plus the site visits that came from it. See lib/instagram-insights.ts. */
export default async function InstagramPage() {
  await requireCatalogPage();
  let data: Insights | null = null;
  let failure: string | null = null;
  try {
    data = await loadInsights();
  } catch (e) {
    failure = e instanceof Error ? e.message.slice(0, 300) : "שגיאה לא ידועה";
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Camera className="size-6" /> אינסטגרם
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">קריאה בלבד. המספרים מ-Instagram Graph API, הכניסות לאתר מה-PageView.</p>
      </div>

      {failure && <p className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800">לא הצלחתי לטעון את הנתונים: {failure}</p>}
      {data?.notes.map((note) => (
        <p key={note} className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">{note}</p>
      ))}

      {data && (
        <>
          <section className="bg-card grid gap-4 rounded-xl border p-4 sm:grid-cols-3">
            <div>
              <div className="text-muted-foreground text-xs">עוקבים עכשיו {data.account?.username ? `(@${data.account.username})` : ""}</div>
              <div className="text-3xl font-bold">{n(data.account?.followers ?? null)}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">פרסומים בחשבון</div>
              <div className="text-3xl font-bold">{n(data.account?.mediaCount ?? null)}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">שינוי עוקבים ב-14 הימים האחרונים</div>
              <div className="text-3xl font-bold" dir="ltr">
                {data.followerDaily.length ? (data.followerDaily.reduce((s, d) => s + d.value, 0) >= 0 ? "+" : "") + data.followerDaily.reduce((s, d) => s + d.value, 0) : "–"}
              </div>
            </div>
            {data.followerDaily.length > 0 && (
              <div className="sm:col-span-3">
                <div className="text-muted-foreground mb-1 text-xs">שינוי נטו לפי יום</div>
                <div className="flex flex-wrap gap-2 text-xs" dir="ltr">
                  {data.followerDaily.map((d) => (
                    <span key={d.date} className="rounded border px-2 py-1">{d.date.slice(5)}: {d.value > 0 ? "+" : ""}{d.value}</span>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-2 text-lg font-bold">פוסטים שפורסמו</h2>
            {data.posts.length === 0 ? (
              <p className="text-muted-foreground text-sm">עדיין לא פורסם פוסט דרך המערכת.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full min-w-[820px] text-sm">
                  <thead className="bg-muted/50 text-xs">
                    <tr className="text-start">
                      {["", "תאריך", "סוג", "reach", "views", "likes", "comments", "saves", "shares", "ביקורים בפרופיל", "follows"].map((h) => (
                        <th key={h} className="px-3 py-2 text-start font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.posts.map((p) => (
                      <tr key={p.id} className="border-t">
                        <td className="px-3 py-2">
                          {p.thumb && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.thumb} alt="" className="h-12 w-10 rounded object-cover" />
                          )}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {p.permalink ? <a href={p.permalink} target="_blank" rel="noreferrer" className="text-brand underline">{p.date}</a> : p.date}
                        </td>
                        <td className="px-3 py-2">{TYPE[p.type] ?? p.type}</td>
                        {[p.reach, p.views, p.likes, p.comments, p.saves, p.shares, p.profileVisits, p.follows].map((v, i) => (
                          <td key={i} className="px-3 py-2 tabular-nums">{n(v)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-2 text-lg font-bold">סטורי</h2>
            {data.stories.length === 0 ? (
              <p className="text-muted-foreground text-sm">עדיין לא פורסם סטורי דרך המערכת.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-muted/50 text-xs">
                    <tr>
                      {["", "תאריך", "פריים", "reach", "replies", "exits", "taps forward", "taps back"].map((h) => (
                        <th key={h} className="px-3 py-2 text-start font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.stories.map((s) => (
                      <tr key={s.id} className="border-t">
                        <td className="px-3 py-2">
                          {s.thumb && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={s.thumb} alt="" className="h-12 w-7 rounded object-cover" />
                          )}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">{s.date}</td>
                        <td className="px-3 py-2">{s.frame}</td>
                        {[s.reach, s.replies, s.exits, s.tapsForward, s.tapsBack].map((v, i) => (
                          <td key={i} className="px-3 py-2 tabular-nums">{n(v)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-2 text-lg font-bold">כניסות לאתר מאינסטגרם (30 ימים)</h2>
            {data.visits.length === 0 ? (
              <p className="text-muted-foreground text-sm">אין כניסות שזוהו כאינסטגרם (utm_source=instagram או referrer).</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full max-w-md text-sm">
                  <thead className="bg-muted/50 text-xs">
                    <tr>{["תאריך", "מבקרים", "צפיות בדפים"].map((h) => <th key={h} className="px-3 py-2 text-start font-medium">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {data.visits.map((v) => (
                      <tr key={v.date} className="border-t">
                        <td className="px-3 py-2">{v.date}</td>
                        <td className="px-3 py-2 tabular-nums">{n(v.sessions)}</td>
                        <td className="px-3 py-2 tabular-nums">{n(v.views)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
