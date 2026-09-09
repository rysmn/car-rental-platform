import "server-only";
import { and, desc, asc, eq, gte, lte, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { BusinessExpenseCategory } from "@/lib/admin/business-expense-options";
import type { RecurringInterval } from "@/lib/admin/recurring-options";

/**
 * Reading company costs. Writes go through the Finanse server actions, which
 * own validation and the audit trail.
 *
 * Everything here is company-wide by definition — there is no `carId` to filter
 * by, which is the whole point of the table. Costs that DO belong to one car
 * live in `car_expenses` and are read by `lib/admin/economics`.
 */

export type BusinessExpenseRow = {
  id: string;
  category: BusinessExpenseCategory;
  amountGrosze: number;
  incurredOn: string;
  /** Both set = the cost is spread over this range; both null = a single day. */
  periodStart: string | null;
  periodEnd: string | null;
  /** Set when the row was generated from a recurring definition. */
  recurringId: string | null;
  vendor: string | null;
  invoicePath: string | null;
  note: string | null;
};

const toRow = (
  r: typeof schema.businessExpenses.$inferSelect,
): BusinessExpenseRow => ({
  id: r.id,
  category: r.category as BusinessExpenseCategory,
  amountGrosze: r.amountGrosze,
  // `date` columns come back as "YYYY-MM-DD" strings from postgres-js; the
  // slice is belt and braces for a driver that ever hands over a Date.
  incurredOn: String(r.incurredOn).slice(0, 10),
  periodStart: r.periodStart ? String(r.periodStart).slice(0, 10) : null,
  periodEnd: r.periodEnd ? String(r.periodEnd).slice(0, 10) : null,
  recurringId: r.recurringId,
  vendor: r.vendor,
  invoicePath: r.invoicePath,
  note: r.note,
});

/**
 * Company costs in a date window, newest first.
 *
 * Filtered on `incurred_on` — the day the money went out — NOT on the period a
 * cost covers. A window is what the operator scrolled to; the period is how the
 * charts spread the amount, and mixing the two would make the list and its own
 * total disagree.
 */
export async function listBusinessExpenses(
  from: string,
  to: string,
): Promise<BusinessExpenseRow[]> {
  const rows = await getDb()
    .select()
    .from(schema.businessExpenses)
    .where(
      and(
        gte(schema.businessExpenses.incurredOn, from),
        lte(schema.businessExpenses.incurredOn, to),
      ),
    )
    .orderBy(
      desc(schema.businessExpenses.incurredOn),
      desc(schema.businessExpenses.createdAt),
    );
  return rows.map(toRow);
}

export type BusinessRecurringRow = {
  id: string;
  category: BusinessExpenseCategory;
  amountGrosze: number;
  interval: RecurringInterval;
  startOn: string;
  endOn: string | null;
  vendor: string | null;
  note: string | null;
  active: boolean;
  /** How many rows this definition has already generated. */
  generated: number;
};

/** Every subscription definition, with the count of rows it has written. */
export async function listBusinessRecurring(): Promise<BusinessRecurringRow[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.businessRecurringCosts)
    .orderBy(
      desc(schema.businessRecurringCosts.active),
      asc(schema.businessRecurringCosts.startOn),
    );

  // One grouped query for the counts rather than one per definition — the
  // number only tells the operator whether pressing "uzupełnij" will do
  // anything, and it should not cost a round trip each.
  const counts = new Map<string, number>();
  const generated = await db
    .select({
      recurringId: schema.businessExpenses.recurringId,
      n: sql<number>`COUNT(*)::int`,
    })
    .from(schema.businessExpenses)
    .groupBy(schema.businessExpenses.recurringId);
  for (const g of generated) {
    if (g.recurringId) counts.set(g.recurringId, Number(g.n));
  }

  return rows.map((r) => ({
    id: r.id,
    category: r.category as BusinessExpenseCategory,
    amountGrosze: r.amountGrosze,
    interval: r.interval as RecurringInterval,
    startOn: String(r.startOn).slice(0, 10),
    endOn: r.endOn ? String(r.endOn).slice(0, 10) : null,
    vendor: r.vendor,
    note: r.note,
    active: r.active,
    generated: counts.get(r.id) ?? 0,
  }));
}

/** One row, for the edit path and the audit "before" snapshot. */
export async function getBusinessExpense(
  id: string,
): Promise<BusinessExpenseRow | null> {
  const [row] = await getDb()
    .select()
    .from(schema.businessExpenses)
    .where(eq(schema.businessExpenses.id, id))
    .limit(1);
  return row ? toRow(row) : null;
}
