import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  BUSINESS_GROUP_OF,
  type BusinessExpenseCategory,
  type BusinessExpenseGroup,
} from "@/lib/admin/business-expense-options";

/**
 * Company-wide costs, aggregated — the arithmetic behind the Finanse page.
 *
 * Two rules, and they are the same ones `economics.ts` uses for cars. They are
 * repeated here rather than shared through a helper because they are the reason
 * two pages can be trusted to agree:
 *
 * 1. **A cost is spread across the period it covers.** A year of hosting paid
 *    in January is a twelfth a month, not a January catastrophe followed by
 *    eleven free months. Both `period_start` and `period_end` null means the
 *    cost belongs to `incurred_on` alone. The TOTAL never changes — only which
 *    month it is attributed to.
 *
 * 2. **Company costs are never charged to a car.** Nothing in this file joins
 *    `cars` or `car_expenses`. The two sides meet exactly once, in
 *    `getCompanyResult`, and there they are added — never merged.
 *
 * Everything is in integer grosze.
 */

function rowsOf<T>(result: unknown): T[] {
  const r = result as T[] | { rows?: T[] };
  return Array.isArray(r) ? r : (r.rows ?? []);
}

const num = (v: unknown) => Number(v ?? 0) || 0;

/**
 * The day-spreading expression, written once.
 *
 * `generate_series` over the covered period, dividing the amount by the number
 * of days in it. A single-day cost degenerates to one row divided by one, which
 * is why one expression serves both shapes and there is no branch to get wrong.
 */
const SPREAD_DAYS = sql`
  CROSS JOIN LATERAL generate_series(
    COALESCE(e.period_start, e.incurred_on),
    GREATEST(COALESCE(e.period_end, e.incurred_on),
             COALESCE(e.period_start, e.incurred_on)),
    INTERVAL '1 day'
  ) AS g(d)
`;

const SPREAD_AMOUNT = sql`
  e.amount_grosze::numeric / GREATEST(1,
    (GREATEST(COALESCE(e.period_end, e.incurred_on),
              COALESCE(e.period_start, e.incurred_on))
     - COALESCE(e.period_start, e.incurred_on)) + 1)
`;

/* ── Monthly series ───────────────────────────────────────────────────────── */

export type BusinessMonthRow = {
  /** "2026-08" — sortable, and the label is derived from it for display. */
  month: string;
  expenseGrosze: number;
};

/**
 * Company costs month by month, ending with the month in progress.
 *
 * Months with no spending are still returned. A gap is information, and a table
 * that silently omits August reads as though August did not happen.
 */
export async function getBusinessMonthlySeries(
  months: number,
): Promise<BusinessMonthRow[]> {
  const rows = rowsOf<{ month: string; expense: number }>(
    await getDb().execute(sql`
      WITH win AS (
        SELECT generate_series(
          date_trunc('month', CURRENT_DATE) - MAKE_INTERVAL(months => ${months}::int - 1),
          date_trunc('month', CURRENT_DATE),
          INTERVAL '1 month'
        )::date AS m
      ),
      costs AS (
        SELECT date_trunc('month', g.d)::date AS m,
               SUM(${SPREAD_AMOUNT}) AS expense
        FROM business_expenses e
        ${SPREAD_DAYS}
        GROUP BY 1
      )
      SELECT to_char(win.m, 'YYYY-MM') AS month,
             COALESCE(ROUND(c.expense), 0)::bigint AS expense
      FROM win
      LEFT JOIN costs c ON c.m = win.m
      ORDER BY win.m ASC
    `),
  );

  return rows.map((r) => ({
    month: r.month,
    expenseGrosze: num(r.expense),
  }));
}

/* ── Structure: where the money goes ──────────────────────────────────────── */

export type BusinessCostSlice = {
  category: BusinessExpenseCategory;
  group: BusinessExpenseGroup;
  amountGrosze: number;
  /** Share of company costs in the window, 0–100. */
  sharePct: number;
};

export type BusinessGroupSlice = {
  group: BusinessExpenseGroup;
  amountGrosze: number;
  sharePct: number;
  categories: BusinessCostSlice[];
};

export type BusinessCostStructure = {
  totalGrosze: number;
  groups: BusinessGroupSlice[];
  /** Flat, biggest first — for the "na co poszło najwięcej" list. */
  categories: BusinessCostSlice[];
};

/**
 * What the company spent in a window, by category and by group.
 *
 * The window clips the SPREAD days, not the `incurred_on` date: a premium paid
 * in December that covers this quarter contributes its three months here, which
 * is the honest answer to "ile kosztował mnie ten kwartał".
 */
export async function getBusinessCostStructure(
  from: string,
  to: string,
): Promise<BusinessCostStructure> {
  const rows = rowsOf<{ category: string; amount: number }>(
    await getDb().execute(sql`
      SELECT e.category::text AS category,
             ROUND(SUM(${SPREAD_AMOUNT}))::bigint AS amount
      FROM business_expenses e
      ${SPREAD_DAYS}
      WHERE g.d BETWEEN ${from}::date AND ${to}::date
      GROUP BY e.category
      ORDER BY amount DESC
    `),
  );

  const categories: BusinessCostSlice[] = rows
    .map((r) => ({
      category: r.category as BusinessExpenseCategory,
      group: BUSINESS_GROUP_OF[r.category as BusinessExpenseCategory],
      amountGrosze: num(r.amount),
      sharePct: 0,
    }))
    // A category present in the database but absent from the picker would have
    // an undefined group and would silently vanish from every group total.
    // Dropping it here at least keeps the totals internally consistent.
    .filter((c) => c.group != null);

  const totalGrosze = categories.reduce((n, c) => n + c.amountGrosze, 0);
  const share = (v: number) => (totalGrosze > 0 ? (v / totalGrosze) * 100 : 0);
  for (const c of categories) c.sharePct = share(c.amountGrosze);

  const byGroup = new Map<BusinessExpenseGroup, BusinessCostSlice[]>();
  for (const c of categories) {
    const list = byGroup.get(c.group) ?? [];
    list.push(c);
    byGroup.set(c.group, list);
  }

  const groups: BusinessGroupSlice[] = [...byGroup.entries()]
    .map(([group, cats]) => {
      const amountGrosze = cats.reduce((n, c) => n + c.amountGrosze, 0);
      return {
        group,
        amountGrosze,
        sharePct: share(amountGrosze),
        categories: cats.sort((a, b) => b.amountGrosze - a.amountGrosze),
      };
    })
    .sort((a, b) => b.amountGrosze - a.amountGrosze);

  return { totalGrosze, groups, categories };
}

/* ── The company result ───────────────────────────────────────────────────── */

export type CompanyResult = {
  revenueGrosze: number;
  /** Costs booked against individual cars — servicing, fuel, insurance. */
  carCostGrosze: number;
  /** Costs of running the company — marketing, office, accountant. */
  businessCostGrosze: number;
  /** revenue − carCost − businessCost. Can be negative; that is the point. */
  resultGrosze: number;
  /**
   * Result as a share of revenue, 0–100 — or null when nothing was earned. A
   * month with no revenue has no margin: every percentage of zero is either
   * infinite or a lie, and the UI prints a dash instead.
   */
  marginPct: number | null;
};

/**
 * The one figure the owner actually asks for: what was left.
 *
 * Revenue uses the same definition as everywhere else in the panel — only
 * `confirmed` and `completed` reservations, spread across their rental days —
 * so this cannot disagree with Analityka about what a month earned. Car costs
 * and company costs are read separately and stay separate all the way to the
 * subtraction, so the page can always show which side the money went out on.
 */
export async function getCompanyResult(
  from: string,
  to: string,
): Promise<CompanyResult> {
  const [row] = rowsOf<{
    revenue: number;
    car_cost: number;
    business_cost: number;
  }>(
    await getDb().execute(sql`
      WITH revenue AS (
        SELECT COALESCE(SUM(r.total_grosze::numeric / GREATEST(r.days, 1)), 0) AS v
        FROM reservations r
        CROSS JOIN LATERAL generate_series(r.start_date, r.end_date, INTERVAL '1 day') AS g(d)
        WHERE r.status IN ('confirmed','completed')
          AND r.car_id IS NOT NULL
          AND g.d BETWEEN ${from}::date AND ${to}::date
      ),
      car_cost AS (
        SELECT COALESCE(SUM(${SPREAD_AMOUNT}), 0) AS v
        FROM car_expenses e
        ${SPREAD_DAYS}
        WHERE g.d BETWEEN ${from}::date AND ${to}::date
      ),
      business_cost AS (
        SELECT COALESCE(SUM(${SPREAD_AMOUNT}), 0) AS v
        FROM business_expenses e
        ${SPREAD_DAYS}
        WHERE g.d BETWEEN ${from}::date AND ${to}::date
      )
      SELECT ROUND((SELECT v FROM revenue))::bigint AS revenue,
             ROUND((SELECT v FROM car_cost))::bigint AS car_cost,
             ROUND((SELECT v FROM business_cost))::bigint AS business_cost
    `),
  );

  const revenueGrosze = num(row?.revenue);
  const carCostGrosze = num(row?.car_cost);
  const businessCostGrosze = num(row?.business_cost);
  const resultGrosze = revenueGrosze - carCostGrosze - businessCostGrosze;

  return {
    revenueGrosze,
    carCostGrosze,
    businessCostGrosze,
    resultGrosze,
    marginPct: revenueGrosze > 0 ? (resultGrosze / revenueGrosze) * 100 : null,
  };
}
