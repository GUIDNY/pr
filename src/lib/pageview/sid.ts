/**
 * The visit id — a session, not a person.
 *
 * `bt_sid` is the one cookie the page-view log keys on, and its whole value
 * is in what it is NOT: it is not a visitor id. It lapses after 30 minutes
 * without a request and, whatever happens, 24 hours after it was first
 * issued, so two visits a day apart are two unrelated ids and nothing can
 * stitch them back into one person. That is the line between measuring a
 * session and tracking a user, and it is a legal line (תיקון 13), not a
 * stylistic one. Do not lengthen it to "see returning visitors".
 *
 * The cookie carries the id and the second it was first issued, so the
 * 24-hour cap can be enforced without a lookup:  <uuid>.<startedAtSeconds>
 *
 * No imports: this runs in the proxy (edge) and in server code alike.
 */
export const SID_COOKIE = "bt_sid";
/** Renewed on every logged request; a visit ends after this much silence. */
export const SID_IDLE_SECONDS = 30 * 60;
/** And ends regardless after this long, even mid-browse. */
export const SID_MAX_SECONDS = 24 * 60 * 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type VisitSid = { id: string; startedAt: number };

export function parseSid(raw: string | null | undefined): VisitSid | null {
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = raw.slice(0, dot);
  const startedAt = Number(raw.slice(dot + 1));
  if (!UUID.test(id) || !Number.isInteger(startedAt) || startedAt <= 0) return null;
  return { id, startedAt };
}

export function serializeSid(sid: VisitSid): string {
  return `${sid.id}.${sid.startedAt}`;
}

/** The id this request belongs to: the cookie's, unless it is missing,
    unreadable or past the 24-hour cap — then a fresh one. The 30-minute idle
    rule is the cookie's own Max-Age, so an expired cookie simply never
    arrives here. */
export function resolveSid(raw: string | null | undefined, nowMs = Date.now()): VisitSid & { isNew: boolean } {
  const nowSec = Math.floor(nowMs / 1000);
  const current = parseSid(raw);
  if (current && nowSec - current.startedAt < SID_MAX_SECONDS && current.startedAt <= nowSec + 60) {
    return { ...current, isNew: false };
  }
  return { id: crypto.randomUUID(), startedAt: nowSec, isNew: true };
}
