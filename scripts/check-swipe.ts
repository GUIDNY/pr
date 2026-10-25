// A drawer that closes when it should not is worse than one that does not
// close at all.
//
// The gesture is two numbers — how far sideways, how far up — and the whole
// risk is on one side of it: a shopper scrolling the department list with a
// thumb that drifts, and the menu vanishing under their hand mid-scroll.
// Every "must not close" case below is a scroll or a tap; every "must close"
// is a push at the panel. The numbers are the thumb-sized ones: a real swipe
// on a phone travels well past 100px, a scroll drifts sideways by 10 or 20.
//
// Run: npx tsx scripts/check-swipe.ts
import { isDismissSwipe } from "../src/lib/swipe-dismiss";

let failed = 0;
const fail = (message: string) => {
  console.log(`FAIL  ${message}`);
  failed++;
};

/* [label, dx, dy] — dx positive is toward the right edge, the one this
   drawer comes in from. */
const CLOSES: [string, number, number][] = [
  ["pushed back toward its edge", 140, 0],
  ["flicked the other way", -140, 0],
  ["a push with a little drift", 120, 40],
  ["the shortest travel that counts", 64, 0],
  ["diagonal, but mostly sideways", 90, 55],
];

const STAYS: [string, number, number][] = [
  ["a tap", 0, 0],
  ["a tap that wobbled", 6, 4],
  ["scrolling the list down", 0, 300],
  ["scrolling up", 0, -260],
  ["a scroll with a drifting thumb", 18, 240],
  ["a long diagonal drag that is still a scroll", 70, 200],
  ["a nudge, far too short", 40, 0],
  ["one pixel short of the threshold", 63, 0],
  ["sideways, but not sideways enough", 70, 60],
];

for (const [label, dx, dy] of CLOSES) {
  if (!isDismissSwipe(dx, dy)) fail(`the drawer would not close on ${label} (dx=${dx}, dy=${dy})`);
}
for (const [label, dx, dy] of STAYS) {
  if (isDismissSwipe(dx, dy)) fail(`the drawer would close on ${label} (dx=${dx}, dy=${dy}) — that is a scroll, not a swipe`);
}

/* Symmetry, asserted rather than assumed: both directions were asked for,
   and a sign slipped into one comparison would only show on one of them. */
for (const [label, dx, dy] of [...CLOSES, ...STAYS]) {
  if (isDismissSwipe(dx, dy) !== isDismissSwipe(-dx, dy)) {
    fail(`${label} behaves differently mirrored (dx=${dx} vs ${-dx})`);
  }
  if (isDismissSwipe(dx, dy) !== isDismissSwipe(dx, -dy)) {
    fail(`${label} behaves differently flipped vertically (dy=${dy} vs ${-dy})`);
  }
}

const total = CLOSES.length + STAYS.length + (CLOSES.length + STAYS.length) * 2;
console.log(
  `${total - failed}/${total} passed  (${CLOSES.length} swipes close it, ${STAYS.length} scrolls and taps do not, ` +
    `both mirrored)`,
);
process.exit(failed === 0 ? 0 : 1);
