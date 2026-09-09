/**
 * Deposit presentation and arithmetic — NO database, NO `server-only`.
 *
 * Split for the same reason as `payment-options.ts`: `DepositPanel` is a
 * client component, and importing the labels from the server module would
 * drag `server-only` into the browser bundle and break `npm run build` while
 * TypeScript and ESLint stayed green. Nothing in this file may touch the
 * database.
 *
 * What a deposit is, in this system: the customer's money, held as security
 * and owed back unless something went wrong. That single sentence decides the
 * whole design — the state is derived from a log, never overwritten, so the
 * question asked weeks later ("who let it go, and when?") still has an answer.
 */

export const DEPOSIT_STATUSES = [
  "to_take",
  "held",
  "blocked",
  "to_return",
  "returned",
  "partially_kept",
] as const;

export type DepositStatus = (typeof DEPOSIT_STATUSES)[number];

export const DEPOSIT_STATUS_LABEL: Record<DepositStatus, string> = {
  to_take: "Do pobrania",
  held: "Pobrana",
  blocked: "Zablokowana",
  to_return: "Do zwrotu",
  returned: "Zwrócona",
  partially_kept: "Częściowo zatrzymana",
};

export const DEPOSIT_STATUS_HINT: Record<DepositStatus, string> = {
  to_take: "Klient jeszcze nic nie wpłacił",
  held: "Pieniądze klienta są u nas",
  blocked: "Blokada na karcie klienta — pieniądze nie są nasze",
  to_return: "Najem skończony, kaucja należy się klientowi",
  returned: "Oddana w całości",
  partially_kept: "Część zatrzymana, reszta oddana",
};

/**
 * Amber while we are holding somebody else's money, red when we owe it back
 * today, green once it is settled. `partially_kept` is deliberately NOT green:
 * it is closed, but it is the one case a customer may come back about.
 */
export const DEPOSIT_STATUS_TONE: Record<DepositStatus, string> = {
  to_take: "border-line text-ink-faint",
  held: "border-amber-400/50 text-amber-400",
  blocked: "border-sky-400/50 text-sky-400",
  to_return: "bg-red text-white",
  returned: "border-emerald-400/50 text-emerald-400",
  partially_kept: "border-amber-400/50 text-amber-400",
};

/** Which steps actually move money, and therefore need an amount. */
export const DEPOSIT_TAKES_AMOUNT: Record<DepositStatus, boolean> = {
  to_take: false,
  held: true,
  blocked: true,
  to_return: false,
  returned: true,
  partially_kept: true,
};

export type DepositEvent = {
  id: string;
  status: DepositStatus;
  amountGrosze: number;
  keptGrosze: number;
  method: string | null;
  note: string | null;
  createdAt: string;
  by: string | null;
};

export type DepositSummary = {
  /** Where it stands now, or `null` when this rental has no deposit at all. */
  status: DepositStatus | null;
  /** What the reservation says the deposit is worth. */
  dueGrosze: number;
  /** Customer money we are holding right now (cash in the till or a card hold). */
  securedGrosze: number;
  /** Given back over the life of this deposit. */
  returnedGrosze: number;
  /** Retained by the firm — damage, fuel, a fine. */
  keptGrosze: number;
};

/**
 * Where one deposit stands, worked out from its log.
 *
 * `secured` is a plain running sum rather than a reading of the last row,
 * because a deposit can legitimately be taken in two goes (part in cash at
 * handover, the rest blocked on a card) and a "latest row wins" rule would
 * quietly lose the first one.
 *
 * The status, by contrast, IS the latest row: it is a statement about the
 * present, and the operator who wrote it last is the one who knows.
 */
export function summariseDeposit(
  dueGrosze: number,
  variant: string,
  events: readonly DepositEvent[],
): DepositSummary {
  let secured = 0;
  let returned = 0;
  let kept = 0;

  for (const e of events) {
    if (e.status === "held" || e.status === "blocked") secured += e.amountGrosze;
    else if (e.status === "returned") {
      secured -= e.amountGrosze;
      returned += e.amountGrosze;
    } else if (e.status === "partially_kept") {
      secured -= e.amountGrosze + e.keptGrosze;
      returned += e.amountGrosze;
      kept += e.keptGrosze;
    }
  }

  // No deposit on this rental and nothing ever recorded → there is no state to
  // report. Saying "do pobrania" about a no-deposit rental would put a job on
  // the operator's list that nobody is ever meant to do.
  const applies = events.length > 0 || (variant !== "no_deposit" && dueGrosze > 0);
  const status: DepositStatus | null = events.length
    ? events[events.length - 1].status
    : applies
      ? "to_take"
      : null;

  return {
    status,
    dueGrosze,
    securedGrosze: secured,
    returnedGrosze: returned,
    keptGrosze: kept,
  };
}

/**
 * The step the operator is most likely to want next.
 *
 * Not a state machine that forbids anything else — deposits go sideways in
 * real life (a card hold that expires, a return in two parts), and a panel
 * that refuses the unusual case sends the operator to write it in a notebook
 * instead, which is exactly the record we are trying to keep.
 */
export function suggestedNextDeposit(
  status: DepositStatus | null,
): DepositStatus | null {
  switch (status) {
    case "to_take":
      return "held";
    case "held":
    case "blocked":
      return "to_return";
    case "to_return":
      return "returned";
    default:
      return null;
  }
}
