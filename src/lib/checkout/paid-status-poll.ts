import { customerHasPaid } from "@/lib/order-signal";

/** How often the open card form asks whether the payment has already gone
    through, and for how long — the form itself expires well inside an hour. */
export const STATUS_POLL_EVERY_MS = 3_000;
export const STATUS_POLL_FOR_MS = 60 * 60 * 1000;

/** Where a paid order's customer is sent: the same page frame-return reaches. */
export function paidConfirmationPath(orderNumber: string): string {
  return `/checkout/success/${encodeURIComponent(orderNumber)}`;
}

type Deps = {
  /** Resolves to the order's paymentStatus, or null when it could not be read. */
  fetchStatus: (orderNumber: string) => Promise<string | null>;
  /** Called once, with the confirmation path, when the payment is taken or held. */
  onPaid: (path: string) => void;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
  everyMs?: number;
  forMs?: number;
};

/**
 * Ask the server every few seconds whether this order is paid, and leave for
 * the confirmation as soon as it is — without waiting for the payment frame to
 * come back. Returns a stop function. A pending, declined or unreadable status
 * changes nothing; only AUTHORIZED or CAPTURED (customerHasPaid) acts.
 */
export function startPaidStatusPoll(orderNumber: string, deps: Deps): () => void {
  const now = deps.now ?? Date.now;
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>));
  const every = deps.everyMs ?? STATUS_POLL_EVERY_MS;
  const forMs = deps.forMs ?? STATUS_POLL_FOR_MS;
  const startedAt = now();
  let stopped = false;
  let timer: unknown;

  const poll = async () => {
    if (stopped) return;
    let status: string | null = null;
    try {
      status = await deps.fetchStatus(orderNumber);
    } catch {
      /* a failed poll is not a failed payment: ask again */
    }
    if (stopped) return;
    if (status && customerHasPaid(status)) {
      stopped = true;
      deps.onPaid(paidConfirmationPath(orderNumber));
      return;
    }
    if (now() - startedAt < forMs) timer = setTimer(poll, every);
  };
  timer = setTimer(poll, every);

  return () => {
    stopped = true;
    clearTimer(timer);
  };
}
