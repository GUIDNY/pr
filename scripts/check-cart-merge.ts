/**
 * The cart survives signing in.
 *
 * A guest's cart is keyed by a cookie and an account's by userId, so the
 * instant a session cookie exists the shop stops looking at the cookie and
 * asks for a cart the account does not have yet. The customer sees "אין
 * פריטים בעגלה" over a cart that is still in the database, and there is
 * nothing they can do about it. That is the bug this guards, and it is not a
 * cosmetic one: it lands on the customers who were furthest along.
 *
 * Two halves, both checked here:
 *
 *   - the arithmetic of a merge, when the account already had a cart of its
 *     own. Quantities add and are capped, a product that disappeared is
 *     dropped, and a line already at the cap produces no write at all.
 *   - the wiring. Every path that opens a session has to claim the cart, and
 *     the list of those paths grows — Google, Apple, the app's two native
 *     routes, the password form, registration, a password reset. This walks
 *     the source and fails on a createSession() that is not followed by a
 *     claimGuestCart(), so the next sign-in method somebody adds cannot
 *     quietly reintroduce this.
 *
 * No database and no network. This project's database is not reachable from
 * the containers these agents run in, so a check that needs a connection is a
 * check that never runs.
 *
 *   npm run check:cart
 */

import { readFileSync } from "fs";
import { planCartMerge, maxCartQuantity } from "../src/lib/cart-merge";

let failures = 0;

function is(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  const ok = g === w;
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${ok ? "" : `\n          got  ${g}\n          want ${w}`}`);
}

/* The map carries availability beside the quantity since 19 October: a
   product the price list still offers is sellable with nothing on hand, and
   the cap for one of those is the flat line limit rather than the stock. */
const stock = new Map<string, { qty: number; availability?: string | null }>([
  ["plenty", { qty: 50 }],
  ["scarce", { qty: 3 }],
  ["last-one", { qty: 1 }],
  ["none-left", { qty: 0 }],
  // No unit in any warehouse, and orderable from the supplier: a customer may
  // take as many as the line cap allows, exactly as with "plenty".
  ["from-supplier", { qty: 0, availability: "ORDERABLE" }],
  // Marked gone in the price list with nothing left. Stock is the real limit.
  ["gone-for-good", { qty: 0, availability: "END_OF_LINE" }],
]);

console.log("\nAn account with no cart of its own is the common case, and the\nguest cart is simply re-keyed — nothing here runs for it.");

console.log("\nItems the account did not have are carried across");
is(
  "a straightforward line",
  planCartMerge([{ productId: "plenty", quantity: 2 }], [], stock),
  { updates: [], creates: [{ productId: "plenty", quantity: 2 }] },
);
is(
  "more than the shelf holds is trimmed to it",
  planCartMerge([{ productId: "scarce", quantity: 9 }], [], stock),
  { updates: [], creates: [{ productId: "scarce", quantity: 3 }] },
);
is(
  "and never past ten, however deep the shelf",
  planCartMerge([{ productId: "plenty", quantity: 40 }], [], stock),
  { updates: [], creates: [{ productId: "plenty", quantity: 10 }] },
);

console.log("\nThe same product in both carts adds up");
is(
  "two here and one there is three",
  planCartMerge([{ productId: "plenty", quantity: 2 }], [{ id: "a", productId: "plenty", quantity: 1 }], stock),
  { updates: [{ itemId: "a", quantity: 3 }], creates: [] },
);
is(
  "the sum is capped like any other quantity",
  planCartMerge([{ productId: "plenty", quantity: 8 }], [{ id: "a", productId: "plenty", quantity: 5 }], stock),
  { updates: [{ itemId: "a", quantity: 10 }], creates: [] },
);
is(
  "a line already at the cap writes nothing",
  planCartMerge([{ productId: "scarce", quantity: 2 }], [{ id: "a", productId: "scarce", quantity: 3 }], stock),
  { updates: [], creates: [] },
);

console.log("\nWhat is no longer sellable does not come back");
is(
  "a product that vanished from the catalogue is dropped",
  planCartMerge([{ productId: "deleted", quantity: 1 }], [], stock),
  { updates: [], creates: [] },
);
is(
  "and it does not take the rest of the cart with it",
  planCartMerge(
    [
      { productId: "deleted", quantity: 1 },
      { productId: "plenty", quantity: 2 },
    ],
    [],
    stock,
  ),
  { updates: [], creates: [{ productId: "plenty", quantity: 2 }] },
);

console.log("\nEdges");
is("an empty guest cart plans nothing", planCartMerge([], [{ id: "a", productId: "plenty", quantity: 1 }], stock), {
  updates: [],
  creates: [],
});
is(
  "a line whose stock ran out is kept at one, not multiplied",
  planCartMerge([{ productId: "none-left", quantity: 4 }], [], stock),
  { updates: [], creates: [{ productId: "none-left", quantity: 1 }] },
);
is("the cap of an empty shelf is one, not zero", maxCartQuantity(0), 1);
is("the cap of a deep shelf is ten", maxCartQuantity(999), 10);

is("a supplier-drawn line may reach the full cap", maxCartQuantity(0, "ORDERABLE"), 10);
is("a line the price list has dropped is still capped by its stock", maxCartQuantity(0, "END_OF_LINE"), 1);
is(
  "a supplier-drawn guest line is carried across in full",
  planCartMerge([{ productId: "from-supplier", quantity: 4 }], [], stock),
  { updates: [], creates: [{ productId: "from-supplier", quantity: 4 }] },
);
is(
  "a dropped line with nothing left is kept at one",
  planCartMerge([{ productId: "gone-for-good", quantity: 4 }], [], stock),
  { updates: [], creates: [{ productId: "gone-for-good", quantity: 1 }] },
);

/* The cap used to be written out by hand in five places — the add action, the
   update action, the merge, the cart summary and the product page — because
   `src/actions/cart.ts` is a "use server" module and importing *it* here
   would pull a server action into a plain node process. So this check read
   the formula back out of the file as text and asserted the two copies still
   matched.

   They no longer need to match, because there is no longer a second copy: the
   cap lives in maxCartQuantity() above, in a plain module every one of those
   five can import. The check that matters now is the opposite one — that
   nobody has gone back to spelling it out, which is how the five copies
   happened in the first place. A hand-rolled cap in any of them would also
   miss what the shared one learned on 19 October: a product drawn from the
   supplier has a stockQty of zero and may still be bought by the handful. */
console.log("\nThe cap is the same one the shop applies everywhere else");
const CAP_CALLERS = [
  "src/actions/cart.ts",
  "src/lib/cart.ts",
  "src/lib/cart-summary.ts",
  "src/components/product/product-page-view.tsx",
];
const HAND_ROLLED = /Math\.max\(1,\s*Math\.min\([^)]*stockQty[^)]*,\s*10\)\)/;
for (const file of CAP_CALLERS) {
  const src = readFileSync(file, "utf8");
  is(`${file} asks maxCartQuantity for the cap`, src.includes("maxCartQuantity("), true);
  is(`${file} does not spell the cap out itself`, HAND_ROLLED.test(src), false);
}

/* Every door into the shop has to hand the cart over on the way through. The
   check is deliberately dumb — a createSession() with no claimGuestCart()
   within a few lines of it — because the failure it prevents is somebody
   adding a seventh sign-in method and not knowing this exists. */
console.log("\nEvery sign-in path claims the cart");
const SIGN_IN_FILES = [
  "src/actions/auth.ts",
  "src/app/api/auth/google/callback/route.ts",
  "src/app/api/auth/apple/callback/route.ts",
  "src/app/api/auth/google/native/route.ts",
  "src/app/api/auth/apple/native/route.ts",
];

let sessionsSeen = 0;
for (const file of SIGN_IN_FILES) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (!/await createSession\(/.test(line)) return;
    sessionsSeen++;
    const window = lines.slice(i, i + 8).join("\n");
    is(`${file}:${i + 1} claims the cart`, /claimGuestCart\(/.test(window), true);
  });
}
is("all seven sign-in paths were found", sessionsSeen, 7);

console.log(failures === 0 ? "\nThe cart survives signing in.\n" : `\n${failures} cart-merge rule(s) BROKEN.\n`);
process.exit(failures === 0 ? 0 : 1);
