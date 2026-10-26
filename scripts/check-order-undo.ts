// "בטל — חזור ל…" and the one thing it must not offer: itself.
//
// PR-902319, 26 October, between 14:35 and 15:06. Nine presses:
//
//   PAYMENT_FAILED → PENDING → FAILED → PENDING → FAILED → PENDING → …
//
// Each undo wrote a history row, that row became the newest, and the
// button re-read the previous status off it — so it came back offering to
// undo the undo, labelled with the status just left. From the chair it is
// a button that will not hold, and that is how it was reported: "לא עובד
// לי". Nine rows of "ביטול הפעולה האחרונה" also went into the one table
// that is supposed to say what really happened to the order.
//
// The flag is what stops it, not the note: a rule that lives in free text
// is one a typo or a translation switches off, which is the same lesson
// enrichmentStatus's twelve invented values taught.
//
// Run: npx tsx scripts/check-order-undo.ts
import { undoableStep, undoTargetStatus, type StatusStep } from "../src/lib/order-undo";

let failed = 0;
let checked = 0;
const fail = (message: string) => {
  console.log(`FAIL  ${message}`);
  failed++;
};
const expect = (label: string, actual: unknown, wanted: unknown) => {
  checked++;
  if (actual !== wanted) fail(`${label}: got ${String(actual)}, wanted ${String(wanted)}`);
};

/** Newest first, as both queries select it. */
const step = (fromStatus: string | null, toStatus: string, isUndo = false): StatusStep => ({
  fromStatus,
  toStatus,
  isUndo,
});

const CREATED = step(null, "PAYMENT_PENDING");

/* ── the ordinary case ──────────────────────────────────────────────── */
expect(
  "a real step can be taken back",
  undoTargetStatus([step("PROCESSING", "SHIPPED"), step("NEW", "PROCESSING"), CREATED]),
  "PROCESSING",
);
expect(
  "and the step itself is returned",
  undoableStep([step("PROCESSING", "SHIPPED")])?.toStatus,
  "SHIPPED",
);

/* ── the founding case ──────────────────────────────────────────────── */
const afterOneUndo: StatusStep[] = [
  step("PAYMENT_FAILED", "PAYMENT_PENDING", true), // the undo that was just done
  step("PAYMENT_PENDING", "PAYMENT_FAILED"), // the gateway's failure
  CREATED,
];
expect("an undo may not be undone", undoTargetStatus(afterOneUndo), null);
expect("so the button is not offered", undoableStep(afterOneUndo), null);

/* The nine presses, built the way they really accumulated. After the fix
   only the FIRST of them can happen: every later press finds an undo on
   top and is refused. */
const ninePresses: StatusStep[] = [];
let current = "PAYMENT_FAILED";
for (let i = 0; i < 9; i++) {
  const next = current === "PAYMENT_FAILED" ? "PAYMENT_PENDING" : "PAYMENT_FAILED";
  ninePresses.unshift(step(current, next, true));
  current = next;
}
ninePresses.push(step("PAYMENT_PENDING", "PAYMENT_FAILED"), CREATED);
expect("the whole toggle is refused at the top", undoTargetStatus(ninePresses), null);
/* And at every point along it — there is no depth at which it becomes
   offerable again. */
for (let i = 0; i < 9; i++) {
  checked++;
  if (undoTargetStatus(ninePresses.slice(i)) !== null) {
    fail(`press ${9 - i} of the toggle is still offered an undo`);
  }
}

/* ── nothing to undo ────────────────────────────────────────────────── */
expect("an order that has never moved", undoTargetStatus([CREATED]), null);
expect("no history at all", undoTargetStatus([]), null);
expect("and the step is null too", undoableStep([CREATED]), null);

/* ── what must keep working ─────────────────────────────────────────── */
/* A genuine A → B → A done by hand, on purpose, is NOT an undo and is
   still offerable. This is the case a shape-based test would get wrong —
   "the last row mirrors the one before it" matches both — and the reason
   the flag is a column rather than a derivation. */
const manualRoundTrip: StatusStep[] = [
  step("PROCESSING", "NEW"),
  step("NEW", "PROCESSING"),
  CREATED,
];
expect("a deliberate round trip is still undoable", undoTargetStatus(manualRoundTrip), "PROCESSING");

/* A real step taken after an undo is undoable again: the undo is behind
   it, not on top. Otherwise one undo would disable the button for the
   rest of the order's life. */
const stepAfterUndo: StatusStep[] = [
  step("PAYMENT_PENDING", "PROCESSING"),
  step("PAYMENT_FAILED", "PAYMENT_PENDING", true),
  step("PAYMENT_PENDING", "PAYMENT_FAILED"),
  CREATED,
];
expect("a real step after an undo", undoTargetStatus(stepAfterUndo), "PAYMENT_PENDING");

/* Only the newest row is consulted. An undo six steps back says nothing
   about whether the last step may be taken back. */
const oldUndo: StatusStep[] = [
  step("SHIPPED", "DELIVERED"),
  step("PROCESSING", "SHIPPED"),
  step("NEW", "PROCESSING", true),
  CREATED,
];
expect("an old undo does not block a new step", undoTargetStatus(oldUndo), "SHIPPED");

/* The creation row can never be undone even when something marked it. */
expect("a flagged creation row", undoTargetStatus([step(null, "NEW", true)]), null);

console.log(
  `${checked - failed}/${checked} passed  (the 9-press toggle refused at every depth, ` +
    `a deliberate round trip still undoable)`,
);
process.exit(failed === 0 ? 0 : 1);
