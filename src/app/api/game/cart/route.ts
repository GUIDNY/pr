import { db } from "@/lib/db";
import { addLineToCart, getCart, getOrCreateCart } from "@/lib/cart";
import { buildCartSummary } from "@/lib/cart-summary";
import { PUBLIC_PRODUCT_WHERE } from "@/lib/queries/products";
import { gameJson as json, gameOriginAllowed, gamePreflight, readGameBody } from "@/lib/game-api";

// The 3D mall's cart IS the shop's cart.
//
// The game used to keep a basket of its own and hand it to the shop only at
// the checkout, so a customer had two carts that disagreed: a product removed
// at checkout was still in the game, the next trip through the receipt put it
// back, and the cart button in the game showed a total the shop had never
// heard of. Now "לעגלה" in the game writes to the cart this browser already
// has on the site (the account's when signed in, the guest one otherwise),
// the game's cart screen reads it from here, and the checkout it opens is of
// that same cart.
//
//   GET                     → the cart, as the game draws it
//   POST {action, slug, qty} → add one / set a quantity / remove, then the cart
//
// Same rules as every other way into the cart: the public-product gate and
// the stock cap live in addLineToCart and PUBLIC_PRODUCT_WHERE, not here.
// Same door as /api/game/profile: CORS names the game's origin only, and a
// write must come from the game or the shop (gameOriginAllowed) and be JSON,
// which a form on another site cannot send without a preflight.
export const dynamic = "force-dynamic";

const MAX_BODY = 512;

async function cartForGame() {
  const cart = await getCart();
  if (!cart.id) return { items: [], count: 0, subtotal: 0 };
  const s = await buildCartSummary(cart);
  return {
    items: s.items.map((i) => ({
      id: i.id,
      slug: i.slug,
      title: i.title,
      brand: i.brandName,
      image: i.image,
      price: i.price,
      qty: i.quantity,
      max: i.maxQuantity,
    })),
    count: s.itemCount,
    subtotal: s.subtotal,
  };
}

export async function OPTIONS() {
  return gamePreflight("GET, POST, OPTIONS");
}

export async function GET() {
  return json(await cartForGame());
}

export async function POST(request: Request) {
  if (!gameOriginAllowed(request)) return json({ error: "forbidden" }, 403);
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) return json({ error: "bad_request" }, 400);

  const raw = await readGameBody(request, MAX_BODY);
  if (raw === null) return json({ error: "too_large" }, 413);
  let body: { action?: unknown; slug?: unknown; qty?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const action = body.action;
  const slug = typeof body.slug === "string" && /^[A-Za-z0-9._-]{1,200}$/.test(body.slug) ? body.slug : null;
  if (!slug || (action !== "add" && action !== "set" && action !== "remove")) return json({ error: "bad_request" }, 400);

  const cart = await getOrCreateCart();
  const line = cart.items.find((i) => i.product.slug === slug);

  if (action === "add") {
    const product = await db.product.findFirst({
      where: { slug, ...PUBLIC_PRODUCT_WHERE },
      select: { id: true, stockQty: true, stockStatus: true },
    });
    if (!product || product.stockStatus === "OUT_OF_STOCK") return json({ error: "unavailable", ...(await cartForGame()) }, 409);
    await addLineToCart(cart, product, 1);
  } else if (line) {
    const qty = action === "remove" ? 0 : Number.isInteger(body.qty) ? (body.qty as number) : -1;
    if (qty < 0) return json({ error: "bad_request" }, 400);
    if (qty === 0) await db.cartItem.delete({ where: { id: line.id } });
    else {
      const cap = Math.max(1, Math.min(line.product.stockQty, 10));
      await db.cartItem.update({ where: { id: line.id }, data: { quantity: Math.min(qty, cap) } });
    }
  }

  return json(await cartForGame());
}
