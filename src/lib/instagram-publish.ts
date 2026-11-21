import type { InstagramPostRow } from "@/lib/instagram-plan";

/**
 * Daily Instagram publisher (Graph API). The token lives only in
 * process.env.IG_ACCESS_TOKEN; it is never logged or returned.
 */
const GRAPH = "https://graph.facebook.com/v21.0";
const IG_USER_ID = process.env.IG_USER_ID || "17841466400735667";
const TZ = "Asia/Jerusalem";
type Post = InstagramPostRow;

async function graph(path: string, params: Record<string, string>, method: "POST" | "GET" = "POST") {
  const token = process.env.IG_ACCESS_TOKEN;
  if (!token) throw new Error("IG_ACCESS_TOKEN is not set");
  const body = new URLSearchParams({ ...params, access_token: token });
  const url = method === "GET" ? `${GRAPH}/${path}?${body}` : `${GRAPH}/${path}`;
  const res = await fetch(url, method === "GET" ? undefined : { method, body });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string; code?: number } };
  if (!res.ok || json.error) throw new Error(`Graph ${path}: ${json.error?.message ?? res.status} (code ${json.error?.code ?? "?"})`);
  return json;
}

async function waitFinished(id: string, tries = 40) {
  for (let i = 0; i < tries; i++) {
    const r = await graph(id, { fields: "status_code,status" }, "GET");
    if (r.status_code === "FINISHED") return;
    if (r.status_code === "ERROR" || r.status_code === "EXPIRED") throw new Error(`container ${id}: ${r.status_code} ${r.status ?? ""}`);
    await new Promise((r2) => setTimeout(r2, 5000));
  }
  throw new Error(`container ${id}: not FINISHED in time`);
}

export function describePlan(post: Post) {
  const urls = post.mediaUrls;
  switch (post.type) {
    case "IMAGE": return { steps: [{ media_type: "IMAGE", image_url: urls[0], caption: post.caption }] };
    case "STORY": return { steps: [{ media_type: "STORIES", image_url: urls[0] }] };
    case "REELS": return { steps: [{ media_type: "REELS", video_url: urls[0], cover_url: urls[1], caption: post.caption }] };
    case "CAROUSEL": return { steps: [...urls.map((u) => ({ is_carousel_item: true, image_url: u })), { media_type: "CAROUSEL", children: "<ids>", caption: post.caption }] };
    default: throw new Error(`unknown type ${post.type}`);
  }
}

/** Creates the container(s), waits, publishes. Returns media id + permalink. */
export async function publishToInstagram(post: Post) {
  const u = post.mediaUrls;
  let creationId: string;
  if (post.type === "IMAGE") {
    creationId = String((await graph(`${IG_USER_ID}/media`, { image_url: u[0], caption: post.caption })).id);
  } else if (post.type === "STORY") {
    creationId = String((await graph(`${IG_USER_ID}/media`, { media_type: "STORIES", image_url: u[0] })).id);
  } else if (post.type === "REELS") {
    const params: Record<string, string> = { media_type: "REELS", video_url: u[0], caption: post.caption };
    if (u[1]) params.cover_url = u[1];
    creationId = String((await graph(`${IG_USER_ID}/media`, params)).id);
    await waitFinished(creationId);
  } else if (post.type === "CAROUSEL") {
    const kids: string[] = [];
    for (const url of u) kids.push(String((await graph(`${IG_USER_ID}/media`, { image_url: url, is_carousel_item: "true" })).id));
    for (const k of kids) await waitFinished(k);
    creationId = String((await graph(`${IG_USER_ID}/media`, { media_type: "CAROUSEL", children: kids.join(","), caption: post.caption })).id);
    await waitFinished(creationId);
  } else throw new Error(`unknown type ${post.type}`);

  const pub = await graph(`${IG_USER_ID}/media_publish`, { creation_id: creationId });
  const igMediaId = String(pub.id);
  let permalink: string | null = null;
  try { permalink = String((await graph(igMediaId, { fields: "permalink" }, "GET")).permalink); } catch { /* published anyway */ }
  return { igMediaId, permalink };
}
