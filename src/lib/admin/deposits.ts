import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import {
  summariseDeposit,
  type DepositEvent,
  type DepositStatus,
  type DepositSummary,
} from "./deposit-options";

/**
 * Database side of deposits. Labels, the arithmetic and the suggested next
 * step live in `deposit-options.ts` so client components can import them
 * without dragging `server-only` into the browser bundle.
 */

export * from "./deposit-options";

function rowsOf<T>(result: unknown): T[] {
  const r = result as T[] | { rows?: T[] };
  return Array.isArray(r) ? r : (r.rows ?? []);
}

const num = (v: unknown) => Number(v ?? 0) || 0;

/** The log of one deposit, oldest first — the order it is read in. */
export async function listDepositEvents(
  reservationId: string,
): Promise<DepositEvent[]> {
  const rows = await getDb()
    .select({
      id: schema.reservationDepositEvents.id,
      status: schema.reservationDepositEvents.status,
      amountGrosze: schema.reservationDepositEvents.amountGrosze,
      keptGrosze: schema.reservationDepositEvents.keptGrosze,
      method: schema.reservationDepositEvents.method,
      note: schema.reservationDepositEvents.note,
      createdAt: schema.reservationDepositEvents.createdAt,
      by: schema.admins.name,
    })
    .from(schema.reservationDepositEvents)
    .leftJoin(
      schema.admins,
      eq(schema.admins.id, schema.reservationDepositEvents.createdBy),
    )
    .where(eq(schema.reservationDepositEvents.reservationId, reservationId))
    .orderBy(asc(schema.reservationDepositEvents.createdAt));

  return rows.map((r) => ({
    id: r.id,
    status: r.status as DepositStatus,
    amountGrosze: r.amountGrosze,
    keptGrosze: r.keptGrosze,
    method: r.method,
    note: r.note,
    createdAt:
      r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    by: r.by ?? null,
  }));
}

export type DepositRow = {
  reservationId: string;
  reference: string;
  reservationStatus: string;
  customerName: string;
  customerPhone: string;
  car: string;
  plate: string | null;
  startDate: string;
  endDate: string;
  summary: DepositSummary;
  /** Who moved it last, and when — the answer to "who let it go". */
  lastBy: string | null;
  lastAt: string | null;
};

/**
 * Every rental whose deposit is still somebody's business.
 *
 * Included: anything with a log, plus anything the price list says carries a
 * deposit and that has not been cancelled or rejected. Excluded: `no_deposit`
 * rentals with no history — there is nothing to take, hold or give back, and
 * listing them would bury the six rows that need doing under thirty that do
 * not.
 */
export async function listDeposits(filter?: DepositStatus): Promise<DepositRow[]> {
  const rows = rowsOf<{
    reservation_id: string;
    reference: string;
    reservation_status: string;
    customer_name: string;
    customer_phone: string;
    car: string;
    plate: string | null;
    start_date: string;
    end_date: string;
    deposit_variant: string;
    deposit_grosze: number | string;
    events: string | null;
    last_by: string | null;
    last_at: string | null;
  }>(
    await getDb().execute(sql`
      SELECT r.id::text            AS reservation_id,
             r.reference,
             r.status::text        AS reservation_status,
             r.customer_name,
             r.customer_phone,
             COALESCE(cm.brand || ' ' || cm.model, '—') AS car,
             c.plate,
             r.start_date::text    AS start_date,
             r.end_date::text      AS end_date,
             r.deposit_variant::text AS deposit_variant,
             r.deposit_grosze,
             e.events,
             e.last_by,
             e.last_at
      FROM reservations r
      LEFT JOIN car_models cm ON cm.id = r.car_model_id
      LEFT JOIN cars c ON c.id = r.car_id
      LEFT JOIN LATERAL (
        SELECT json_agg(
                 json_build_object(
                   'id', d.id,
                   'status', d.status,
                   'amountGrosze', d.amount_grosze,
                   'keptGrosze', d.kept_grosze,
                   'method', d.method,
                   'note', d.note,
                   'createdAt', d.created_at,
                   'by', a.name
                 ) ORDER BY d.created_at
               )::text                                   AS events,
               (array_agg(a.name ORDER BY d.created_at DESC))[1]       AS last_by,
               (array_agg(d.created_at ORDER BY d.created_at DESC))[1] AS last_at
        FROM reservation_deposit_events d
        LEFT JOIN admins a ON a.id = d.created_by
        WHERE d.reservation_id = r.id
      ) e ON TRUE
      WHERE e.events IS NOT NULL
         OR (r.deposit_variant <> 'no_deposit'
             AND r.deposit_grosze > 0
             AND r.status NOT IN ('cancelled', 'rejected'))
      ORDER BY r.start_date DESC
    `),
  );

  const out: DepositRow[] = rows.map((r) => {
    const events = (
      r.events ? (JSON.parse(r.events) as DepositEvent[]) : []
    ).map((e) => ({ ...e, createdAt: String(e.createdAt) }));
    return {
      reservationId: r.reservation_id,
      reference: r.reference,
      reservationStatus: r.reservation_status,
      customerName: r.customer_name,
      customerPhone: r.customer_phone,
      car: r.car,
      plate: r.plate,
      startDate: String(r.start_date).slice(0, 10),
      endDate: String(r.end_date).slice(0, 10),
      summary: summariseDeposit(
        num(r.deposit_grosze),
        r.deposit_variant,
        events,
      ),
      lastBy: r.last_by,
      lastAt: r.last_at ? String(r.last_at) : null,
    };
  });

  return filter ? out.filter((r) => r.summary.status === filter) : out;
}

export type DepositTotals = {
  toReturnCount: number;
  toReturnGrosze: number;
  heldCount: number;
  heldGrosze: number;
};

/**
 * The two numbers the dashboard says out loud.
 *
 * "Kaucje do zwrotu: 3 / 6 000 zł" is one alert, not three: a list with a row
 * per deposit pushes the overdue car and the unconfirmed booking off the
 * screen, and money owed back is a batch job anyway — the operator does them
 * in one sitting or not at all.
 */
export async function depositTotals(): Promise<DepositTotals> {
  const all = await listDeposits();
  const toReturn = all.filter((r) => r.summary.status === "to_return");
  const held = all.filter(
    (r) => r.summary.status === "held" || r.summary.status === "blocked",
  );
  const sum = (rows: DepositRow[]) =>
    rows.reduce(
      (acc, r) => acc + (r.summary.securedGrosze || r.summary.dueGrosze),
      0,
    );
  return {
    toReturnCount: toReturn.length,
    toReturnGrosze: sum(toReturn),
    heldCount: held.length,
    heldGrosze: sum(held),
  };
}
