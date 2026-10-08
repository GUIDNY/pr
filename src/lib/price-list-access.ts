/**
 * Who may see what a product cost us.
 *
 * permissions.ts says a seller is not shown the catalog, and says why: "a
 * supplier cost column and a bulk price edit are not part of getting an
 * order out the door". That rule stands for the role. This is a named
 * exception to it for two people, granted deliberately, and it is a list of
 * addresses rather than a new role on purpose — a role is something the
 * next person gets by accident, and an address is something somebody had
 * to type.
 *
 * Two of the three sellers are here. The third is not, and that is the
 * whole point of the list.
 */
const PRICE_LIST_EMAILS = ["asaf@buytoday.co.il", "amazonidan123@gmail.com"];

/** True for the named people, and for anyone who may run the catalog anyway. */
export function canSeePriceList(email: string | null | undefined, role?: string | null): boolean {
  if (role === "ADMIN" || role === "STAFF") return true;
  if (!email) return false;
  return PRICE_LIST_EMAILS.includes(email.trim().toLowerCase());
}
