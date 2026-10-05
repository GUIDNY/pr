import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { gameJson as json, gameOriginAllowed, gamePreflight, readGameBody } from "@/lib/game-api";

// A report from the 3D mall's player chat: somebody wrote something they
// should not have. The mall's chat is broadcast only — nothing is stored — so
// the report carries the lines the reporter saw, and becomes a complaint in
// the back office (/admin/complaints) like any other, on its own channel.
//
// Anyone in the mall can report, signed in or not; the rate limit is what
// keeps this from being a way to fill the complaints list. Every field is
// clipped and the lines are stored as text, never rendered as anything else.
export const dynamic = "force-dynamic";

const clip = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, n) : "");

export async function OPTIONS() {
  return gamePreflight("POST, OPTIONS");
}

export async function POST(request: Request) {
  if (!gameOriginAllowed(request)) return json({ error: "forbidden" }, 403);
  const limit = rateLimit(`mall-report:${clientKey(request)}`, 5, 60 * 60 * 1000);
  if (!limit.ok) return json({ error: "too many reports" }, 429);

  const raw = await readGameBody(request, 4000);
  if (raw === null) return json({ error: "too large" }, 413);
  let body: { name?: unknown; lines?: unknown; reason?: unknown; reporter?: unknown };
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
  const name = clip(body.name, 24) || "אורח/ת";
  const reason = clip(body.reason, 40) || "תוכן פוגעני";
  const reporter = clip(body.reporter, 24);
  const lines = Array.isArray(body.lines) ? body.lines.map((l) => clip(l, 120)).filter(Boolean).slice(0, 8) : [];
  if (!lines.length) return json({ error: "nothing to report" }, 400);

  const session = await getSession();
  await db.complaint.create({
    data: {
      waId: "mall",
      channel: "MALL",
      category: "OTHER",
      severity: "MEDIUM",
      subject: `דיווח מהקניון על שחקן: ${name}`,
      customerName: reporter || null,
      userId: session?.sub ?? null,
      messages: {
        create: {
          role: "SYSTEM",
          body: [`סיבה: ${reason}`, `השחקן המדווח: ${name}`, `מה נכתב:`, ...lines.map((l) => `• ${l}`)].join("\n"),
        },
      },
    },
  });
  return json({ ok: true });
}
