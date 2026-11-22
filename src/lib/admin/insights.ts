import type { Bilingual } from "@/lib/i18n-pick";
import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { getDb } from "@/lib/db";

/**
 * Analytics over an arbitrary window, with filters and a like-for-like
 * comparison against the period immediately before it.
 *
 * Two rules hold everywhere in this file, and everything else follows:
 *
 *  1. Revenue is allocated PER RENTAL DAY, so a booking that straddles the
 *     edge of the window contributes only the nights inside it. Crediting the
 *     whole booking to whichever end it started in is how a quiet month
 *     acquires a phantom five thousand złoty.
 *  2. Only `confirmed` and `completed` count as trading. A pending request is
 *     a hope; counting it would flatter every number here.
 */

function rowsOf<T>(result: unknown): T[] {
  const r = result as T[] | { rows?: T[] };
  return Array.isArray(r) ? r : (r.rows ?? []);
}

const num = (v: unknown) => Number(v ?? 0) || 0;

/* ── The window ───────────────────────────────────────────────────────────── */

export const PERIODS = [
  { key: "today", label: { pl: "Dziś", en: "Today" }, days: 1 },
  { key: "7d", label: { pl: "7 dni", en: "7 days" }, days: 7 },
  { key: "month", label: { pl: "Miesiąc", en: "Month" }, days: 30 },
  { key: "quarter", label: { pl: "Kwartał", en: "Quarter" }, days: 90 },
  { key: "year", label: { pl: "Rok", en: "Year" }, days: 365 },
] as const;

export type PeriodKey = (typeof PERIODS)[number]["key"] | "custom";

export type Window = { from: string; to: string; days: number };

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Resolve a preset (or an explicit range) into concrete dates. */
export function resolveWindow(
  period: string | undefined,
  from?: string,
  to?: string,
): { window: Window; period: PeriodKey } {
  const valid = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const a = valid(from);
  const b = valid(to);
  if (period === "custom" && a && b && b >= a) {
    const days =
      Math.round(
        (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) /
          86_400_000,
      ) + 1;
    return { window: { from: a, to: b, days }, period: "custom" };
  }

  const preset =
    PERIODS.find((p) => p.key === period) ??
    PERIODS.find((p) => p.key === "month")!;
  const end = new Date();
  const start = new Date(end.getTime() - (preset.days - 1) * 86_400_000);
  return {
    window: { from: iso(start), to: iso(end), days: preset.days },
    period: preset.key,
  };
}

/** The same number of days, immediately before — the only fair comparison. */
export function previousWindow(w: Window): Window {
  const end = new Date(Date.parse(`${w.from}T00:00:00Z`) - 86_400_000);
  const start = new Date(end.getTime() - (w.days - 1) * 86_400_000);
  return { from: iso(start), to: iso(end), days: w.days };
}

export type InsightFilters = {
  /** One physical unit. */
  carId?: string;
  /** A marketing class from `car_models.segments`. */
  segment?: string;
  /** Pickup location — narrows RENTALS, never costs (a cost has no location). */
  locationId?: string;
};

/** Car-level filter, shared by every query below so they cover the same fleet. */
function carScope(f: InsightFilters): SQL {
  const parts: SQL[] = [sql`TRUE`];
  if (f.carId) parts.push(sql`c.id = ${f.carId}::uuid`);
  if (f.segment) parts.push(sql`cm.segments @> ARRAY[${f.segment}]::text[]`);
  return sql.join(parts, sql` AND `);
}

/** Rental-level filter. Location lives on the reservation, not on the car. */
function rentalScope(f: InsightFilters): SQL {
  const parts: SQL[] = [sql`TRUE`];
  if (f.locationId)
    parts.push(sql`r.pickup_location_id = ${f.locationId}::uuid`);
  return sql.join(parts, sql` AND `);
}

/* ── Headline metrics ─────────────────────────────────────────────────────── */

export type WindowMetrics = {
  revenueGrosze: number;
  expenseGrosze: number;
  marginGrosze: number;
  rentals: number;
  daysRented: number;
  daysBlocked: number;
  daysIdle: number;
  carDays: number;
  cars: number;
  occupancy: number;
  avgDailyRateGrosze: number | null;
  avgRentalDays: number | null;
  avgBookingValueGrosze: number | null;
  kmDriven: number;
  revenuePerKmGrosze: number | null;
  costPerKmGrosze: number | null;
  profitPerKmGrosze: number | null;
};

export async function getWindowMetrics(
  w: Window,
  f: InsightFilters = {},
): Promise<WindowMetrics> {
  const cars = carScope(f);
  const rentals = rentalScope(f);

  const [row] = rowsOf<Record<string, unknown>>(
    await getDb().execute(sql`
      WITH fleet AS (
        SELECT c.id FROM cars c
        JOIN car_models cm ON cm.id = c.model_id
        WHERE ${cars}
      ),
      rented AS (
        SELECT COUNT(DISTINCT (r.car_id, g.d)) AS days,
               SUM(r.total_grosze::numeric / GREATEST(r.days, 1)) AS revenue
        FROM reservations r
        JOIN fleet ON fleet.id = r.car_id
        CROSS JOIN LATERAL generate_series(r.start_date, r.end_date, INTERVAL '1 day') AS g(d)
        WHERE r.status IN ('confirmed','completed')
          AND g.d BETWEEN ${w.from}::date AND ${w.to}::date
          AND ${rentals}
      ),
      started AS (
        -- Booking-level figures count rentals that STARTED in the window: an
        -- average booking value is a property of the booking, not of a day.
        SELECT COUNT(*) AS n, AVG(r.days)::numeric AS avg_days,
               AVG(r.total_grosze)::numeric AS avg_value,
               SUM(GREATEST(COALESCE(r.end_odometer_km,0) - COALESCE(r.start_odometer_km,0), 0)) AS km
        FROM reservations r
        JOIN fleet ON fleet.id = r.car_id
        WHERE r.status IN ('confirmed','completed')
          AND r.start_date BETWEEN ${w.from}::date AND ${w.to}::date
          AND ${rentals}
      ),
      blocked AS (
        SELECT COUNT(DISTINCT (ab.car_id, g.d)) AS days
        FROM availability_blocks ab
        JOIN fleet ON fleet.id = ab.car_id
        CROSS JOIN LATERAL generate_series(ab.start_date, ab.end_date, INTERVAL '1 day') AS g(d)
        WHERE g.d BETWEEN ${w.from}::date AND ${w.to}::date
      ),
      costs AS (
        SELECT SUM(
                 e.amount_grosze::numeric / GREATEST(1,
                   (GREATEST(COALESCE(e.period_end, e.incurred_on),
                             COALESCE(e.period_start, e.incurred_on))
                    - COALESCE(e.period_start, e.incurred_on)) + 1)
               ) AS expense
        FROM car_expenses e
        JOIN fleet ON fleet.id = e.car_id
        CROSS JOIN LATERAL generate_series(
          COALESCE(e.period_start, e.incurred_on),
          GREATEST(COALESCE(e.period_end, e.incurred_on),
                   COALESCE(e.period_start, e.incurred_on)),
          INTERVAL '1 day'
        ) AS g(d)
        WHERE g.d BETWEEN ${w.from}::date AND ${w.to}::date
      )
      SELECT (SELECT COUNT(*) FROM fleet)                      AS cars,
             COALESCE((SELECT ROUND(revenue) FROM rented), 0)  AS revenue,
             COALESCE((SELECT days FROM rented), 0)            AS days_rented,
             COALESCE((SELECT days FROM blocked), 0)           AS days_blocked,
             COALESCE((SELECT ROUND(expense) FROM costs), 0)   AS expense,
             COALESCE((SELECT n FROM started), 0)              AS rentals,
             (SELECT avg_days FROM started)                    AS avg_days,
             (SELECT avg_value FROM started)                   AS avg_value,
             COALESCE((SELECT km FROM started), 0)             AS km
    `),
  );

  const carsN = num(row?.cars);
  const carDays = carsN * w.days;
  const daysRented = num(row?.days_rented);
  const daysBlocked = num(row?.days_blocked);
  const revenueGrosze = num(row?.revenue);
  const expenseGrosze = num(row?.expense);
  const km = num(row?.km);

  return {
    revenueGrosze,
    expenseGrosze,
    marginGrosze: revenueGrosze - expenseGrosze,
    rentals: num(row?.rentals),
    daysRented,
    daysBlocked,
    daysIdle: Math.max(0, carDays - daysRented - daysBlocked),
    carDays,
    cars: carsN,
    occupancy: carDays > 0 ? daysRented / carDays : 0,
    avgDailyRateGrosze:
      daysRented > 0 ? Math.round(revenueGrosze / daysRented) : null,
    avgRentalDays: row?.avg_days == null ? null : Number(row.avg_days),
    avgBookingValueGrosze:
      row?.avg_value == null ? null : Math.round(Number(row.avg_value)),
    kmDriven: km,
    // Per-kilometre figures need odometer readings on both ends. Without them
    // the denominator is zero and the honest answer is "not measured", not a
    // division that silently reports infinity.
    revenuePerKmGrosze: km > 0 ? Math.round(revenueGrosze / km) : null,
    costPerKmGrosze: km > 0 ? Math.round(expenseGrosze / km) : null,
    profitPerKmGrosze:
      km > 0 ? Math.round((revenueGrosze - expenseGrosze) / km) : null,
  };
}

/* ── Occupancy per car, with the traffic light ────────────────────────────── */

export type CarOccupancy = {
  carId: string;
  modelId: string;
  plate: string;
  carName: string;
  daysRented: number;
  occupancy: number;
  revenueGrosze: number;
  expenseGrosze: number;
  marginGrosze: number;
  /** >75% green, 50–75% amber, below that red. The operator's own thresholds. */
  level: "good" | "watch" | "bad";
};

export async function getOccupancyByCar(
  w: Window,
  f: InsightFilters = {},
): Promise<CarOccupancy[]> {
  const cars = carScope(f);
  const rentals = rentalScope(f);

  const rows = rowsOf<Record<string, unknown>>(
    await getDb().execute(sql`
      SELECT c.id AS car_id, c.model_id, c.plate,
             cm.brand || ' ' || cm.model AS car_name,
             COALESCE(rd.days, 0) AS days_rented,
             COALESCE(rd.revenue, 0) AS revenue,
             COALESCE(ex.expense, 0) AS expense
      FROM cars c
      JOIN car_models cm ON cm.id = c.model_id
      LEFT JOIN LATERAL (
        SELECT COUNT(DISTINCT g.d) AS days,
               ROUND(SUM(r.total_grosze::numeric / GREATEST(r.days, 1))) AS revenue
        FROM reservations r
        CROSS JOIN LATERAL generate_series(r.start_date, r.end_date, INTERVAL '1 day') AS g(d)
        WHERE r.car_id = c.id AND r.status IN ('confirmed','completed')
          AND g.d BETWEEN ${w.from}::date AND ${w.to}::date
          AND ${rentals}
      ) rd ON TRUE
      LEFT JOIN LATERAL (
        SELECT ROUND(SUM(
                 e.amount_grosze::numeric / GREATEST(1,
                   (GREATEST(COALESCE(e.period_end, e.incurred_on),
                             COALESCE(e.period_start, e.incurred_on))
                    - COALESCE(e.period_start, e.incurred_on)) + 1)
               )) AS expense
        FROM car_expenses e
        CROSS JOIN LATERAL generate_series(
          COALESCE(e.period_start, e.incurred_on),
          GREATEST(COALESCE(e.period_end, e.incurred_on),
                   COALESCE(e.period_start, e.incurred_on)),
          INTERVAL '1 day') AS g(d)
        WHERE e.car_id = c.id AND g.d BETWEEN ${w.from}::date AND ${w.to}::date
      ) ex ON TRUE
      WHERE ${cars}
      ORDER BY COALESCE(rd.days, 0) DESC, c.plate ASC
    `),
  );

  return rows.map((r) => {
    const daysRented = num(r.days_rented);
    const occupancy = w.days > 0 ? daysRented / w.days : 0;
    const revenueGrosze = num(r.revenue);
    const expenseGrosze = num(r.expense);
    return {
      carId: String(r.car_id),
      modelId: String(r.model_id),
      plate: String(r.plate),
      carName: String(r.car_name),
      daysRented,
      occupancy,
      revenueGrosze,
      expenseGrosze,
      marginGrosze: revenueGrosze - expenseGrosze,
      level: occupancy > 0.75 ? "good" : occupancy >= 0.5 ? "watch" : "bad",
    };
  });
}

/* ── Where the money goes ─────────────────────────────────────────────────── */

export type CostSlice = {
  group: string;
  category: string;
  amountGrosze: number;
};

export async function getCostStructure(
  w: Window,
  f: InsightFilters = {},
): Promise<CostSlice[]> {
  const cars = carScope(f);
  const rows = rowsOf<Record<string, unknown>>(
    await getDb().execute(sql`
      SELECT e.category::text AS category,
             ROUND(SUM(
               e.amount_grosze::numeric / GREATEST(1,
                 (GREATEST(COALESCE(e.period_end, e.incurred_on),
                           COALESCE(e.period_start, e.incurred_on))
                  - COALESCE(e.period_start, e.incurred_on)) + 1)
             )) AS amount
      FROM car_expenses e
      JOIN cars c ON c.id = e.car_id
      JOIN car_models cm ON cm.id = c.model_id
      CROSS JOIN LATERAL generate_series(
        COALESCE(e.period_start, e.incurred_on),
        GREATEST(COALESCE(e.period_end, e.incurred_on),
                 COALESCE(e.period_start, e.incurred_on)),
        INTERVAL '1 day') AS g(d)
      WHERE g.d BETWEEN ${w.from}::date AND ${w.to}::date AND ${cars}
      GROUP BY 1
      HAVING SUM(e.amount_grosze) > 0
      ORDER BY 2 DESC
    `),
  );
  return rows.map((r) => ({
    group: "",
    category: String(r.category),
    amountGrosze: num(r.amount),
  }));
}

/* ── Rhythm: weekdays and months ──────────────────────────────────────────── */

export type WeekdayRow = { weekday: number; label: Bilingual; occupancy: number };

const WEEKDAYS: Bilingual[] = [
  { pl: "Poniedziałek", en: "Monday" },
  { pl: "Wtorek", en: "Tuesday" },
  { pl: "Środa", en: "Wednesday" },
  { pl: "Czwartek", en: "Thursday" },
  { pl: "Piątek", en: "Friday" },
  { pl: "Sobota", en: "Saturday" },
  { pl: "Niedziela", en: "Sunday" },
];

/** Which days of the week actually earn — the basis of a weekend price. */
export async function getWeekdayOccupancy(
  w: Window,
  f: InsightFilters = {},
): Promise<WeekdayRow[]> {
  const cars = carScope(f);
  const rentals = rentalScope(f);
  const rows = rowsOf<Record<string, unknown>>(
    await getDb().execute(sql`
      WITH fleet AS (
        SELECT c.id FROM cars c JOIN car_models cm ON cm.id = c.model_id WHERE ${cars}
      ),
      span AS (
        SELECT generate_series(${w.from}::date, ${w.to}::date, INTERVAL '1 day')::date AS d
      ),
      capacity AS (
        SELECT EXTRACT(ISODOW FROM span.d)::int AS dow,
               COUNT(*) * (SELECT COUNT(*) FROM fleet) AS car_days
        FROM span GROUP BY 1
      ),
      used AS (
        SELECT EXTRACT(ISODOW FROM g.d)::int AS dow,
               COUNT(DISTINCT (r.car_id, g.d)) AS days
        FROM reservations r
        JOIN fleet ON fleet.id = r.car_id
        CROSS JOIN LATERAL generate_series(r.start_date, r.end_date, INTERVAL '1 day') AS g(d)
        WHERE r.status IN ('confirmed','completed')
          AND g.d BETWEEN ${w.from}::date AND ${w.to}::date
          AND ${rentals}
        GROUP BY 1
      )
      SELECT capacity.dow, capacity.car_days, COALESCE(used.days, 0) AS days
      FROM capacity LEFT JOIN used ON used.dow = capacity.dow
      ORDER BY capacity.dow
    `),
  );

  return rows.map((r) => {
    const capacity = num(r.car_days);
    return {
      weekday: num(r.dow),
      label: WEEKDAYS[num(r.dow) - 1] ?? { pl: "", en: "" },
      occupancy: capacity > 0 ? num(r.days) / capacity : 0,
    };
  });
}

export type SeasonRow = {
  month: string;
  occupancy: number;
  revenueGrosze: number;
};

/** Occupancy month by month — the shape of the year, once there is a year. */
export async function getSeasonality(
  months = 12,
  f: InsightFilters = {},
): Promise<SeasonRow[]> {
  const cars = carScope(f);
  const rows = rowsOf<Record<string, unknown>>(
    await getDb().execute(sql`
      WITH fleet AS (
        SELECT c.id FROM cars c JOIN car_models cm ON cm.id = c.model_id WHERE ${cars}
      ),
      win AS (
        SELECT generate_series(
          date_trunc('month', CURRENT_DATE) - MAKE_INTERVAL(months => ${months}::int - 1),
          date_trunc('month', CURRENT_DATE), INTERVAL '1 month')::date AS m
      )
      SELECT to_char(win.m, 'YYYY-MM') AS month,
             (SELECT COUNT(*) FROM fleet) *
               (LEAST(
                  (win.m + INTERVAL '1 month' - INTERVAL '1 day')::date,
                  CURRENT_DATE) - win.m + 1) AS car_days,
             COALESCE((
               SELECT COUNT(DISTINCT (r.car_id, g.d))
               FROM reservations r
               JOIN fleet ON fleet.id = r.car_id
               CROSS JOIN LATERAL generate_series(r.start_date, r.end_date, INTERVAL '1 day') AS g(d)
               WHERE r.status IN ('confirmed','completed')
                 AND date_trunc('month', g.d) = win.m
                 AND g.d <= CURRENT_DATE
             ), 0) AS days,
             COALESCE((
               SELECT ROUND(SUM(r.total_grosze::numeric / GREATEST(r.days,1)))
               FROM reservations r
               JOIN fleet ON fleet.id = r.car_id
               CROSS JOIN LATERAL generate_series(r.start_date, r.end_date, INTERVAL '1 day') AS g(d)
               WHERE r.status IN ('confirmed','completed')
                 AND date_trunc('month', g.d) = win.m
                 AND g.d <= CURRENT_DATE
             ), 0) AS revenue
      FROM win ORDER BY win.m
    `),
  );

  return rows.map((r) => {
    const capacity = num(r.car_days);
    return {
      month: String(r.month),
      occupancy: capacity > 0 ? num(r.days) / capacity : 0,
      revenueGrosze: num(r.revenue),
    };
  });
}

/* ── Who is renting ───────────────────────────────────────────────────────── */

export type CustomerMix = {
  newCustomers: number;
  returning: number;
  /** Rentals that predate the directory and cannot be attributed either way. */
  unknown: number;
};

/**
 * New versus returning, decided by the customer record rather than by name.
 *
 * A name is not an identity — two Kowalskis are two people and one of them
 * spells it differently every time. The phone number is the key (normalised on
 * the way in), which is what the directory is built on. Bookings taken before
 * the directory existed carry no link and are reported as unattributed rather
 * than silently counted as new, which would invent a wave of first-time
 * customers on the day the feature shipped.
 */
export async function getCustomerMix(
  w: Window,
  f: InsightFilters = {},
): Promise<CustomerMix> {
  const cars = carScope(f);
  const rentals = rentalScope(f);
  const [row] = rowsOf<Record<string, unknown>>(
    await getDb().execute(sql`
      WITH fleet AS (
        SELECT c.id FROM cars c JOIN car_models cm ON cm.id = c.model_id WHERE ${cars}
      ),
      in_window AS (
        SELECT r.id, r.customer_id, r.start_date
        FROM reservations r
        JOIN fleet ON fleet.id = r.car_id
        WHERE r.status IN ('confirmed','completed')
          AND r.start_date BETWEEN ${w.from}::date AND ${w.to}::date
          AND ${rentals}
      )
      SELECT
        COUNT(*) FILTER (WHERE customer_id IS NULL) AS unknown,
        COUNT(*) FILTER (
          WHERE customer_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM reservations p
            WHERE p.customer_id = in_window.customer_id
              AND p.status IN ('confirmed','completed')
              AND p.start_date < in_window.start_date)
        ) AS new_customers,
        COUNT(*) FILTER (
          WHERE customer_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM reservations p
            WHERE p.customer_id = in_window.customer_id
              AND p.status IN ('confirmed','completed')
              AND p.start_date < in_window.start_date)
        ) AS returning
      FROM in_window
    `),
  );

  return {
    newCustomers: num(row?.new_customers),
    returning: num(row?.returning),
    unknown: num(row?.unknown),
  };
}

/* ── Best and worst ───────────────────────────────────────────────────────── */

export type Highlight = { label: Bilingual; subject: string; value: Bilingual };

/**
 * The five lines an owner reads first.
 *
 * Built from the per-car figures above rather than from their own queries, so
 * a highlight can never disagree with the table it was drawn from.
 */
export function highlightsOf(cars: CarOccupancy[]): Highlight[] {
  if (cars.length === 0) return [];
  const withRevenue = cars.filter((c) => c.revenueGrosze > 0);
  const pct = (v: number): Bilingual => {
    const text = `${Math.round(v * 100)}%`;
    return { pl: text, en: text };
  };
  const zl = (g: number): Bilingual => ({
    pl: `${(g / 100).toLocaleString("pl-PL")} zł`,
    en: `${(g / 100).toLocaleString("en-GB")} PLN`,
  });

  const best = [...cars].sort((a, b) => b.marginGrosze - a.marginGrosze)[0];
  const busiest = [...cars].sort((a, b) => b.occupancy - a.occupancy)[0];
  const idlest = [...cars].sort((a, b) => a.occupancy - b.occupancy)[0];
  const priciest = [...withRevenue].sort(
    (a, b) =>
      b.revenueGrosze / Math.max(b.daysRented, 1) -
      a.revenueGrosze / Math.max(a.daysRented, 1),
  )[0];
  const costliest = [...cars].sort(
    (a, b) => b.expenseGrosze - a.expenseGrosze,
  )[0];

  const out: Highlight[] = [
    {
      label: { pl: "Najbardziej rentowne auto", en: "Most profitable car" },
      subject: best.carName,
      value: zl(best.marginGrosze),
    },
    {
      label: { pl: "Najwyższe obłożenie", en: "Highest occupancy" },
      subject: busiest.carName,
      value: pct(busiest.occupancy),
    },
    {
      label: { pl: "Najniższe obłożenie", en: "Lowest occupancy" },
      subject: idlest.carName,
      value: pct(idlest.occupancy),
    },
  ];
  if (priciest) {
    out.push({
      label: { pl: "Najwyższa cena za dobę", en: "Highest daily rate" },
      subject: priciest.carName,
      value: zl(
        Math.round(priciest.revenueGrosze / Math.max(priciest.daysRented, 1)),
      ),
    });
  }
  if (costliest.expenseGrosze > 0) {
    out.push({
      label: { pl: "Największy koszt", en: "Biggest cost" },
      subject: costliest.carName,
      value: zl(costliest.expenseGrosze),
    });
  }
  return out;
}

/** Percentage change between two figures, or null when there is no base. */
export function delta(now: number, before: number): number | null {
  if (before <= 0) return null;
  return ((now - before) / before) * 100;
}
