import "server-only";
import { sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { ourCostGrosze } from "./damage-options";
import { listDamages } from "./damages";
import { summariseDeposit, type DepositEvent } from "./deposit-options";
import type { CustomerFlag } from "./customer-flags";

/**
 * Everything the office knows about one customer, in one read.
 *
 * The order asked for this only after payments, deposits and damages existed,
 * and that was right: every figure here is a sum over one of those three, and
 * computing them earlier would have meant inventing numbers to fill the page.
 */

export * from "./customer-flags";

function rowsOf<T>(result: unknown): T[] {
  const r = result as T[] | { rows?: T[] };
  return Array.isArray(r) ? r : (r.rows ?? []);
}

const num = (v: unknown) => Number(v ?? 0) || 0;

export type CustomerRental = {
  id: string;
  reference: string;
  status: string;
  startDate: string;
  endDate: string;
  car: string;
  totalGrosze: number;
  paidGrosze: number;
  /** Zwrot spisany po terminie — z protokołu, nie z domysłu. */
  lateReturn: boolean;
};

export type CustomerCard = {
  id: string;
  name: string;
  phone: string;
  phoneDisplay: string;
  email: string | null;
  notes: string | null;
  flag: CustomerFlag;
  rentals: CustomerRental[];
  /** Ile ten człowiek naprawdę zapłacił — suma wpłat, nie suma wycen. */
  spentGrosze: number;
  /** Ile jeszcze wisi na najmach potwierdzonych i zakończonych. */
  outstandingGrosze: number;
  lateReturns: number;
  damagesTotal: number;
  damagesOpen: number;
  damagesOursGrosze: number;
  depositSecuredGrosze: number;
  depositToReturnCount: number;
};

export async function getCustomerCard(id: string): Promise<CustomerCard | null> {
  const [customer] = await getDb()
    .select()
    .from(schema.customers)
    .where(eq(schema.customers.id, id));
  if (!customer) return null;

  const rentals = rowsOf<{
    id: string;
    reference: string;
    status: string;
    start_date: string;
    end_date: string;
    car: string;
    total_grosze: number | string;
    paid: number | string;
    late_return: boolean;
  }>(
    await getDb().execute(sql`
      SELECT r.id::text, r.reference, r.status::text,
             r.start_date::text, r.end_date::text,
             COALESCE(cm.brand || ' ' || cm.model, '—') AS car,
             r.total_grosze,
             COALESCE((SELECT SUM(p.amount_grosze) FROM reservation_payments p
                        WHERE p.reservation_id = r.id), 0) AS paid,
             -- Spóźniony zwrot liczony z PROTOKOŁU, nie z „dziś minęło":
             -- data spisania zwrotu późniejsza niż koniec najmu to fakt,
             -- a nie domysł o aucie, które być może stoi już na parkingu.
             EXISTS (SELECT 1 FROM reservation_handovers h
                      WHERE h.reservation_id = r.id AND h.kind = 'return'
                        AND h.created_at::date > r.end_date) AS late_return
        FROM reservations r
        LEFT JOIN car_models cm ON cm.id = r.car_model_id
       WHERE r.customer_id = ${id}::uuid
       ORDER BY r.start_date DESC
    `),
  );

  const list: CustomerRental[] = rentals.map((r) => ({
    id: r.id,
    reference: r.reference,
    status: r.status,
    startDate: String(r.start_date).slice(0, 10),
    endDate: String(r.end_date).slice(0, 10),
    car: r.car,
    totalGrosze: num(r.total_grosze),
    paidGrosze: num(r.paid),
    lateReturn: Boolean(r.late_return),
  }));

  // Należności tylko z najmów, które się odbyły albo trwają. Odrzucona prośba
  // o rezerwację nie jest długiem i nie ma prawa siedzieć w kartotece jako
  // czerwona liczba.
  const owedStatuses = new Set(["confirmed", "completed"]);
  const outstanding = list
    .filter((r) => owedStatuses.has(r.status))
    .reduce((a, r) => a + Math.max(0, r.totalGrosze - r.paidGrosze), 0);

  const damages = await listDamages({ customerId: id });

  const depositRows = rowsOf<{
    reservation_id: string;
    deposit_grosze: number | string;
    deposit_variant: string;
    events: string | null;
  }>(
    await getDb().execute(sql`
      SELECT r.id::text AS reservation_id, r.deposit_grosze, r.deposit_variant::text,
             (SELECT json_agg(json_build_object(
                        'id', d.id, 'status', d.status,
                        'amountGrosze', d.amount_grosze, 'keptGrosze', d.kept_grosze,
                        'method', d.method, 'note', d.note,
                        'createdAt', d.created_at, 'by', NULL)
                      ORDER BY d.created_at)::text
                FROM reservation_deposit_events d WHERE d.reservation_id = r.id) AS events
        FROM reservations r WHERE r.customer_id = ${id}::uuid
    `),
  );

  let secured = 0;
  let toReturn = 0;
  for (const row of depositRows) {
    const events = row.events
      ? (JSON.parse(row.events) as DepositEvent[])
      : [];
    const summary = summariseDeposit(
      num(row.deposit_grosze),
      row.deposit_variant,
      events,
    );
    secured += summary.securedGrosze;
    if (summary.status === "to_return") toReturn += 1;
  }

  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    phoneDisplay: customer.phoneDisplay,
    email: customer.email,
    notes: customer.notes,
    flag: customer.flag as CustomerFlag,
    rentals: list,
    spentGrosze: list.reduce((a, r) => a + r.paidGrosze, 0),
    outstandingGrosze: outstanding,
    lateReturns: list.filter((r) => r.lateReturn).length,
    damagesTotal: damages.length,
    damagesOpen: damages.filter((d) => d.status !== "closed").length,
    damagesOursGrosze: damages.reduce((a, d) => a + ourCostGrosze(d), 0),
    depositSecuredGrosze: secured,
    depositToReturnCount: toReturn,
  };
}
