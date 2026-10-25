// The Google Pay button slid the payment sheet off the side of the phone.
//
// Choosing Google Pay made the gateway's form 452px wide inside a 390px
// viewport — the amount off the edge, the tile the customer had just tapped
// scrolled out of view, the pay button a 45px sliver. Nothing reported it:
// the page answers 200, the form works, and only a video of a thumb dragging
// the page sideways showed it at all.
//
// The cause was 76px of overflow with nowhere to go, and the reason it was
// invisible here is worth more than the fix. preview.html — the harness this
// repo keeps precisely so that the payment page can be worked on offline —
// had the four buttons of the submit row in the wrong order. The gateway puts
// cancel SECOND; the harness had it last. That put #googlePayButton at the
// right end of an RTL row instead of the left end, and the identical overflow
// landed inside the page instead of outside the document. The harness could
// not fail, which the file's own header already warns is worse than having
// none.
//
// So this asserts the two things that made it possible: the order of that row
// against the gateway's own HTML, and the rules that give the wallet button a
// line wide enough for it.
//
// Run: npx tsx scripts/check-wallet-row.ts
import { readFileSync } from "node:fs";

const preview = readFileSync("public/pelecard/preview.html", "utf8");
const css = readFileSync("public/pelecard/ai-orange.css", "utf8");

let failed = 0;
const fail = (message: string) => {
  console.log(`FAIL  ${message}`);
  failed++;
};

/* Read from the live form at gateway21 on 24 October 2026, for a real
   transaction. Re-fetch before changing it — the recipe is in the wallet
   section of ai-orange.css. */
const GATEWAY_ORDER = ["submitBtn", "cancelBtn", "applePayButton", "googlePayButton"];

const row = preview.slice(preview.indexOf('id="submitRow"'), preview.indexOf("</form>"));
if (!row) fail("preview.html has no #submitRow — the harness no longer reproduces the page it is for");

const order = [...row.matchAll(/id="([^"]+)"/g)].map((m) => m[1]).filter((id) => GATEWAY_ORDER.includes(id));
if (order.join(",") !== GATEWAY_ORDER.join(",")) {
  fail(
    `preview.html's submit row is ${order.join(" → ") || "(empty)"}; the gateway's is ` +
      `${GATEWAY_ORDER.join(" → ")}. In RTL the last child is the leftmost, so a wrong order ` +
      `moves where a wallet's overflow lands and the harness stops being able to fail.`,
  );
}

/* The rules that make the row survive a 240px button. Matched as text, which
   is all a check without a browser can do — the measurement behind them is in
   the stylesheet's own comment. */
const RULES: [string, RegExp, string][] = [
  [
    "the submit row wraps",
    /\.form-group-submit-in\s*\{[^}]*flex-wrap:\s*wrap/,
    "without it the wallet button cannot have a line of its own and overflows its 164px share",
  ],
  [
    "the wallet holder takes a whole line",
    /#googlePayButton\s*\{[^}]*flex:\s*1\s+1\s+100%/,
    "a flex-basis of 0 gives it a quarter of the row and Google's 240px button leaves the page",
  ],
  [
    "the wallet button sits above cancel",
    /#googlePayButton\s*\{[^}]*order:\s*-1/,
    "once they are on separate lines the primary action belongs on the first one",
  ],
  [
    "the wallet button cannot exceed its line",
    /#googlePayButton\s*>\s*\*\s*\{[^}]*max-width:\s*100%/,
    "the backstop if Google ever ship a button wider than the row",
  ],
];
for (const [label, pattern, why] of RULES) {
  if (!pattern.test(css)) fail(`ai-orange.css no longer says ${label} — ${why}`);
}

/* And the backstop must stay a backstop. `min-width: 0` on Google's own
   button lets it collapse to the width of its label, which is a worse
   failure than the one being fixed and looks like a working page. */
if (/#googlePayButton\s*>\s*\*\s*\{[^}]*min-width:\s*0/.test(css)) {
  fail("ai-orange.css sets min-width: 0 inside the Google Pay button — it would shrink to its label");
}

const total = 1 + RULES.length + 1;
console.log(
  `${total - failed}/${total} passed  (the submit row's order against the gateway's, ` +
    `${RULES.length} layout rules, no min-width override)`,
);
process.exit(failed === 0 ? 0 : 1);
