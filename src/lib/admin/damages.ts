import "server-only";
import { sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import {
  ourCostGrosze,
  type DamagePhotoRecord,
  type DamageRecord,
  type DamageStatus,
} from "./damage-options";

/**
 * Database side of the damage module. Labels, tones and `ourCostGrosze` live
 * in `damage-options.ts` so the forms can import them without dragging
 * `server-only` into the browser bundle.
 */

export * from "./damage-options";

function rowsOf<T>(result: unknown): T[] {
  const r = result as T[] | { rows?: T[] };
  return Array.isArray(r) ? r : (r.rows ?? []);
}

const num = (v: unknown) => Number(v ?? 0) || 0;
const iso = (v: unknown) =>
  v instanceof Date ? v.toISOString() : v ? String(v) : null;

type Row = {
  id: string;
  car_id: string;
  car: string;
  plate: string | null;
  reservation_id: string | null;
  reference: string | null;
  customer_id: string | null;
  customer_name: string | null;
  occurred_on: string;
  title: string;
  description: string | null;
  status: string;
  repair_cost_grosze: number | string;
  excess_grosze: number | string;
  insurer: string | null;
  claim_number: string | null;
  closed_at: string | null;
  created_at: string;
  photos: string | null;
};

function toRecord(r: Row): DamageRecord {
  return {
    id: r.id,
    carId: r.car_id,
    car: r.car,
    plate: r.plate,
    reservationId: r.reservation_id,
    reference: r.reference,
    customerId: r.customer_id,
    customerName: r.customer_name,
    occurredOn: String(r.occurred_on).slice(0, 10),
    title: r.title,
    description: r.description,
    status: r.status as DamageStatus,
    repairCostGrosze: num(r.repair_cost_grosze),
    excessGrosze: num(r.excess_grosze),
    insurer: r.insurer,
    claimNumber: r.claim_number,
    closedAt: iso(r.closed_at),
    createdAt: iso(r.created_at) ?? "",
    photos: (r.photos ? (JSON.parse(r.photos) as DamagePhotoRecord[]) : []).map(
      (p) => ({ id: p.id, url: p.url, note: p.note ?? null }),
    ),
  };
}

const SELECT = sql`
  SELECT d.id::text,
         d.car_id::text,
         COALESCE(cm.brand || ' ' || cm.model, '—') AS car,
         c.plate,
         d.reservation_id::text,
         r.reference,
         d.customer_id::text,
         COALESCE(cu.name, r.customer_name) AS customer_name,
         d.occurred_on::text,
         d.title,
         d.description,
         d.status::text,
         d.repair_cost_grosze,
         d.excess_grosze,
         d.insurer,
         d.claim_number,
         d.closed_at,
         d.created_at,
         (SELECT json_agg(json_build_object('id', p.id, 'url', p.url, 'note', p.note)
                          ORDER BY p.created_at)::text
            FROM damage_photos p WHERE p.damage_id = d.id) AS photos
    FROM damages d
    JOIN cars c ON c.id = d.car_id
    LEFT JOIN car_models cm ON cm.id = c.model_id
    LEFT JOIN reservations r ON r.id = d.reservation_id
    LEFT JOIN customers cu ON cu.id = d.customer_id
`;

export async function listDamages(filter?: {
  status?: DamageStatus;
  carId?: string;
  customerId?: string;
}): Promise<DamageRecord[]> {
  const rows = rowsOf<Row>(
    await getDb().execute(sql`
      ${SELECT}
      WHERE (${filter?.status ?? null}::text IS NULL OR d.status::text = ${filter?.status ?? null})
        AND (${filter?.carId ?? null}::uuid IS NULL OR d.car_id = ${filter?.carId ?? null}::uuid)
        AND (${filter?.customerId ?? null}::uuid IS NULL OR d.customer_id = ${filter?.customerId ?? null}::uuid)
      ORDER BY (d.status = 'closed'), d.occurred_on DESC
    `),
  );
  return rows.map(toRecord);
}

export async function getDamage(id: string): Promise<DamageRecord | null> {
  const rows = rowsOf<Row>(
    await getDb().execute(sql`${SELECT} WHERE d.id = ${id}::uuid`),
  );
  return rows[0] ? toRecord(rows[0]) : null;
}

export type DamageTotals = {
  openCount: number;
  openOursGrosze: number;
  waitingOnInsurer: number;
};

/**
 * The three numbers a manager asks about damages, and no more.
 *
 * "Ours" and not "repair cost": with an insurer on the case the firm pays the
 * deductible, and totalling the repair would report a loss that never
 * happened.
 */
export async function damageTotals(): Promise<DamageTotals> {
  const all = await listDamages();
  const open = all.filter((d) => d.status !== "closed");
  return {
    openCount: open.length,
    openOursGrosze: open.reduce((a, d) => a + ourCostGrosze(d), 0),
    waitingOnInsurer: all.filter((d) => d.status === "insurer").length,
  };
}

/** Open cases per car — for the badge on the fleet page. */
export async function openDamagesByCar(): Promise<Map<string, number>> {
  const rows = rowsOf<{ car_id: string; n: number }>(
    await getDb().execute(sql`
      SELECT car_id::text, COUNT(*)::int AS n
        FROM damages WHERE status <> 'closed' GROUP BY car_id
    `),
  );
  return new Map(rows.map((r) => [r.car_id, Number(r.n)]));
}

/** Damage history of one customer — for their card. */
export async function damagesOfCustomer(customerId: string) {
  return listDamages({ customerId });
}

export async function addPhoto(damageId: string, url: string, note?: string) {
  await getDb()
    .insert(schema.damagePhotos)
    .values({ damageId, url, note: note || null });
}

export async function listRecentDamages(limit = 5): Promise<DamageRecord[]> {
  const rows = rowsOf<Row>(
    await getDb().execute(sql`
      ${SELECT} WHERE d.status <> 'closed'
      ORDER BY d.occurred_on DESC LIMIT ${limit}
    `),
  );
  return rows.map(toRecord);
}


export type CarChoice = { id: string; label: string };

/** Every physical car, named the way an operator says it: marka model · rejestracja. */
export async function listCarChoices(): Promise<CarChoice[]> {
  const rows = rowsOf<{ id: string; label: string }>(
    await getDb().execute(sql`
      SELECT c.id::text,
             COALESCE(cm.brand || ' ' || cm.model, 'Auto') ||
               COALESCE(' · ' || c.plate, '') AS label
        FROM cars c
        LEFT JOIN car_models cm ON cm.id = c.model_id
       ORDER BY cm.brand, cm.model, c.plate
    `),
  );
  return rows;
}

export type ReservationChoice = { id: string; label: string; carId: string };

/**
 * Rentals that can carry a damage: the ones that actually happened.
 *
 * Pending and rejected requests are out — nobody drove those, so a damage
 * attached to one would be a repair blamed on a rental that never began.
 */
export async function listReservationChoices(): Promise<ReservationChoice[]> {
  const rows = rowsOf<{ id: string; label: string; car_id: string }>(
    await getDb().execute(sql`
      SELECT r.id::text,
             r.reference || ' · ' || r.customer_name || ' · ' ||
               to_char(r.start_date, 'DD.MM.YYYY') AS label,
             r.car_id::text
        FROM reservations r
       WHERE r.status IN ('confirmed', 'completed') AND r.car_id IS NOT NULL
       ORDER BY r.start_date DESC
       LIMIT 200
    `),
  );
  return rows.map((r) => ({ id: r.id, label: r.label, carId: r.car_id }));
}
