/**
 * The 3D mall and the shop, talking to each other.
 *
 * The game is a static site at play.buytoday.co.il, and the shop also serves
 * it at /mall (the rewrite in next.config.ts) so the iOS app keeps it inside
 * its WebView. Three things cross between them, and all of them live here so
 * the addresses and message shapes are written once:
 *
 *   The way in. A link to the game is a different address depending on where
 *   the customer is holding the shop — see mallHref.
 *
 *   Embed mode. The game opens a product page in an <iframe
 *   name="bt-mall-embed"> over the mall, so a customer can look at the real
 *   thing without leaving the game. Inside that frame the page is the
 *   product and nothing else: no header, no footer, no tab bar, no launchers.
 *   Everything that means "you are done browsing now" — cart, checkout,
 *   login, account — leaves the frame for the whole window, and a successful
 *   add to cart is reported to the game so it can react to it.
 *
 *   The way back. A customer who followed a product from the game onto the
 *   shop proper gets a small pill that takes them back to the mall.
 *
 * No "use client" on purpose: the boot script below is a plain string the
 * root layout (a server component) puts in <head>.
 */

/** Where the game lives on the web. */
export const MALL_WEB_ORIGIN = "https://play.buytoday.co.il";

/** The iframe name the game gives the frame it opens product pages in. */
export const MALL_EMBED_FRAME_NAME = "bt-mall-embed";

/** The utm_source the game stamps on every link into the shop. */
export const MALL_GAME_UTM_SOURCE = "closing-time-game";

/** sessionStorage key: this tab arrived on the shop from the game. */
export const FROM_MALL_KEY = "bt-from-mall";

/** Fired on window whenever FROM_MALL_KEY changes, so the pill can follow. */
export const FROM_MALL_EVENT = "bt-from-mall-change";

/**
 * The address of the game for a link on the shop.
 *
 * In the app it is /mall, this host, in the same view: the WebView hands
 * every other host — and anything with target="_blank" — to Safari, and the
 * customer is out of the app. On the web it is the game's own address, which
 * is the one that should collect the visits and the search ranking.
 *
 * `medium` is where on the shop the link sits (footer, header, home), so the
 * campaign report tells the entrances apart; utm_source tells app from web.
 */
export function mallHref(medium: string, inApp: boolean): string {
  return inApp
    ? `/mall?utm_source=app&utm_medium=${medium}&utm_campaign=3d-mall`
    : `${MALL_WEB_ORIGIN}/?utm_source=buytoday&utm_medium=${medium}&utm_campaign=3d-mall`;
}

/**
 * Embed mode, decided before the first paint.
 *
 * An inline script in <head>, like the accessibility one beside it, because
 * the alternative is an effect — and an effect runs after the header, the
 * footer and the tab bar have already been painted inside the game's frame,
 * so every product opened from the mall would flash the whole site first.
 * The CSS that does the hiding keys on the attribute this sets
 * (html[data-embed="mall"] in globals.css), so the server-rendered pages stay
 * exactly as static and cacheable as they are: nothing about them differs
 * between the frame and the web, only which parts the browser shows.
 *
 * Both conditions, never one. `window.self !== window.top` alone would be
 * true for anybody who frames the shop, and `window.name` alone survives in a
 * tab that was once named by something else. The frame's name is the
 * durable half: it is a property of the browsing context rather than of the
 * document, so it survives every navigation inside that frame — the product
 * the customer clicks through to from the first one is still embedded.
 *
 * Deliberately not sessionStorage. In the app the game runs at
 * buytoday.co.il/mall, so the frame is same-origin with the top page and
 * shares its sessionStorage — a flag set there would hide the header on the
 * shop itself the next time the customer left the game.
 *
 * The comparison is allowed across origins: comparing two WindowProxy objects
 * reads nothing from the other document.
 */
export const MALL_EMBED_BOOT_SCRIPT = `(function(){try{if(window.self!==window.top&&window.name===${JSON.stringify(
  MALL_EMBED_FRAME_NAME,
)})document.documentElement.setAttribute("data-embed","mall")}catch(e){}})()`;

/** Same test as the boot script, for code that runs after it. */
export function isMallEmbed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.self !== window.top && window.name === MALL_EMBED_FRAME_NAME;
  } catch {
    return false;
  }
}

/**
 * The paths that end the "looking at a product" part of a visit. In the
 * game's frame these open in the whole window instead: a checkout squeezed
 * into a modal over a 3D scene is not somewhere anyone should type a card
 * number, and a login inside it would sign in a frame the customer then
 * closes.
 */
const TOP_LEVEL_PATHS = /^\/(cart|checkout|login|register|account)(\/|$)/;

export function leavesMallFrame(pathname: string): boolean {
  return TOP_LEVEL_PATHS.test(pathname);
}

/**
 * Navigate to a shop path — out of the game's frame when embedded, as an
 * ordinary navigation otherwise. Returns true when it navigated the top
 * window, so a caller with a router can fall back to it when it did not.
 *
 * `location.href =` and not `location.assign()`: from play.buytoday.co.il the
 * top window is another origin, and setting href is the one navigation the
 * browser allows on a cross-origin Location (assign() throws). The URL is
 * made absolute against the frame, because "/checkout" resolved by the top
 * window would be the game's own address. Browsers only let a frame move the
 * page above it right after a tap, which is the only time this is called.
 */
export function navigateOutOfMallFrame(path: string): boolean {
  if (!isMallEmbed()) return false;
  try {
    window.top!.location.href = new URL(path, window.location.href).href;
    return true;
  } catch {
    return false;
  }
}

/** The messages the frame sends up to the game. */
export type MallFrameMessage =
  | { type: "bt-mall:ready" }
  | { type: "bt-mall:added"; slug: string; name: string; price: number };

/**
 * Post to the game, when embedded.
 *
 * Twice, each time with one explicit origin, never "*": the game is either
 * play.buytoday.co.il (the web) or this shop's own origin (/mall, the app).
 * A postMessage whose targetOrigin does not match the parent is dropped by
 * the browser without an error, so exactly one of the two arrives — and
 * nothing is ever handed to a page that merely framed the shop under the
 * right name.
 */
export function postToMall(message: MallFrameMessage): void {
  if (!isMallEmbed()) return;
  for (const origin of new Set([MALL_WEB_ORIGIN, window.location.origin])) {
    try {
      window.parent.postMessage(message, origin);
    } catch {
      /* A malformed origin is the only way this throws; nothing to do. */
    }
  }
}

/**
 * Tell the game what just went into the cart, from the cart the server
 * handed back — its slug, title and price are the server's, not whatever
 * the page happened to be showing.
 */
export function reportAddedToMall(
  summary: { items: { productId: string; slug: string; title: string; price: number }[] },
  productId: string,
): void {
  if (!isMallEmbed()) return;
  const line = summary.items.find((i) => i.productId === productId);
  if (!line) return;
  postToMall({ type: "bt-mall:added", slug: line.slug, name: line.title, price: line.price });
}
