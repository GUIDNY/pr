import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getCart } from "@/lib/cart";
import { buildCartSummary } from "@/lib/cart-summary";
import { isBackOffice, backOfficeHome } from "@/lib/permissions";

// Everything the browser needs to personalise a page it was served from a
// cache, in one request.
//
// The pages themselves no longer know who is asking — that is what made them
// cacheable, and what took the homepage from ~1.5s of function time to a CDN
// hit. What is left over is three small things the page cannot carry: the
// visitor's name for the header, which products they have hearted, and what
// is in their cart. All three come from the same signed session cookie, so
// asking for them separately would be three round trips to Sydney for one
// answer.
//
// Anonymous visitors get here too — a guest cart is real — and pay one small
// query for it. Crawlers run no JavaScript and never call this at all.
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();

  const [favorites, cart] = await Promise.all([
    session
      ? db.favorite.findMany({ where: { userId: session.sub }, select: { productId: true } })
      : Promise.resolve([]),
    // getCart, not getOrCreateCart: loading a page must not write a cart row
    // for every visitor who never adds anything — including every bot that
    // does run JavaScript.
    getCart(),
  ]);

  return NextResponse.json(
    {
      name: session?.name ?? null,
      // Where this visitor's back office is, or null for the ~everyone who
      // has not got one. A path rather than the role: the header only ever
      // wants somewhere to link to, and a role name in a public JSON body is
      // a detail about staffing that the shop has no reason to publish.
      backOffice: session && isBackOffice(session.role) ? backOfficeHome(session.role) : null,
      favoriteIds: favorites.map((f) => f.productId),
      cart: await buildCartSummary(cart),
    },
    {
      // Personal, and it changes the moment anything is added or hearted.
      // Belt and braces alongside force-dynamic: no shared cache anywhere
      // between here and the browser may keep a copy.
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    },
  );
}
