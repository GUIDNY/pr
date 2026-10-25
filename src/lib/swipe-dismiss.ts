"use client";

import { useRef } from "react";
import type { TouchEvent } from "react";

/**
 * Swipe a drawer shut.
 *
 * Radix's Dialog — what every Sheet in here is — closes on the overlay, on
 * Escape and on the X. On a phone the gesture people actually reach for is
 * none of those: the drawer came in from the side, so they push it back.
 * Nothing happened, and the way out was a small X in the far corner, which
 * on a 6-inch screen is the one place a thumb holding the phone cannot
 * reach.
 *
 * Deliberately not a drag that the panel follows. Following the finger means
 * writing a transform onto an element whose enter and exit are Radix's own
 * animations, and a panel that is mid-transform when the dialog unmounts
 * jumps. The gesture is recognised on release instead: less satisfying than
 * a panel that tracks the thumb, and it cannot leave the drawer stuck
 * halfway.
 *
 * Either direction closes it, which is what was asked for and is also the
 * forgiving reading — a drawer on the right of an RTL page is pushed right
 * by some people and flicked left by others, and both mean the same thing.
 *
 * THE TWO GUARDS ARE THE WHOLE DESIGN. A drawer is a scrolling list, so a
 * gesture that closes it must be sure it is not a scroll:
 *
 *   - 64px of travel, which is far enough that no tap and no scroll start
 *     reaches it by accident;
 *   - and more sideways than up-down by half again, so a thumb dragging the
 *     list at a slight angle — which is every real scroll — is never read as
 *     a swipe.
 *
 * Multi-touch is dropped at the start: two fingers on a drawer is a pinch or
 * a browser gesture, not this.
 */

const MIN_DISTANCE = 64;
const DIRECTION_RATIO = 1.5;

/**
 * Was that a swipe, or was it the list being scrolled?
 *
 * Exported so the thresholds can be asserted against real gestures without a
 * browser — see check:swipe. The hook below is the only caller.
 */
export function isDismissSwipe(dx: number, dy: number): boolean {
  if (Math.abs(dx) < MIN_DISTANCE) return false;
  return Math.abs(dx) >= Math.abs(dy) * DIRECTION_RATIO;
}

export function useSwipeDismiss(onDismiss: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);

  return {
    onTouchStart: (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        start.current = null;
        return;
      }
      start.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    },
    /* A second finger arriving mid-gesture cancels it rather than letting
       the first finger's release be measured against a stale origin. */
    onTouchMove: (event: TouchEvent) => {
      if (event.touches.length > 1) start.current = null;
    },
    onTouchEnd: (event: TouchEvent) => {
      const from = start.current;
      start.current = null;
      if (!from || event.changedTouches.length === 0) return;
      const dx = event.changedTouches[0].clientX - from.x;
      const dy = event.changedTouches[0].clientY - from.y;
      if (isDismissSwipe(dx, dy)) onDismiss();
    },
    onTouchCancel: () => {
      start.current = null;
    },
  };
}
