/**
 * Where the phone's bottom tab bar shows.
 *
 * Everywhere in the shop except the pages whose bottom edge is already
 * spoken for: the product page carries the fixed buy bar, the checkout is
 * an enclosed flow with its own pay button, and the back office is not a
 * shop. The floating chat launcher follows the inverse rule on phones —
 * Alfred is a tab where the bar shows, and a bubble where it does not.
 */
export function showsBottomNav(pathname: string): boolean {
  return !(
    pathname.startsWith("/product/") ||
    pathname.startsWith("/product-admin/") ||
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/admin")
  );
}

/** The DOM event the Alfred tab fires to open the chat panel. */
export const ALFRED_OPEN_EVENT = "alfred:open";
