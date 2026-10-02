// Guards the terms of sale against the code they describe.
//
// The terms state numbers the shop actually charges: the free-delivery
// threshold, the cancellation fee cap, the address a cancellation notice
// may be sent to. Those numbers live in code as well — in delivery.ts and
// business.ts — and there is no mechanism that keeps the two in step. The
// failure mode is quiet and expensive: the checkout charges one thing while
// the legal page promises another, and the page is the one a customer reads
// when they are already unhappy.
//
// Nothing here checks that the policy is *right*. It checks that the
// document and the code say the same thing.
//
// Run: npm run check:terms
import { TERMS_BLOCKS, TERMS_TITLE, TERMS_UPDATED_AT } from "../src/lib/content/terms";
import { FREE_DELIVERY_THRESHOLD } from "../src/lib/delivery";
import { BUSINESS } from "../src/lib/business";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) return;
  console.log(`FAIL  ${name}${detail ? `  — ${detail}` : ""}`);
  failed++;
}

/** Every piece of text the document renders, flattened. */
const text = TERMS_BLOCKS.flatMap((b) => {
  switch (b.type) {
    case "list":
      return b.items;
    case "table":
      return [...b.head, ...b.rows.flat()];
    case "faq":
      return b.items.flatMap((i) => [i.q, i.a]);
    default:
      return [b.text];
  }
}).join("\n");

// The structure the renderer needs. A block with an unknown type falls
// through to the paragraph branch of ContentBlocks and renders
// `block.text` — which is undefined for a list, and blank on the page.
const KNOWN = new Set(["heading", "subheading", "paragraph", "list", "quote", "table", "faq"]);
check("every block has a type the renderer knows", TERMS_BLOCKS.every((b) => KNOWN.has(b.type)));
check("no empty paragraph", !TERMS_BLOCKS.some((b) => "text" in b && !b.text?.trim()));
check("no empty list item", !TERMS_BLOCKS.some((b) => b.type === "list" && b.items.some((i) => !i.trim())));
check("the document is numbered 1..40", TERMS_BLOCKS.filter((b) => b.type === "heading").length === 40);

// The numbers the shop is held to.
check(
  `the free-delivery threshold matches the checkout (${FREE_DELIVERY_THRESHOLD})`,
  text.includes(`${FREE_DELIVERY_THRESHOLD} ש"ח ומעלה`),
  "the terms name a threshold the checkout does not charge",
);

// Contact details. The cancellation section names where a notice may be
// sent, and it has to be a mailbox the shop actually reads.
check("the terms name the site's email", text.includes(BUSINESS.email));
check("the terms name the site's phone", text.includes(BUSINESS.phone));
check("the terms name the registered company", text.includes(BUSINESS.companyId));
check("the terms name the shop's street", text.includes(BUSINESS.street));
// The stand-in personal mailbox must not survive anywhere in the document.
check("no personal stand-in mailbox is left in the terms", !text.includes("aiasafidan"));

// Consumer-law figures that were checked against the statute when written.
check("14 days to cancel is stated", text.includes("14 ימים"));
check("the four-month extended window is stated", text.includes("ארבעה חודשים"));
check("the cancellation fee cap is stated", text.includes("5%") && text.includes("100 ש"));

check("the document has a title", TERMS_TITLE.length > 0);
check("the document has an update date", TERMS_UPDATED_AT.length > 0);

if (failed > 0) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log(`OK  terms agree with the code  (${TERMS_BLOCKS.length} blocks, updated ${TERMS_UPDATED_AT})`);
process.exit(0);
