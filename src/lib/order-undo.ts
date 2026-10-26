/**
 * What "בטל — חזור ל…" may take back, and when it must stop offering.
 *
 * The button reads the previous status off the order's own history, which
 * is right — inferring it from the current status ("closed probably came
 * from shipped") is how an order lands in a status it was never in. What
 * it did not do is notice that **the undo writes a history row too**, and
 * that row is then the newest one. So after undoing, the button offered to
 * undo the undo, under a label naming the status just left.
 *
 * PR-902319 is the proof, and it is not a near miss: between 14:35 and
 * 15:06 on 26 October it was pressed **nine times** and the order went
 * PAYMENT_FAILED → PENDING → FAILED → PENDING → … with no stable end. From
 * the chair it reads as a button that will not hold, which is exactly how
 * it was reported: "לא עובד לי". Nine rows of "ביטול הפעולה האחרונה" also
 * went into the one table that is supposed to say what really happened to
 * this order.
 *
 * So an undo is a step of a different kind, and `isUndo` on the row says
 * so. Not a note anybody has to match on — `enumerationStatus`'s twelve
 * invented values are what happens when meaning lives in free text — and
 * not derived from the shape either: a genuine A → B → A done by hand on
 * purpose looks identical to an undo, and the two deserve different
 * answers.
 */

export type StatusStep = {
  fromStatus: string | null;
  toStatus: string;
  /** Written by undoLastStatusAction and by nothing else. */
  isUndo: boolean;
};

/**
 * The step the undo button would take back, or null when there is none.
 *
 * `history` is newest first, as both queries select it.
 *
 * Null for three reasons, and they are different reasons: the order has
 * never moved, the first entry has no `fromStatus` because it is the
 * order's creation, or the last thing that happened was itself an undo.
 * The caller does not need to tell them apart — in all three the button
 * is simply not offered.
 */
export function undoableStep(history: StatusStep[]): (StatusStep & { fromStatus: string }) | null {
  const last = history[0];
  if (!last) return null;
  /* The creation row. There is no state before an order existed. */
  if (!last.fromStatus) return null;
  /* One level, deliberately. Undo is for the click that was just a
     mistake, not a way to walk an order backwards through its whole life —
     and a button that can be pressed repeatedly with a different meaning
     each time is one nobody can predict. Going further back is what the
     status selector is for, where the person chooses the status by name
     and the history records that they did. */
  if (last.isUndo) return null;
  /* The guard above is what makes `fromStatus` a string, and the return
     type says so — the caller writes it straight into Order.status. */
  return { ...last, fromStatus: last.fromStatus };
}

/** What the button should offer to return to, or null to hide it. */
export function undoTargetStatus(history: StatusStep[]): string | null {
  return undoableStep(history)?.fromStatus ?? null;
}
