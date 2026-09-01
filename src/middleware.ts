import { NextResponse } from "next/server";
import { isSandboxGateway } from "@/lib/pelecard/gateway";

/**
 * The sandbox payment console must not exist in a build that can charge a real
 * card. The page itself calls notFound(), but by the time it runs the admin
 * shell has already begun streaming and the response is committed as 200 — the
 * visitor sees a 404 page over a 200, and anything checking the status is told
 * the page is there.
 *
 * Deciding it here, before rendering starts, makes the answer honest: a real
 * 404, from the routing layer, exactly as if the route did not exist.
 *
 * Scoped to that single path — nothing else in the app passes through here.
 */
export function middleware() {
  if (isSandboxGateway()) return NextResponse.next();

  return new NextResponse("404 — Not Found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export const config = {
  matcher: ["/admin/pelecard-test"],
};
