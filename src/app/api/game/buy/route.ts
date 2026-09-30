import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureCartLine, getOrCreateCart } from "@/lib/cart";
import { PUBLIC_PRODUCT_WHERE } from "@/lib/queries/products";

// "קנה עכשיו" in the 3D mall: puts the products into this browser's cart and
// opens the checkout, so buying from the game is one tap and then payment.
//
//   /api/game/buy?items=slug-a,slug-b
//
// A product's card in the game sends one slug; the receipt at the mall's
// checkout counters sends everything in the game's basket. A slug that
// appears twice is two of it.
//
// It ENSURES rather than adds (ensureCartLine): the cart ends up with at least
// that many, never that many more. It used to add, so every press of the
// button and every trip through the receipt put the same speaker in again —
// including one the customer had just removed at checkout and pressed buy on
// once more — and the cart kept growing lines nobody meant to buy twice.
//
// The cart is the ordinary one: the signed-in customer's (their saved
// address is already filled in at checkout) or the guest cart on the
// prec_cart_sid cookie. The game is on play.buytoday.co.il, the same site,
// and this is a top-level navigation, so both cookies arrive — SameSite=Lax
// is sent on exactly this. Inside the iOS app the game runs at /mall on this
// host and the link opens in place.
//
// WHY A GET WITH A SIDE EFFECT IS ACCEPTABLE HERE. The only effect is
// products appearing in the visitor's own cart; nothing is ordered and
// nothing is charged until they pay on the checkout page themselves. That is
// the same power any "add to cart" link on the web has, and it is what lets
// the game be a plain link that works in a new tab, in the app's WebView and
// with JavaScript off. It is still bounded: at most 20 lines, the same
// PUBLIC_PRODUCT_WHERE gate and stock cap as the add button, and /api is
// disallowed in robots.txt so crawlers do not fill carts following it.
//
// The destination is fixed — /checkout on this host, or /cart when nothing
// could be added — so this cannot be aimed anywhere else. utm_* parameters
// are carried across so the order is still credited to the game.
export const dynamic = "force-dynamic";

const MAX_LINES = 20;
const SLUG = /^[A-Za-z0-9._-]{1,200}$/;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const slugs = (url.searchParams.get("items") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => SLUG.test(s))
    .slice(0, MAX_LINES);

  const wanted = new Map<string, number>();
  for (const s of slugs) wanted.set(s, (wanted.get(s) ?? 0) + 1);

  let added = 0;
  if (wanted.size) {
    const products = await db.product.findMany({
      where: { slug: { in: [...wanted.keys()] }, ...PUBLIC_PRODUCT_WHERE },
      select: { id: true, slug: true, stockQty: true, stockStatus: true },
    });
    const sellable = products.filter((p) => p.stockStatus !== "OUT_OF_STOCK");
    if (sellable.length) {
      const cart = await getOrCreateCart();
      for (const p of sellable) {
        await ensureCartLine(cart, p, wanted.get(p.slug) ?? 1);
        added++;
      }
    }
  }

  const destination = new URL(added ? "/checkout" : "/cart", url.origin);
  for (const [k, v] of url.searchParams) if (k.startsWith("utm_")) destination.searchParams.set(k, v);

  return NextResponse.redirect(destination, {
    status: 303,
    headers: { "Cache-Control": "no-store" },
  });
}
