import "server-only";
import { cookies } from "next/headers";
import { parseSid, SID_COOKIE } from "@/lib/pageview/sid";

/** The current visit's id, for stamping onto a cart or an order so a
    session's path can be joined to what it bought. Null when the proxy has
    not issued one yet (the very first request) or the cookie has lapsed. */
export async function currentVisitSid(): Promise<string | null> {
  return parseSid((await cookies()).get(SID_COOKIE)?.value)?.id ?? null;
}
