import type { UserRole } from "@/lib/enums";

/**
 * Who may reach what in the back office.
 *
 * One file, because the alternative is already visible in this codebase's
 * history: `role !== "ADMIN" && role !== "STAFF"` was written out at eleven
 * call sites, and adding a third role means finding all eleven and getting
 * every one of them right. The ones that are easy to find are the layout and
 * the login page. The ones that are not are the inventory sync route and the
 * checkout test panel — and those are exactly the two where a wrong answer
 * hands a salesperson the supplier price sheet and a live card terminal.
 *
 * So the rule is: no route, action or component asks about a role. It asks
 * one of these questions.
 */

/** Everyone who gets past /admin at all. */
export function isBackOffice(role: UserRole | string | undefined | null): boolean {
  return role === "ADMIN" || role === "STAFF" || role === "SELLER";
}

/**
 * The shop itself — products, stock, prices, suppliers, promotions, the
 * chatbot, the sync. Everything whose numbers a salesperson has no reason to
 * see and no business changing.
 *
 * This is the question the sync route and the product editor ask, and the
 * answer for a seller is no. Not because they are untrusted: because a
 * supplier cost column and a bulk price edit are not part of getting an
 * order out the door, and the smallest surface that does the job is the one
 * that cannot be misused by accident.
 */
export function canManageCatalog(role: UserRole | string | undefined | null): boolean {
  return role === "ADMIN" || role === "STAFF";
}

/**
 * Turning an order into a delivered order: reading it, moving its status,
 * approving its payment, closing it.
 *
 * Deliberately the same answer as isBackOffice. A seller exists to do this
 * and nothing else, so the two questions coincide today — they are separate
 * functions because they are separate questions, and the day a role appears
 * that may enter the back office without touching orders (a bookkeeper, a
 * copywriter) this is where that is expressed.
 */
export function canHandleOrders(role: UserRole | string | undefined | null): boolean {
  return isBackOffice(role);
}

/**
 * Where a back-office session lands, and what it is offered.
 *
 * A seller opening /admin would otherwise get the dashboard, which is
 * revenue, stock alerts and the day's takings — a page built to answer
 * questions they were not given.
 */
export function backOfficeHome(role: UserRole | string | undefined | null): string {
  return canManageCatalog(role) ? "/admin" : "/admin/orders";
}
