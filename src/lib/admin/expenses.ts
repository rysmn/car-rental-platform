import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { ExpenseCategory } from "@/lib/admin/expense-options";

/**
 * Reading car expenses. Writes go through the fleet server actions, which own
 * validation and the audit trail.
 */

export type CarExpenseRow = {
  id: string;
  carId: string;
  category: ExpenseCategory;
  amountGrosze: number;
  incurredOn: string;
  odometerKm: number | null;
  /** Both set = the cost is spread over this range; both null = a single day. */
  periodStart: string | null;
  periodEnd: string | null;
  /** Set when the row was generated from a recurring definition. */
  recurringId: string | null;
  invoicePath: string | null;
  note: string | null;
};

const toRow = (r: typeof schema.carExpenses.$inferSelect): CarExpenseRow => ({
  id: r.id,
  carId: r.carId,
  category: r.category as ExpenseCategory,
  amountGrosze: r.amountGrosze,
  // `date` columns come back as "YYYY-MM-DD" strings from postgres-js; the
  // slice is belt and braces for a driver that ever hands over a Date.
  incurredOn: String(r.incurredOn).slice(0, 10),
  odometerKm: r.odometerKm,
  periodStart: r.periodStart ? String(r.periodStart).slice(0, 10) : null,
  periodEnd: r.periodEnd ? String(r.periodEnd).slice(0, 10) : null,
  recurringId: r.recurringId,
  invoicePath: r.invoicePath,
  note: r.note,
});

/** One car's expenses, newest first — the service history as an operator reads it. */
export async function listCarExpenses(carId: string): Promise<CarExpenseRow[]> {
  const rows = await getDb()
    .select()
    .from(schema.carExpenses)
    .where(eq(schema.carExpenses.carId, carId))
    .orderBy(
      desc(schema.carExpenses.incurredOn),
      desc(schema.carExpenses.createdAt),
    );
  return rows.map(toRow);
}

/**
 * Every expense for every unit of one model, keyed by car id.
 *
 * The fleet editor shows all units of a model on one page, so it needs the lot
 * in a single query rather than one per unit.
 */
export async function listExpensesByModel(
  modelId: string,
): Promise<Record<string, CarExpenseRow[]>> {
  const rows = await getDb()
    .select({ e: schema.carExpenses })
    .from(schema.carExpenses)
    .innerJoin(schema.cars, eq(schema.cars.id, schema.carExpenses.carId))
    .where(eq(schema.cars.modelId, modelId))
    .orderBy(desc(schema.carExpenses.incurredOn), asc(schema.carExpenses.id));

  const byCar: Record<string, CarExpenseRow[]> = {};
  for (const { e } of rows) {
    (byCar[e.carId] ??= []).push(toRow(e));
  }
  return byCar;
}
