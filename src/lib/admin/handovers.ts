import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import {
  type Cleanliness,
  type HandoverKind,
  type HandoverRecord,
} from "./handover-options";

/**
 * Database side of the handover protocols. Labels, the catalogue and the
 * comparison live in `handover-options.ts` so the mobile forms can import them
 * without dragging `server-only` into the browser bundle.
 */

export * from "./handover-options";

export async function getHandover(
  reservationId: string,
  kind: HandoverKind,
): Promise<HandoverRecord | null> {
  const [row] = await getDb()
    .select({
      id: schema.reservationHandovers.id,
      kind: schema.reservationHandovers.kind,
      odometerKm: schema.reservationHandovers.odometerKm,
      fuelEighths: schema.reservationHandovers.fuelEighths,
      cleanliness: schema.reservationHandovers.cleanliness,
      keysCount: schema.reservationHandovers.keysCount,
      damageNote: schema.reservationHandovers.damageNote,
      note: schema.reservationHandovers.note,
      signatureUrl: schema.reservationHandovers.signatureUrl,
      signedByName: schema.reservationHandovers.signedByName,
      signedAt: schema.reservationHandovers.signedAt,
      createdAt: schema.reservationHandovers.createdAt,
      by: schema.admins.name,
    })
    .from(schema.reservationHandovers)
    .leftJoin(
      schema.admins,
      eq(schema.admins.id, schema.reservationHandovers.createdBy),
    )
    .where(
      and(
        eq(schema.reservationHandovers.reservationId, reservationId),
        eq(schema.reservationHandovers.kind, kind),
      ),
    );
  if (!row) return null;

  const items = await getDb()
    .select({
      code: schema.handoverItems.code,
      present: schema.handoverItems.present,
      note: schema.handoverItems.note,
    })
    .from(schema.handoverItems)
    .where(eq(schema.handoverItems.handoverId, row.id))
    .orderBy(asc(schema.handoverItems.code));

  return {
    id: row.id,
    kind: row.kind as HandoverKind,
    odometerKm: row.odometerKm,
    fuelEighths: row.fuelEighths,
    cleanliness: row.cleanliness as Cleanliness,
    keysCount: row.keysCount,
    damageNote: row.damageNote,
    note: row.note,
    signatureUrl: row.signatureUrl,
    signedByName: row.signedByName,
    signedAt:
      row.signedAt instanceof Date
        ? row.signedAt.toISOString()
        : row.signedAt
          ? String(row.signedAt)
          : null,
    by: row.by ?? null,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
    items,
  };
}

/** Both protocols of one rental, for the reservation page and the comparison. */
export async function getBothHandovers(reservationId: string): Promise<{
  pickup: HandoverRecord | null;
  return: HandoverRecord | null;
}> {
  const [pickup, ret] = await Promise.all([
    getHandover(reservationId, "pickup"),
    getHandover(reservationId, "return"),
  ]);
  return { pickup, return: ret };
}

/**
 * Keep the reservation's odometer columns in step with the protocols.
 *
 * Derived, never typed — the same direction of travel as `paid_at` from
 * payments. Analytics divides cost by kilometres, and two hands-on records of
 * the same number that can disagree is how a mileage charge becomes an
 * argument with a customer standing in the office.
 *
 * `COALESCE` and not a plain assignment: a protocol overwrites the column it
 * covers, but the ABSENCE of a protocol must never erase a reading typed in by
 * hand. Every rental from before this module has its kilometres only in those
 * columns, and saving a handover for one of them would otherwise wipe the
 * other end of the rental.
 */
export async function syncOdometer(reservationId: string): Promise<void> {
  await getDb().execute(sql`
    UPDATE reservations r
       SET start_odometer_km = COALESCE(p.km, r.start_odometer_km),
           end_odometer_km   = COALESCE(z.km, r.end_odometer_km),
           updated_at = now()
      FROM (SELECT odometer_km AS km FROM reservation_handovers
             WHERE reservation_id = ${reservationId}::uuid AND kind = 'pickup') p
      FULL JOIN (SELECT odometer_km AS km FROM reservation_handovers
                  WHERE reservation_id = ${reservationId}::uuid AND kind = 'return') z
        ON TRUE
     WHERE r.id = ${reservationId}::uuid
  `);
}

/**
 * The highest odometer reading anybody has recorded for this car.
 *
 * Offered as a starting point on a handover form, never as the answer: the
 * person at the car types what the dial says. `GREATEST` of the fleet record
 * and the protocols because both are written by hand at different moments —
 * taking only one of them would suggest a number that is already known to be
 * too low, and a suggestion that is wrong in the SAME direction every time is
 * the kind that gets accepted without looking.
 */
export async function lastKnownOdometer(
  carId: string | null,
): Promise<number | null> {
  if (!carId) return null;
  const rows = (await getDb().execute(sql`
    SELECT GREATEST(
             COALESCE(c.mileage_km, 0),
             COALESCE((SELECT MAX(h.odometer_km)
                         FROM reservation_handovers h
                         JOIN reservations r ON r.id = h.reservation_id
                        WHERE r.car_id = ${carId}::uuid), 0)
           )::int AS km
      FROM cars c WHERE c.id = ${carId}::uuid
  `)) as unknown as { km: number }[] | { rows?: { km: number }[] };
  const list = Array.isArray(rows) ? rows : (rows.rows ?? []);
  const km = Number(list[0]?.km ?? 0);
  return km > 0 ? km : null;
}
