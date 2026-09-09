import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

/**
 * How the booking funnel behaves — lead time, drop-off, length, add-ons,
 * pick-up mix.
 *
 * Every figure here comes from data the site has been collecting since launch;
 * nothing new is recorded for it. That is why it is worth having: it is the
 * cheapest analysis in the system and it answers commercial questions the
 * money pages cannot ("people book two days ahead, so a fortnight-out discount
 * is pointless").
 *
 * Unlike `economics.ts`, this counts ALL statuses on purpose. The interesting
 * number here is precisely how many requests never became rentals, so
 * restricting it to `confirmed`/`completed` would delete the subject.
 */

function rowsOf<T>(result: unknown): T[] {
  const r = result as T[] | { rows?: T[] };
  return Array.isArray(r) ? r : (r.rows ?? []);
}

const num = (v: unknown) => Number(v ?? 0) || 0;

export type StatusCount = { status: string; count: number };

export type BookingAnalytics = {
  windowDays: number;
  total: number;
  byStatus: StatusCount[];
  /** Confirmed or completed, as a share of every request in the window. */
  conversion: number | null;
  /** Cancelled or rejected, as a share of every request. */
  dropOff: number | null;
  /** Days between the request and the first day of the rental. */
  leadTime: { median: number | null; p25: number | null; p75: number | null };
  /** Rental length in days, over blocking reservations only. */
  length: { median: number | null; average: number | null };
  /** Share of blocking reservations that bought each add-on. */
  addOns: { key: string; label: string; count: number; share: number }[];
  /** Where people collect from. */
  locations: { name: string; count: number; share: number }[];
  /** Deposit variant split. */
  deposit: { withDeposit: number; noDeposit: number };
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Oczekujące",
  confirmed: "Potwierdzone",
  cancelled: "Anulowane",
  completed: "Zakończone",
  rejected: "Odrzucone",
};

export const statusLabel = (s: string) => STATUS_LABEL[s] ?? s;

export async function getBookingAnalytics(
  windowDays = 365,
): Promise<BookingAnalytics> {
  const db = getDb();

  const [statusRows, leadRows, lengthRows, addOnRows, locationRows] =
    await Promise.all([
      db.execute(sql`
        SELECT status::text AS status, COUNT(*)::int AS count
        FROM reservations
        WHERE created_at >= CURRENT_DATE - ${windowDays}::int
        GROUP BY 1 ORDER BY 2 DESC
      `),
      db.execute(sql`
        -- Lead time uses the MEDIAN, not the mean: one corporate booking made
        -- eight months ahead would drag an average far away from what a typical
        -- customer actually does.
        SELECT
          PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY (start_date - created_at::date)) AS p25,
          PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY (start_date - created_at::date)) AS median,
          PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY (start_date - created_at::date)) AS p75
        FROM reservations
        WHERE created_at >= CURRENT_DATE - ${windowDays}::int
          AND start_date >= created_at::date
      `),
      db.execute(sql`
        SELECT
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY days) AS median,
          AVG(days) AS average
        FROM reservations
        WHERE created_at >= CURRENT_DATE - ${windowDays}::int
          AND status IN ('confirmed','completed')
      `),
      db.execute(sql`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE extra_driver)::int AS extra_driver,
          COUNT(*) FILTER (WHERE child_seat)::int AS child_seat,
          COUNT(*) FILTER (WHERE protection_package)::int AS protection_package,
          COUNT(*) FILTER (WHERE deposit_variant = 'with_deposit')::int AS with_deposit,
          COUNT(*) FILTER (WHERE deposit_variant = 'no_deposit')::int AS no_deposit
        FROM reservations
        WHERE created_at >= CURRENT_DATE - ${windowDays}::int
          AND status IN ('confirmed','completed')
      `),
      db.execute(sql`
        SELECT COALESCE(p.name, 'Nieznane') AS name, COUNT(*)::int AS count
        FROM reservations r
        LEFT JOIN pickup_locations p ON p.id = r.pickup_location_id
        WHERE r.created_at >= CURRENT_DATE - ${windowDays}::int
        GROUP BY 1 ORDER BY 2 DESC
      `),
    ]);

  const byStatus = rowsOf<{ status: string; count: number }>(statusRows).map(
    (r) => ({ status: r.status, count: num(r.count) }),
  );
  const total = byStatus.reduce((n, s) => n + s.count, 0);
  const won = byStatus
    .filter((s) => s.status === "confirmed" || s.status === "completed")
    .reduce((n, s) => n + s.count, 0);
  const lost = byStatus
    .filter((s) => s.status === "cancelled" || s.status === "rejected")
    .reduce((n, s) => n + s.count, 0);

  const lead = rowsOf<{ p25: number; median: number; p75: number }>(
    leadRows,
  )[0];
  const len = rowsOf<{ median: number; average: number }>(lengthRows)[0];
  const a = rowsOf<{
    total: number;
    extra_driver: number;
    child_seat: number;
    protection_package: number;
    with_deposit: number;
    no_deposit: number;
  }>(addOnRows)[0];

  const blocking = num(a?.total);
  const share = (n: number) => (blocking > 0 ? n / blocking : 0);

  const locations = rowsOf<{ name: string; count: number }>(locationRows).map(
    (r) => ({
      name: r.name,
      count: num(r.count),
      share: total > 0 ? num(r.count) / total : 0,
    }),
  );

  // `null` rather than 0 when there is nothing to divide by — an empty window
  // has no conversion rate, and printing "0%" would read as "we win nothing".
  const ratio = (n: number) => (total > 0 ? n / total : null);
  const maybe = (v: unknown) => (v == null ? null : Number(v));

  return {
    windowDays,
    total,
    byStatus,
    conversion: ratio(won),
    dropOff: ratio(lost),
    leadTime: {
      median: maybe(lead?.median),
      p25: maybe(lead?.p25),
      p75: maybe(lead?.p75),
    },
    length: { median: maybe(len?.median), average: maybe(len?.average) },
    addOns: [
      {
        key: "extraDriver",
        label: "Dodatkowy kierowca",
        count: num(a?.extra_driver),
        share: share(num(a?.extra_driver)),
      },
      {
        key: "childSeat",
        label: "Fotelik dziecięcy",
        count: num(a?.child_seat),
        share: share(num(a?.child_seat)),
      },
      {
        key: "protection",
        label: "Pakiet ochronny",
        count: num(a?.protection_package),
        share: share(num(a?.protection_package)),
      },
    ],
    locations,
    deposit: {
      withDeposit: num(a?.with_deposit),
      noDeposit: num(a?.no_deposit),
    },
  };
}
