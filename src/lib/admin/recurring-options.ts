import type { ExpenseCategory } from "@/lib/admin/expense-options";
import type { Bilingual } from "@/lib/i18n-pick";

// Client-safe half of the recurring-cost module: the interval vocabulary, the
// labels, and the pure period maths. Split out of `lib/admin/recurring`, which
// is `server-only`, because the admin form needs these values in the browser —
// importing the server module from a client component fails the build.

/**
 * Recurring costs — leasing instalments, annual premiums, parking.
 *
 * The table stores the DEFINITION; pressing "fill in the missing periods"
 * writes real `car_expenses` rows. See the schema comment for why generating
 * rows beats accruing them invisibly at read time.
 */

export const RECURRING_INTERVALS = ["monthly", "quarterly", "yearly"] as const;
export type RecurringInterval = (typeof RECURRING_INTERVALS)[number];

export const INTERVAL_LABEL: Record<RecurringInterval, Bilingual> = {
  monthly: { pl: "Co miesiąc", en: "Monthly" },
  quarterly: { pl: "Co kwartał", en: "Quarterly" },
  yearly: { pl: "Co rok", en: "Yearly" },
};

const MONTHS_PER: Record<RecurringInterval, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

export type RecurringRow = {
  id: string;
  carId: string;
  category: ExpenseCategory;
  amountGrosze: number;
  interval: RecurringInterval;
  startOn: string;
  endOn: string | null;
  note: string | null;
  active: boolean;
  /** How many rows this definition has already generated. */
  generated: number;
};

/* ── Occurrence maths (pure, so it can be tested without a database) ───────── */

/** ISO day arithmetic in UTC. Local time zones have no business here. */
function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  // Day-of-month is clamped, not rolled over: a premium starting on the 31st
  // falls due on the 28th of February, never on the 3rd of March.
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

function minusDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export type Occurrence = { periodStart: string; periodEnd: string };

/**
 * Every period this definition covers, from `startOn` up to `until`.
 *
 * A period runs to the day before the next one begins, so consecutive
 * occurrences tile the calendar exactly — no gap, no overlap, and the cost
 * spreads across the whole span in the daily and monthly charts.
 *
 * Only periods that have STARTED are returned. Charging a leasing instalment
 * that falls due next month would overstate today's costs, and the generator
 * is meant to catch up on arrears, not run ahead.
 */
export function occurrencesUpTo(
  def: Pick<RecurringRow, "interval" | "startOn" | "endOn">,
  until: string,
): Occurrence[] {
  const step = MONTHS_PER[def.interval];
  const hardEnd = def.endOn && def.endOn < until ? def.endOn : until;
  const out: Occurrence[] = [];

  let cursor = def.startOn;
  // A generous ceiling: 40 years of monthly instalments. A definition that
  // somehow ran away should stop, not fill the table.
  for (let i = 0; i < 500 && cursor <= hardEnd; i++) {
    const next = addMonths(def.startOn, step * (i + 1));
    let periodEnd = minusDay(next);
    if (def.endOn && periodEnd > def.endOn) periodEnd = def.endOn;
    out.push({ periodStart: cursor, periodEnd });
    cursor = next;
  }
  return out;
}

export function isRecurringInterval(v: unknown): v is RecurringInterval {
  return (
    typeof v === "string" &&
    (RECURRING_INTERVALS as readonly string[]).includes(v)
  );
}
