import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  EXPENSE_GROUP_OF,
  type ExpenseCategory,
  type ExpenseGroup,
} from "@/lib/admin/expense-options";

/**
 * Per-car profit and loss: what each vehicle earns, what it costs, and when it
 * pays for itself.
 *
 * Three rules hold everywhere in this file, and every number depends on them:
 *
 * 1. **Only blocking reservations count as revenue** (`confirmed`, `completed`)
 *    — the same definition the calendar, the allocator and `stats.ts` use. A
 *    pending request is a hope.
 *
 * 2. **Revenue is spread evenly across the days of the rental**, not booked on
 *    the day it was paid. A fourteen-day rental that straddles a month boundary
 *    belongs to both months, and a daily chart that spikes once and flatlines
 *    for a fortnight tells you nothing about how the car actually earns.
 *
 * 3. **Capital is not a running cost.** The purchase price is the target the
 *    margin has to reach, never a line in it. Mixing them makes a new car look
 *    ruinous and every later month look better than it is.
 *
 * Everything is in integer grosze. Divisions that could hit zero return `null`
 * rather than `Infinity` or a comforting `0` — "not enough data yet" is a real
 * answer and the UI prints it as one.
 */

function rowsOf<T>(result: unknown): T[] {
  const r = result as T[] | { rows?: T[] };
  return Array.isArray(r) ? r : (r.rows ?? []);
}

const num = (v: unknown) => Number(v ?? 0) || 0;
const day = (v: unknown) =>
  v == null
    ? null
    : String(v instanceof Date ? v.toISOString() : v).slice(0, 10);

export type CarEconomics = {
  carId: string;
  plate: string;
  carName: string;
  modelId: string;
  status: string;

  /** What the car cost, and the day the clock started. Null = never entered. */
  purchasePriceGrosze: number | null;
  purchasedOn: string | null;
  /**
   * First day this car counts as ours, in order of preference: purchase date,
   * registration date, first rental, first expense, else the row's creation.
   * Everything per-day is divided by the span from here to today, so a car with
   * no purchase date still gets honest averages.
   */
  since: string;
  daysOwned: number;

  rentals: number;
  /** Rented days that fall inside the ownership window — never more than owned. */
  daysRented: number;
  /** Everything not rented. This is "czas postojowy". */
  daysIdle: number;
  /**
   * Idle because the car was blocked — service, damage, a long-term hold. An
   * operations number.
   */
  daysBlocked: number;
  /**
   * Idle while available to book, and nobody booked it. A sales number, and
   * the only part of the idle time more marketing could have fixed.
   */
  daysFree: number;
  /** 0–1. Rented days over owned days. */
  utilisation: number;

  revenueGrosze: number;
  expensesGrosze: number;
  byCategory: Partial<Record<ExpenseCategory, number>>;
  byGroup: Record<ExpenseGroup, number>;

  /** Revenue minus running costs. The figure that pays back the purchase. */
  marginGrosze: number;
  /** Margin as a share of revenue, or null with no revenue to divide by. */
  marginPct: number | null;

  revenuePerDayGrosze: number;
  costPerDayGrosze: number;
  /** Margin per owned day — negative means the car loses money just existing. */
  netPerDayGrosze: number;
  /**
   * Standing costs (insurance, leasing, tax, parking) per owned day: what the
   * car burns whether or not anybody drives it.
   */
  standingPerDayGrosze: number;
  /** Standing burn × idle days — the price of the car sitting still. */
  idleCostGrosze: number;

  /**
   * Straight-line depreciation booked so far, or null when the car has no
   * residual value / period configured.
   *
   * Kept OUT of `marginGrosze` deliberately — margin means "revenue minus money
   * actually spent". This is the money the car quietly lost anyway.
   */
  depreciationToDateGrosze: number | null;
  /** Purchase price minus depreciation booked so far. */
  bookValueGrosze: number | null;
  /** Margin after depreciation — the honest whole-cost result. */
  tcoMarginGrosze: number | null;

  /** Kilometres driven on rentals where BOTH odometer readings were recorded. */
  kmDriven: number;
  /** How many rentals contributed those kilometres, out of how many there were. */
  rentalsWithKm: number;
  /** Running cost per measured kilometre, or null with nothing measured yet. */
  costPerKmGrosze: number | null;
  revenuePerKmGrosze: number | null;

  /** How much of the purchase price the margin has already returned. */
  recoveredGrosze: number | null;
  recoveredPct: number | null;
  remainingGrosze: number | null;
  /**
   * Projected break-even date at the current average net per day, or null when
   * there is no purchase price, nothing left to recover, or the car is not
   * currently earning (in which case no date is honest).
   */
  paybackOn: string | null;
  paybackDaysLeft: number | null;
};

/** One day of one car's life, as the charts consume it. */
export type CarDay = {
  date: string;
  /** Revenue attributed to this day (rental total spread over its days). */
  revenueGrosze: number;
  /** Expenses booked on this day. */
  expenseGrosze: number;
  rented: boolean;
  /** Running total of revenue − expenses from the start of the window. */
  cumulativeNetGrosze: number;
};

const EMPTY_GROUPS: Record<ExpenseGroup, number> = {
  wear: 0,
  standing: 0,
  running: 0,
};

/**
 * Ownership window, day-level occupancy and money, per car.
 *
 * Occupancy is computed by EXPANDING every owned day and asking what it was,
 * rather than by summing rental lengths. That costs a few thousand rows on a
 * fleet this size and buys three things summing cannot:
 *
 *   · Overlaps cannot double-count. Two blocks covering the same week, or a
 *     block laid over a rental, each count that day once.
 *   · The three states are guaranteed to add up to the days owned, so the
 *     "idle" figure can never drift away from `owned − rented`.
 *   · Idle splits into two genuinely different things. A day nobody booked is
 *     a sales problem; a day the car sat blocked for service is an operations
 *     problem. Reporting them as one number hides which one you have.
 */
const CAR_BASE_SQL = sql`
  WITH since AS (
    SELECT c.id AS car_id,
           LEAST(
             COALESCE(c.purchased_on,   DATE '9999-12-31'),
             COALESCE(c.registered_on,  DATE '9999-12-31'),
             COALESCE((SELECT MIN(r.start_date) FROM reservations r
                        WHERE r.car_id = c.id
                          AND r.status IN ('confirmed','completed')), DATE '9999-12-31'),
             COALESCE((SELECT MIN(e.incurred_on) FROM car_expenses e
                        WHERE e.car_id = c.id), DATE '9999-12-31'),
             c.created_at::date
           ) AS since
    FROM cars c
  ),
  day_state AS (
    SELECT c.id AS car_id, g.d,
           EXISTS (SELECT 1 FROM reservations r
                    WHERE r.car_id = c.id
                      AND r.status IN ('confirmed','completed')
                      AND g.d BETWEEN r.start_date AND r.end_date) AS rented,
           EXISTS (SELECT 1 FROM availability_blocks b
                    WHERE b.car_id = c.id
                      AND g.d BETWEEN b.start_date AND b.end_date) AS blocked
    FROM cars c
    JOIN since s ON s.car_id = c.id
    CROSS JOIN LATERAL generate_series(s.since, CURRENT_DATE, INTERVAL '1 day') AS g(d)
  ),
  occupancy AS (
    SELECT car_id,
           COUNT(*)::int AS days_owned,
           COUNT(*) FILTER (WHERE rented)::int AS days_rented,
           COUNT(*) FILTER (WHERE NOT rented AND blocked)::int AS days_blocked,
           COUNT(*) FILTER (WHERE NOT rented AND NOT blocked)::int AS days_free
    FROM day_state GROUP BY car_id
  ),
  rev AS (
    SELECT r.car_id,
           COUNT(*)::int AS rentals,
           COALESCE(SUM(r.total_grosze), 0)::bigint AS revenue,
           -- Only rentals with BOTH readings, and only where the return
           -- reading is not lower than the handover one. A transposed pair
           -- would otherwise subtract kilometres from the fleet total.
           COALESCE(SUM(r.end_odometer_km - r.start_odometer_km) FILTER (
             WHERE r.start_odometer_km IS NOT NULL
               AND r.end_odometer_km IS NOT NULL
               AND r.end_odometer_km >= r.start_odometer_km), 0)::bigint AS km_driven,
           COUNT(*) FILTER (
             WHERE r.start_odometer_km IS NOT NULL
               AND r.end_odometer_km IS NOT NULL
               AND r.end_odometer_km >= r.start_odometer_km)::int AS rentals_with_km
    FROM reservations r
    WHERE r.status IN ('confirmed','completed')
    GROUP BY r.car_id
  ),
  exp AS (
    SELECT car_id, COALESCE(SUM(amount_grosze), 0)::bigint AS expenses
    FROM car_expenses GROUP BY car_id
  )
  SELECT c.id AS car_id, c.plate, c.model_id, c.status::text AS status,
         cm.brand || ' ' || cm.model AS car_name,
         c.purchase_price_grosze, c.purchased_on,
         c.residual_value_grosze, c.depreciation_months,
         COALESCE(rev.km_driven, 0) AS km_driven,
         COALESCE(rev.rentals_with_km, 0) AS rentals_with_km,
         s.since,
         GREATEST(1, COALESCE(o.days_owned, 1)) AS days_owned,
         COALESCE(rev.rentals, 0) AS rentals,
         COALESCE(rev.revenue, 0) AS revenue,
         COALESCE(o.days_rented, 0) AS days_rented,
         COALESCE(o.days_blocked, 0) AS days_blocked,
         COALESCE(o.days_free, 0) AS days_free,
         COALESCE(exp.expenses, 0) AS expenses
  FROM cars c
  JOIN car_models cm ON cm.id = c.model_id
  JOIN since s ON s.car_id = c.id
  LEFT JOIN occupancy o ON o.car_id = c.id
  LEFT JOIN rev ON rev.car_id = c.id
  LEFT JOIN exp ON exp.car_id = c.id
`;

type BaseRow = {
  car_id: string;
  plate: string;
  model_id: string;
  status: string;
  car_name: string;
  purchase_price_grosze: number | null;
  purchased_on: string | Date | null;
  residual_value_grosze: number | null;
  depreciation_months: number | null;
  km_driven: number;
  rentals_with_km: number;
  since: string | Date;
  days_owned: number;
  rentals: number;
  revenue: number;
  days_rented: number;
  days_blocked: number;
  days_free: number;
  expenses: number;
};

/** Expense totals split by category, keyed by car. */
async function categoryTotals(): Promise<
  Record<string, Partial<Record<ExpenseCategory, number>>>
> {
  const rows = rowsOf<{ car_id: string; category: string; total: number }>(
    await getDb().execute(sql`
      SELECT car_id, category::text AS category, SUM(amount_grosze)::bigint AS total
      FROM car_expenses
      GROUP BY car_id, category
    `),
  );

  const out: Record<string, Partial<Record<ExpenseCategory, number>>> = {};
  for (const r of rows) {
    (out[r.car_id] ??= {})[r.category as ExpenseCategory] = num(r.total);
  }
  return out;
}

function assemble(
  r: BaseRow,
  byCategory: Partial<Record<ExpenseCategory, number>>,
): CarEconomics {
  const daysOwned = Math.max(1, num(r.days_owned));
  const revenue = num(r.revenue);
  const expenses = num(r.expenses);
  const margin = revenue - expenses;

  // Rented days are clamped in SQL, but a car whose ownership window starts
  // after a historic rental could still, in principle, report more rented days
  // than owned ones. Clamp again rather than print a negative idle count.
  const daysRented = Math.min(daysOwned, num(r.days_rented));

  const byGroup = { ...EMPTY_GROUPS };
  for (const [cat, amount] of Object.entries(byCategory)) {
    byGroup[EXPENSE_GROUP_OF[cat as ExpenseCategory]] += amount ?? 0;
  }

  const netPerDay = margin / daysOwned;
  const standingPerDay = byGroup.standing / daysOwned;
  const daysIdle = daysOwned - daysRented;
  // Clamped the same way as `daysRented`, and `daysFree` absorbs the remainder
  // so the three states always sum to the days owned even if a clamp bit.
  const daysBlocked = Math.min(daysIdle, num(r.days_blocked));
  const daysFree = daysIdle - daysBlocked;

  const purchase = r.purchase_price_grosze;
  const recovered =
    purchase == null ? null : Math.max(0, Math.min(margin, purchase));
  const remaining = purchase == null ? null : Math.max(0, purchase - margin);

  // A payback date is only meaningful when there is a target, something still
  // owed, and a positive rate to get there. Otherwise the honest answer is "we
  // cannot say", and the UI says exactly that instead of printing a date in
  // the year 2400.
  let paybackOn: string | null = null;
  let paybackDaysLeft: number | null = null;
  if (remaining != null && remaining > 0 && netPerDay > 0) {
    const daysLeft = Math.ceil(remaining / netPerDay);
    // Beyond ~27 years the projection is arithmetic, not a forecast.
    if (daysLeft <= 10_000) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + daysLeft);
      paybackOn = d.toISOString().slice(0, 10);
      paybackDaysLeft = daysLeft;
    }
  }

  // Straight-line depreciation, booked monthly and never past the end of the
  // schedule: a five-year car in its seventh year has not depreciated 140% of
  // its cost. Needs all three inputs; with any missing, nothing is claimed.
  const months = num(r.depreciation_months);
  const start = day(r.purchased_on) ?? day(r.since);
  let depreciationToDate: number | null = null;
  let bookValue: number | null = null;
  if (
    purchase != null &&
    r.residual_value_grosze != null &&
    months > 0 &&
    start
  ) {
    const depreciable = Math.max(0, purchase - r.residual_value_grosze);
    const from = new Date(`${start}T00:00:00Z`);
    const now = new Date();
    const elapsed =
      (now.getUTCFullYear() - from.getUTCFullYear()) * 12 +
      (now.getUTCMonth() - from.getUTCMonth());
    const used = Math.max(0, Math.min(months, elapsed));
    depreciationToDate = Math.round((depreciable / months) * used);
    bookValue = purchase - depreciationToDate;
  }

  const kmDriven = num(r.km_driven);

  return {
    carId: r.car_id,
    plate: r.plate,
    carName: r.car_name,
    modelId: r.model_id,
    status: r.status,
    purchasePriceGrosze: purchase,
    purchasedOn: day(r.purchased_on),
    since: day(r.since)!,
    daysOwned,
    rentals: num(r.rentals),
    daysRented,
    daysIdle,
    daysBlocked,
    daysFree,
    utilisation: daysRented / daysOwned,
    revenueGrosze: revenue,
    expensesGrosze: expenses,
    byCategory,
    byGroup,
    marginGrosze: margin,
    marginPct: revenue > 0 ? margin / revenue : null,
    revenuePerDayGrosze: Math.round(revenue / daysOwned),
    costPerDayGrosze: Math.round(expenses / daysOwned),
    netPerDayGrosze: Math.round(netPerDay),
    standingPerDayGrosze: Math.round(standingPerDay),
    idleCostGrosze: Math.round(standingPerDay * daysIdle),
    depreciationToDateGrosze: depreciationToDate,
    bookValueGrosze: bookValue,
    tcoMarginGrosze:
      depreciationToDate == null ? null : margin - depreciationToDate,
    kmDriven,
    rentalsWithKm: num(r.rentals_with_km),
    // Divided by measured kilometres only. The UI has to say how many rentals
    // that covers, because dividing the whole cost base by a partial distance
    // overstates the rate — and the overstatement is invisible in the number.
    costPerKmGrosze: kmDriven > 0 ? Math.round(expenses / kmDriven) : null,
    revenuePerKmGrosze: kmDriven > 0 ? Math.round(revenue / kmDriven) : null,
    recoveredGrosze: recovered,
    recoveredPct:
      purchase != null && purchase > 0 ? (recovered ?? 0) / purchase : null,
    remainingGrosze: remaining,
    paybackOn,
    paybackDaysLeft,
  };
}

/** Every unit's P&L, worst margin last — the fleet table. */
export async function getFleetEconomics(): Promise<CarEconomics[]> {
  const [rows, cats] = await Promise.all([
    getDb().execute(sql`${CAR_BASE_SQL} ORDER BY c.plate ASC`),
    categoryTotals(),
  ]);
  return rowsOf<BaseRow>(rows).map((r) => assemble(r, cats[r.car_id] ?? {}));
}

/** One unit's P&L, or null if the id is not a car. */
export async function getCarEconomics(
  carId: string,
): Promise<CarEconomics | null> {
  const [rows, cats] = await Promise.all([
    getDb().execute(sql`${CAR_BASE_SQL} WHERE c.id = ${carId}::uuid`),
    categoryTotals(),
  ]);
  const row = rowsOf<BaseRow>(rows)[0];
  return row ? assemble(row, cats[row.car_id] ?? {}) : null;
}

/**
 * Day-by-day revenue, cost and occupancy for one car.
 *
 * `generate_series` produces every day in the window — including the empty
 * ones. That matters: the gaps ARE the story here, and a series that only
 * contains days with activity would draw a chart in which a car that sat in a
 * car park for three months looks identical to one that never stopped.
 */
export async function getCarDailySeries(
  carId: string,
  windowDays: number,
): Promise<CarDay[]> {
  const rows = rowsOf<{
    d: string | Date;
    revenue: number;
    expense: number;
    rented: boolean;
  }>(
    await getDb().execute(sql`
      WITH win AS (
        SELECT generate_series(
          CURRENT_DATE - ${windowDays}::int + 1, CURRENT_DATE, INTERVAL '1 day'
        )::date AS d
      ),
      rev AS (
        SELECT g.d,
               -- Even spread across the rental. The stored length is never
               -- zero, but GREATEST keeps a bad legacy row from dividing by
               -- nothing and taking the whole page down.
               SUM(r.total_grosze::numeric / GREATEST(r.days, 1)) AS revenue
        FROM reservations r
        CROSS JOIN LATERAL generate_series(r.start_date, r.end_date, INTERVAL '1 day') AS g(d)
        WHERE r.car_id = ${carId}::uuid
          AND r.status IN ('confirmed','completed')
        GROUP BY g.d
      ),
      exp AS (
        -- A cost with a period is spread evenly over the days it buys; one
        -- without still lands entirely on incurred_on. The TOTAL is identical
        -- either way — only the day it is attributed to changes. GREATEST
        -- guards a period saved end-before-start, which would otherwise
        -- generate an empty series and make the cost disappear from the chart
        -- while still counting in the totals.
        SELECT g.d,
               SUM(
                 e.amount_grosze::numeric / GREATEST(1,
                   (GREATEST(COALESCE(e.period_end, e.incurred_on),
                             COALESCE(e.period_start, e.incurred_on))
                    - COALESCE(e.period_start, e.incurred_on)) + 1)
               ) AS expense
        FROM car_expenses e
        CROSS JOIN LATERAL generate_series(
          COALESCE(e.period_start, e.incurred_on),
          GREATEST(COALESCE(e.period_end, e.incurred_on),
                   COALESCE(e.period_start, e.incurred_on)),
          INTERVAL '1 day'
        ) AS g(d)
        WHERE e.car_id = ${carId}::uuid
        GROUP BY g.d
      )
      SELECT win.d,
             COALESCE(ROUND(rev.revenue), 0)::bigint AS revenue,
             COALESCE(ROUND(exp.expense), 0)::bigint AS expense,
             (rev.revenue IS NOT NULL) AS rented
      FROM win
      LEFT JOIN rev ON rev.d = win.d
      LEFT JOIN exp ON exp.d = win.d
      ORDER BY win.d ASC
    `),
  );

  let cumulative = 0;
  return rows.map((r) => {
    const revenueGrosze = num(r.revenue);
    const expenseGrosze = num(r.expense);
    cumulative += revenueGrosze - expenseGrosze;
    return {
      date: day(r.d)!,
      revenueGrosze,
      expenseGrosze,
      rented: Boolean(r.rented),
      cumulativeNetGrosze: cumulative,
    };
  });
}

export type FleetEconomicsTotals = {
  cars: number;
  revenueGrosze: number;
  expensesGrosze: number;
  marginGrosze: number;
  marginPct: number | null;
  /** Capital tied up in the cars that have a purchase price recorded. */
  investedGrosze: number;
  /** How many cars have no purchase price, so are missing from `investedGrosze`. */
  carsWithoutPrice: number;
  /** Depreciation booked across the cars that have a schedule configured. */
  depreciationToDateGrosze: number;
  /** How many cars have no schedule, so contribute nothing to the figure above. */
  carsWithoutDepreciation: number;
  /** Margin after depreciation, or null when no car has a schedule. */
  tcoMarginGrosze: number | null;
  /** Kilometres measured across the fleet. */
  kmDriven: number;
  costPerKmGrosze: number | null;
  revenuePerKmGrosze: number | null;
  recoveredGrosze: number;
  recoveredPct: number | null;
  daysIdle: number;
  /** Idle because blocked — service, damage, holds. */
  daysBlocked: number;
  /** Idle while bookable. The part a booking could have filled. */
  daysFree: number;
  idleCostGrosze: number;
  utilisation: number;
};

/** Fleet roll-up. Averages are weighted by days owned, not by car. */
export function totalsOf(cars: CarEconomics[]): FleetEconomicsTotals {
  const revenue = cars.reduce((n, c) => n + c.revenueGrosze, 0);
  const expenses = cars.reduce((n, c) => n + c.expensesGrosze, 0);
  const margin = revenue - expenses;
  const priced = cars.filter((c) => c.purchasePriceGrosze != null);
  const invested = priced.reduce((n, c) => n + (c.purchasePriceGrosze ?? 0), 0);
  const recovered = priced.reduce((n, c) => n + (c.recoveredGrosze ?? 0), 0);
  const owned = cars.reduce((n, c) => n + c.daysOwned, 0);
  const rented = cars.reduce((n, c) => n + c.daysRented, 0);
  const depreciated = cars.filter((c) => c.depreciationToDateGrosze != null);
  const fleetKm = cars.reduce((n, c) => n + c.kmDriven, 0);

  return {
    cars: cars.length,
    revenueGrosze: revenue,
    expensesGrosze: expenses,
    marginGrosze: margin,
    marginPct: revenue > 0 ? margin / revenue : null,
    investedGrosze: invested,
    carsWithoutPrice: cars.length - priced.length,
    // Summed only over the cars that HAVE a depreciation schedule. A car
    // without one contributes nothing rather than a zero, and `carsWithoutDepreciation`
    // says how much of the fleet that silently leaves out.
    depreciationToDateGrosze: depreciated.reduce(
      (n, c) => n + (c.depreciationToDateGrosze ?? 0),
      0,
    ),
    carsWithoutDepreciation: cars.length - depreciated.length,
    tcoMarginGrosze:
      depreciated.length === 0
        ? null
        : margin -
          depreciated.reduce(
            (n, c) => n + (c.depreciationToDateGrosze ?? 0),
            0,
          ),
    kmDriven: fleetKm,
    costPerKmGrosze: fleetKm > 0 ? Math.round(expenses / fleetKm) : null,
    revenuePerKmGrosze: fleetKm > 0 ? Math.round(revenue / fleetKm) : null,
    recoveredGrosze: recovered,
    recoveredPct: invested > 0 ? recovered / invested : null,
    daysIdle: cars.reduce((n, c) => n + c.daysIdle, 0),
    daysBlocked: cars.reduce((n, c) => n + c.daysBlocked, 0),
    daysFree: cars.reduce((n, c) => n + c.daysFree, 0),
    idleCostGrosze: cars.reduce((n, c) => n + c.idleCostGrosze, 0),
    utilisation: owned > 0 ? rented / owned : 0,
  };
}

/** One month of trading, for the seasonality table and the reports. */
export type MonthRow = {
  /** "2026-08" — sortable, and the label is derived from it for display. */
  month: string;
  revenueGrosze: number;
  expenseGrosze: number;
  marginGrosze: number;
  daysRented: number;
};

/**
 * Month-by-month revenue, cost and occupancy — the whole fleet, or one car.
 *
 * Answers the question the daily chart cannot: whether last month was bad or
 * whether February is always bad. Revenue is allocated by rental day, exactly
 * as in `getCarDailySeries`, so a rental spanning a month boundary is split
 * between the two months rather than credited to whichever end it started in.
 *
 * Months with no activity are still returned. A gap is information, and a
 * table that silently omits August reads as though August did not happen.
 */
export async function getMonthlySeries(
  months: number,
  carId?: string,
): Promise<MonthRow[]> {
  const scope = carId ? sql`= ${carId}::uuid` : sql`IS NOT NULL`;

  const rows = rowsOf<{
    month: string;
    revenue: number;
    expense: number;
    days_rented: number;
  }>(
    await getDb().execute(sql`
      WITH win AS (
        SELECT generate_series(
          date_trunc('month', CURRENT_DATE) - MAKE_INTERVAL(months => ${months}::int - 1),
          date_trunc('month', CURRENT_DATE),
          INTERVAL '1 month'
        )::date AS m
      ),
      rented_days AS (
        SELECT date_trunc('month', g.d)::date AS m,
               COUNT(DISTINCT (r.car_id, g.d)) AS days_rented,
               SUM(r.total_grosze::numeric / GREATEST(r.days, 1)) AS revenue
        FROM reservations r
        CROSS JOIN LATERAL generate_series(r.start_date, r.end_date, INTERVAL '1 day') AS g(d)
        WHERE r.status IN ('confirmed','completed')
          AND r.car_id ${scope}
        GROUP BY 1
      ),
      costs AS (
        -- Same day-level spread as the daily series, then rolled up by month,
        -- so an annual premium shows as a twelfth per month instead of a cliff.
        SELECT date_trunc('month', g.d)::date AS m,
               SUM(
                 e.amount_grosze::numeric / GREATEST(1,
                   (GREATEST(COALESCE(e.period_end, e.incurred_on),
                             COALESCE(e.period_start, e.incurred_on))
                    - COALESCE(e.period_start, e.incurred_on)) + 1)
               ) AS expense
        FROM car_expenses e
        CROSS JOIN LATERAL generate_series(
          COALESCE(e.period_start, e.incurred_on),
          GREATEST(COALESCE(e.period_end, e.incurred_on),
                   COALESCE(e.period_start, e.incurred_on)),
          INTERVAL '1 day'
        ) AS g(d)
        WHERE e.car_id ${scope}
        GROUP BY 1
      )
      SELECT to_char(win.m, 'YYYY-MM') AS month,
             COALESCE(ROUND(rd.revenue), 0)::bigint AS revenue,
             COALESCE(ROUND(c.expense), 0)::bigint AS expense,
             COALESCE(rd.days_rented, 0)::int AS days_rented
      FROM win
      LEFT JOIN rented_days rd ON rd.m = win.m
      LEFT JOIN costs c ON c.m = win.m
      ORDER BY win.m ASC
    `),
  );

  return rows.map((r) => {
    const revenueGrosze = num(r.revenue);
    const expenseGrosze = num(r.expense);
    return {
      month: r.month,
      revenueGrosze,
      expenseGrosze,
      marginGrosze: revenueGrosze - expenseGrosze,
      daysRented: num(r.days_rented),
    };
  });
}

/* ── Sales trend: month on month, year on year ────────────────────────────── */

/** "2026-08" shifted by whole months, staying a "YYYY-MM" string. */
function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const zero = y * 12 + (m - 1) + delta;
  return `${Math.floor(zero / 12)}-${String((zero % 12) + 1).padStart(2, "0")}`;
}

/**
 * Percentage change, or null when there is nothing to compare against.
 *
 * A month that earned nothing has no percentage: every change from zero is
 * infinite, and printing "+100%" or "—100%" there would be a number the data
 * does not support. The caller shows a dash instead.
 */
function pctChange(now: number, base: number | null): number | null {
  if (base == null || base <= 0) return null;
  return ((now - base) / base) * 100;
}

export type SalesMonth = {
  month: string;
  revenueGrosze: number;
  /** The month before this one, when it is inside the queried window. */
  prevMonthGrosze: number | null;
  /** The same month a year earlier — the point of a 24-month window. */
  prevYearGrosze: number | null;
  momPct: number | null;
  yoyPct: number | null;
  /**
   * True for the month still being traded. Its revenue is days-so-far, so
   * comparing it to a whole month understates it — every chart and tile that
   * shows it has to say so rather than let a reader assume a collapse.
   */
  partial: boolean;
};

/**
 * The last `keep` months, each carrying its own month-on-month and
 * year-on-year comparison.
 *
 * Pure on purpose: it takes whatever `getMonthlySeries` returned and does the
 * arithmetic in one place, so the chart, the tiles and the table cannot
 * disagree about what "+12%" meant. Feed it at least `keep + 12` months or the
 * year-on-year column is all nulls — the baselines simply are not in the
 * window, and a missing baseline is reported as such rather than as zero.
 */
export function salesTrend(rows: MonthRow[], keep = 12): SalesMonth[] {
  const revenueByMonth = new Map(rows.map((r) => [r.month, r.revenueGrosze]));
  const at = (month: string) => revenueByMonth.get(month) ?? null;
  const last = rows.length - 1;

  return rows.slice(-keep).map((row) => {
    const prevMonthGrosze = at(shiftMonth(row.month, -1));
    const prevYearGrosze = at(shiftMonth(row.month, -12));
    return {
      month: row.month,
      revenueGrosze: row.revenueGrosze,
      prevMonthGrosze,
      prevYearGrosze,
      momPct: pctChange(row.revenueGrosze, prevMonthGrosze),
      yoyPct: pctChange(row.revenueGrosze, prevYearGrosze),
      // `getMonthlySeries` always ends its window at the current month.
      partial: row.month === rows[last]?.month,
    };
  });
}
