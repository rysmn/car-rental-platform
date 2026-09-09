import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

/**
 * Database side of payments. The labels, the status rule and the arithmetic
 * live in `payment-options.ts` so client components can import them without
 * dragging `server-only` into the browser bundle.
 */

export * from "./payment-options";

export async function listPayments(reservationId: string) {
  return getDb()
    .select()
    .from(schema.reservationPayments)
    .where(eq(schema.reservationPayments.reservationId, reservationId))
    .orderBy(asc(schema.reservationPayments.paidOn));
}

/** Total received against one reservation. */
export async function paidTotal(reservationId: string): Promise<number> {
  const [row] = (await getDb().execute(sql`
    SELECT COALESCE(SUM(amount_grosze), 0) AS paid
    FROM reservation_payments WHERE reservation_id = ${reservationId}::uuid
  `)) as unknown as { paid: string | number }[];
  return Number(row?.paid ?? 0) || 0;
}

/**
 * Keep `reservations.paid_at` in step with the payments beneath it.
 *
 * Derived, never typed: the moment a rental became fully settled is a fact
 * about the payments, and letting an admin set it independently is how a
 * booking ends up marked paid with nothing recorded against it.
 */
export async function syncPaidAt(reservationId: string): Promise<void> {
  await getDb().execute(sql`
    UPDATE reservations r
    SET paid_at = CASE
          WHEN COALESCE(p.paid, 0) >= r.total_grosze AND r.total_grosze > 0
            THEN COALESCE(r.paid_at, now())
          ELSE NULL
        END,
        updated_at = now()
    FROM (
      SELECT COALESCE(SUM(amount_grosze), 0) AS paid
      FROM reservation_payments WHERE reservation_id = ${reservationId}::uuid
    ) p
    WHERE r.id = ${reservationId}::uuid
  `);
}
