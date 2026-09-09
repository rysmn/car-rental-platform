import "server-only";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { ExpenseCategory } from "@/lib/admin/expense-options";
import type {
  RecurringInterval,
  RecurringRow,
} from "@/lib/admin/recurring-options";

/**
 * Database access for recurring costs. The vocabulary, the labels and the
 * period maths live in `recurring-options` so the admin form can use them in
 * the browser.
 */

/* ── Queries ──────────────────────────────────────────────────────────────── */

/** Definitions for one model's units, keyed by car id. */
export async function listRecurringByModel(
  modelId: string,
): Promise<Record<string, RecurringRow[]>> {
  const db = getDb();
  const rows = await db
    .select({ r: schema.recurringCosts })
    .from(schema.recurringCosts)
    .innerJoin(schema.cars, eq(schema.cars.id, schema.recurringCosts.carId))
    .where(eq(schema.cars.modelId, modelId))
    .orderBy(asc(schema.recurringCosts.startOn));

  // One extra query for the generated counts rather than N — the number is
  // only there to tell the operator whether pressing the button will do
  // anything, and it should not cost a round trip per definition.
  const counts = new Map<string, number>();
  const generated = await db
    .select({
      recurringId: schema.carExpenses.recurringId,
      id: schema.carExpenses.id,
    })
    .from(schema.carExpenses)
    .innerJoin(schema.cars, eq(schema.cars.id, schema.carExpenses.carId))
    .where(eq(schema.cars.modelId, modelId));
  for (const g of generated) {
    if (g.recurringId) {
      counts.set(g.recurringId, (counts.get(g.recurringId) ?? 0) + 1);
    }
  }

  const byCar: Record<string, RecurringRow[]> = {};
  for (const { r } of rows) {
    (byCar[r.carId] ??= []).push({
      id: r.id,
      carId: r.carId,
      category: r.category as ExpenseCategory,
      amountGrosze: r.amountGrosze,
      interval: r.interval as RecurringInterval,
      startOn: String(r.startOn).slice(0, 10),
      endOn: r.endOn ? String(r.endOn).slice(0, 10) : null,
      note: r.note,
      active: r.active,
      generated: counts.get(r.id) ?? 0,
    });
  }
  return byCar;
}
