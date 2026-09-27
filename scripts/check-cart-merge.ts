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

const stock = new Map([
  ["plenty", 50],
  ["scarce", 3],
  ["last-one", 1],
  ["none-left", 0],
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

/* The cap is written out in addToCartAction as well, because that file is a
   "use server" module and importing it here would pull a server action into a
   plain node process. Restating it is fine; the two drifting apart is not, and
   a merge that admits a quantity the shop would refuse to sell is exactly the
   kind of thing nobody notices until an order cannot be filled. */
console.log("\nThe cap is the same one the shop applies everywhere else");
const addToCart = readFileSync("src/actions/cart.ts", "utf8");
is(
  "addToCartAction still caps with Math.max(1, Math.min(stockQty, 10))",
  /Math\.max\(1,\s*Math\.min\(\w+(?:\.\w+)*\.stockQty,\s*10\)\)/.test(addToCart),
  true,
);

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
