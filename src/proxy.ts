import { NextResponse } from "next/server";
import { isPaymentConsoleAvailable } from "@/lib/pelecard/gateway";

/**
 * The payment console exists in exactly two situations: the sandbox gateway,
 * where nothing can be charged, and a deliberately armed live test on a preview
 * deployment. Anywhere else — the live site above all — it must not exist.
 *
 * The page itself calls notFound(), but by the time it runs the admin shell has
 * already begun streaming and the response is committed as 200 — the visitor
 * sees a 404 page over a 200, and anything checking the status is told the page
 * is there.
 *
 * Deciding it here, before rendering starts, makes the answer honest: a real
 * 404, from the routing layer, exactly as if the route did not exist.
 *
 * Scoped to that single path — nothing else in the app passes through here.
 *
 * Named `proxy` rather than `middleware`: Next 16 renamed the convention and
 * warns on every dev start about the old name.
 */
export function proxy() {
  if (isPaymentConsoleAvailable()) return NextResponse.next();

  return new NextResponse("404 — Not Found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export const config = {
  matcher: ["/admin/pelecard-test"],
};
