/**
 * Payment presentation and arithmetic — NO database, NO `server-only`.
 *
 * Split out because `PaymentsPanel` is a client component and needs the
 * labels and the status rule. Importing them from the server module pulled
 * `server-only` into the browser bundle and broke `npm run build` while
 * TypeScript and ESLint stayed green — the same trap `recurring.ts` fell
 * into. Keep it that way: nothing in this file may touch the database.
 *
 * What has actually been paid against a reservation.
 *
 * The reservation carries the amount owed; this carries the money received.
 * Keeping them apart is the whole point — "zapłacono 1 000 z 2 850" is a
 * sentence a flag cannot say, and part-payment is the normal case here: a
 * deposit on booking, the balance at handover.
 */

export type PaymentStatus = "paid" | "partial" | "unpaid" | "overdue";

export type PaymentSummary = {
  totalGrosze: number;
  paidGrosze: number;
  outstandingGrosze: number;
  status: PaymentStatus;
};

/**
 * Where a reservation stands financially.
 *
 * `overdue` is not a fourth colour for its own sake: it is money owed on a
 * rental that has already started, which is the only case somebody has to
 * chase today. Anything owed on a booking that has not begun is simply
 * unpaid, and that is fine.
 */
export function summarise(
  totalGrosze: number,
  paidGrosze: number,
  startDate: string,
  today = new Date().toISOString().slice(0, 10),
): PaymentSummary {
  const outstanding = Math.max(0, totalGrosze - paidGrosze);
  const started = startDate <= today;
  const status: PaymentStatus =
    outstanding === 0 && totalGrosze > 0
      ? "paid"
      : started && outstanding > 0
        ? "overdue"
        : paidGrosze > 0
          ? "partial"
          : "unpaid";
  return {
    totalGrosze,
    paidGrosze,
    outstandingGrosze: outstanding,
    status,
  };
}

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  paid: "Zapłacone",
  partial: "Częściowo",
  unpaid: "Nieopłacone",
  overdue: "Po terminie",
};

/** Green settled, amber part-paid, red owed on a rental already running. */
export const PAYMENT_STATUS_TONE: Record<PaymentStatus, string> = {
  paid: "border-emerald-400/50 text-emerald-400",
  partial: "border-amber-400/50 text-amber-400",
  unpaid: "border-line text-ink-faint",
  overdue: "bg-red text-white",
};

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: "Gotówka",
  card: "Karta",
  transfer: "Przelew",
  online: "Online",
};
