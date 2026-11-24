import "server-only";
import { db } from "@/lib/db";

/**
 * Read-only Instagram numbers for /admin/instagram and /api/admin/instagram-insights.
 * The token lives only in process.env.IG_INSIGHTS_TOKEN (falling back to IG_ACCESS_TOKEN); it is read inside graph(),
 * sent to Graph and never returned, logged or put in an error message.
 *
 * Everything here tolerates a missing permission or a metric Instagram does not
 * offer for a media type: that one cell becomes null and the page says why.
 */
const GRAPH = "https://graph.facebook.com/v21.0";
const IG_USER_ID = process.env.IG_USER_ID || "17841466400735667";

type GraphJson = Record<string, unknown> & { error?: { message?: string; code?: number } };

export class GraphError extends Error {
  constructor(message: string, readonly code: number | null) {
    super(message);
  }
  /** Permission problems (190 token, 10 / 200-299 permission) rather than "this metric is not offered". */
  get isPermission() {
    return this.code === 190 || this.code === 10 || (this.code !== null && this.code >= 200 && this.code < 300);
  }
}

async function graph(path: string, params: Record<string, string> = {}): Promise<GraphJson> {
  // A read-only token for Insights, if one is set, so the publishing token is never touched; otherwise the publishing token.
  const token = process.env.IG_INSIGHTS_TOKEN || process.env.IG_ACCESS_TOKEN;
  if (!token) throw new GraphError("neither IG_INSIGHTS_TOKEN nor IG_ACCESS_TOKEN is set on this deployment", null);
  const qs = new URLSearchParams({ ...params, access_token: token });
  const res = await fetch(`${GRAPH}/${path}?${qs}`, { cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as GraphJson;
  if (!res.ok || json.error) throw new GraphError(json.error?.message ?? `HTTP ${res.status}`, json.error?.code ?? null);
  return json;
}

type InsightValue = { name: string; total_value?: { value?: number; breakdowns?: { results?: { dimension_values?: string[]; value?: number }[] }[] }; values?: { value?: number; end_time?: string }[] };

async function metric(id: string, name: string, extra: Record<string, string> = {}): Promise<{ value: number | null; breakdown: Record<string, number>; error?: GraphError }> {
  try {
    const j = await graph(`${id}/insights`, { metric: name, ...extra });
    const d = ((j.data as InsightValue[]) ?? [])[0];
    const value = d?.total_value?.value ?? d?.values?.[0]?.value ?? null;
    const breakdown: Record<string, number> = {};
    for (const r of d?.total_value?.breakdowns?.[0]?.results ?? []) breakdown[(r.dimension_values ?? ["?"]).join("/")] = r.value ?? 0;
    return { value: typeof value === "number" ? value : null, breakdown };
  } catch (e) {
    return { value: null, breakdown: {}, error: e instanceof GraphError ? e : new GraphError(String(e), null) };
  }
}

export type PostRow = {
  id: string;
  date: string;
  type: string;
  thumb: string | null;
  permalink: string | null;
  igMediaId: string;
  reach: number | null; views: number | null; likes: number | null; comments: number | null;
  saves: number | null; shares: number | null; profileVisits: number | null; follows: number | null;
};
export type StoryRow = {
  id: string;
  date: string;
  frame: number;
  thumb: string | null;
  igMediaId: string;
  reach: number | null; replies: number | null; exits: number | null; tapsForward: number | null; tapsBack: number | null;
};
export type DayRow = { date: string; value: number };
export type Insights = {
  generatedAt: string;
  account: { followers: number | null; mediaCount: number | null; username: string | null } | null;
  followerDaily: DayRow[];
  posts: PostRow[];
  stories: StoryRow[];
  visits: { date: string; sessions: number; views: number }[];
  /** Plain-language problems for the page to show; never contains the token. */
  notes: string[];
};

const POST_METRICS: [keyof PostRow, string][] = [
  ["reach", "reach"], ["views", "views"], ["likes", "likes"], ["comments", "comments"],
  ["saves", "saved"], ["shares", "shares"], ["profileVisits", "profile_visits"], ["follows", "follows"],
];

export async function loadInsights(): Promise<Insights> {
  const notes: string[] = [];
  const out: Insights = { generatedAt: new Date().toISOString(), account: null, followerDaily: [], posts: [], stories: [], visits: [], notes };
  let permissionProblem = false;
  const seen = new Set<string>();
  const noteOnce = (msg: string) => { if (!seen.has(msg)) { seen.add(msg); notes.push(msg); } };
  const handle = (e: GraphError | undefined, what: string) => {
    if (!e) return;
    if (e.isPermission) permissionProblem = true;
    else noteOnce(`${what}: ${e.message}`);
  };

  // --- Account: followers now, and net follows per day for the last 14 days.
  try {
    const a = await graph(IG_USER_ID, { fields: "username,followers_count,media_count" });
    out.account = { username: (a.username as string) ?? null, followers: (a.followers_count as number) ?? null, mediaCount: (a.media_count as number) ?? null };
  } catch (e) {
    handle(e as GraphError, "פרטי חשבון");
  }
  try {
    const since = Math.floor(Date.now() / 1000) - 14 * 86400;
    const j = await graph(`${IG_USER_ID}/insights`, { metric: "follower_count", period: "day", since: String(since), until: String(Math.floor(Date.now() / 1000)) });
    const vals = ((j.data as InsightValue[]) ?? [])[0]?.values ?? [];
    out.followerDaily = vals.map((v) => ({ date: (v.end_time ?? "").slice(0, 10), value: v.value ?? 0 }));
  } catch (e) {
    handle(e as GraphError, "שינוי עוקבים לפי יום");
  }

  // --- Published posts and story sets from our own table.
  const rows = await db.instagramPost.findMany({
    where: { status: "published", igMediaId: { not: null } },
    orderBy: { scheduledFor: "desc" },
    take: 60,
  });
  for (const r of rows) {
    const date = r.scheduledFor.toISOString().slice(0, 10);
    if (r.type === "STORY_SET") {
      const ids = (r.igMediaId ?? "").split(",").filter(Boolean);
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const [reach, replies, nav] = await Promise.all([metric(id, "reach"), metric(id, "replies"), metric(id, "navigation", { breakdown: "action_type" })]);
        for (const m of [reach, replies, nav]) handle(m.error, "סטורי");
        out.stories.push({
          id: `${r.id}#${i + 1}`, date, frame: i + 1, thumb: r.mediaUrls[i] ?? null, igMediaId: id,
          reach: reach.value, replies: replies.value,
          exits: nav.breakdown["tap_exit"] ?? null, tapsForward: nav.breakdown["tap_forward"] ?? null, tapsBack: nav.breakdown["tap_back"] ?? null,
        });
      }
      continue;
    }
    const id = r.igMediaId as string;
    const res = await Promise.all(POST_METRICS.map(([, name]) => metric(id, name)));
    const row: PostRow = {
      id: r.id, date, type: r.type, thumb: r.type === "REELS" ? r.mediaUrls[1] ?? null : r.mediaUrls[0] ?? null,
      permalink: r.permalink, igMediaId: id,
      reach: null, views: null, likes: null, comments: null, saves: null, shares: null, profileVisits: null, follows: null,
    };
    POST_METRICS.forEach(([key], i) => {
      (row[key] as number | null) = res[i].value;
      handle(res[i].error, `פוסט ${date}`);
    });
    // Likes and comments also come with plain media access (instagram_basic), so
    // they survive a token that lacks instagram_manage_insights.
    if (row.likes === null || row.comments === null) {
      try {
        const m = await graph(id, { fields: "like_count,comments_count" });
        if (row.likes === null && typeof m.like_count === "number") row.likes = m.like_count;
        if (row.comments === null && typeof m.comments_count === "number") row.comments = m.comments_count;
      } catch { /* leave the cells empty; the permission note already explains why */ }
    }
    out.posts.push(row);
  }

  if (permissionProblem)
    notes.unshift("לטוקן של אינסטגרם אין הרשאת instagram_manage_insights (או שהטוקן פג). המספרים חסרים עד שהרשאה תתווסף: בהגדרות האפליקציה ב-Meta לבקש את instagram_manage_insights ולהנפיק טוקן חדש.");

  // --- Visits to the site that came from Instagram, per day (Asia/Jerusalem).
  try {
    const since = new Date(Date.now() - 30 * 86400 * 1000);
    const v = await db.$queryRaw<{ d: Date | string; sessions: bigint; views: bigint }[]>`
      select to_char(("createdAt" at time zone 'UTC') at time zone 'Asia/Jerusalem', 'YYYY-MM-DD') as d,
             count(distinct sid) as sessions, count(*) as views
      from "PageView"
      where "createdAt" >= ${since} and "isBot" = false and "isRsc" = false
        and ("query" ilike '%utm_source=instagram%' or "referrer" ilike '%instagram.com%' or "referrer" ilike '%l.instagram.com%')
      group by 1 order by 1 desc`;
    out.visits = v.map((x) => ({ date: String(x.d), sessions: Number(x.sessions), views: Number(x.views) }));
  } catch (e) {
    noteOnce(`כניסות מאינסטגרם: ${e instanceof Error ? e.message.slice(0, 200) : "שגיאה"}`);
  }
  return out;
}
