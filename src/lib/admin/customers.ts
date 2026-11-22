import "server-only";
import type { CustomerFlag } from "./customer-flags";
import { desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

/**
 * The customer directory.
 *
 * Its whole job is to make the second phone call from the same person faster
 * than the first. Reservations keep their own copy of the name, phone and
 * email as agreed on that rental — this is the address book, not the record.
 */

/**
 * "+48 601 100 200", "601 100 200" and "0048601100200" are the same person.
 *
 * Everything that is not a digit goes; a leading 00 becomes +, a bare
 * nine-digit number is assumed Polish and gets +48. Without this, the same
 * customer is three rows and the lookup never fires.
 */
export function normalisePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
  let out = digits.startsWith("+") ? digits.slice(1) : digits;
  if (out.startsWith("00")) out = out.slice(2);
  if (out.length === 9) out = `48${out}`;
  return out ? `+${out}` : "";
}

export type CustomerRow = {
  id: string;
  phone: string;
  phoneDisplay: string;
  name: string;
  email: string | null;
  notes: string | null;
  /** Wewnętrzna flaga biura — nigdy poza panelem. */
  flag: CustomerFlag;
  /** How many rentals are already on this person's record. */
  rentals: number;
  /** Damage cases pinned to this person — all of them, and the open ones. */
  damages: number;
  damagesOpen: number;
  lastRentalOn: string | null;
};

/** Look one up by whatever the operator typed into the phone field. */
export async function findCustomerByPhone(
  raw: string,
): Promise<CustomerRow | null> {
  const phone = normalisePhone(raw);
  if (phone.length < 7) return null;

  const rows = (await getDb().execute(sql`
    SELECT c.id, c.phone, c.phone_display, c.name, c.email, c.notes, c.flag,
           COUNT(r.id) AS rentals,
           MAX(r.start_date) AS last_rental_on
    FROM customers c
    LEFT JOIN reservations r ON r.customer_id = c.id
    WHERE c.phone = ${phone}
    GROUP BY c.id
    LIMIT 1
  `)) as unknown as
    Record<string, unknown>[] | { rows?: Record<string, unknown>[] };
  const list = Array.isArray(rows) ? rows : (rows.rows ?? []);
  const r = list[0];
  if (!r) return null;

  return {
    id: String(r.id),
    phone: String(r.phone),
    phoneDisplay: String(r.phone_display),
    name: String(r.name),
    email: (r.email as string) ?? null,
    notes: (r.notes as string) ?? null,
    flag: (r.flag as CustomerFlag) ?? "none",
    rentals: Number(r.rentals) || 0,
    damages: Number(r.damages) || 0,
    damagesOpen: Number(r.damages_open) || 0,
    lastRentalOn: r.last_rental_on
      ? String(r.last_rental_on).slice(0, 10)
      : null,
  };
}

/**
 * Create the person, or update the record we already have.
 *
 * Called both by the "add customer" form and by every phone booking, so a
 * rental typed in at 2am silently keeps the directory current. The name is
 * only overwritten when a new one was actually given — an empty field must
 * not wipe a name somebody entered properly last time.
 */
export async function upsertCustomer(input: {
  phone: string;
  name: string;
  email?: string | null;
  notes?: string | null;
}): Promise<string | null> {
  const phone = normalisePhone(input.phone);
  if (phone.length < 7 || input.name.trim().length < 2) return null;
  const db = getDb();

  // The phone number finds a returning customer; the oldest record wins if
  // duplicates exist from earlier entries. Identity is the row id.
  const [existing] = await db
    .select({ id: schema.customers.id })
    .from(schema.customers)
    .where(eq(schema.customers.phone, phone))
    .orderBy(schema.customers.createdAt)
    .limit(1);

  if (existing) {
    await db
      .update(schema.customers)
      .set({
        name: input.name.trim(),
        phoneDisplay: input.phone.trim(),
        // COALESCE so a booking taken without an email does not erase the
        // address the customer gave last time.
        email: sql`COALESCE(NULLIF(${input.email?.trim() ?? ""}, ''), ${schema.customers.email})`,
        notes: sql`COALESCE(NULLIF(${input.notes?.trim() ?? ""}, ''), ${schema.customers.notes})`,
        updatedAt: new Date(),
      })
      .where(eq(schema.customers.id, existing.id));
    return existing.id;
  }

  const [row] = await db
    .insert(schema.customers)
    .values({
      phone,
      phoneDisplay: input.phone.trim(),
      name: input.name.trim(),
      email: input.email?.trim() || null,
      notes: input.notes?.trim() || null,
    })
    .returning({ id: schema.customers.id });

  return row?.id ?? null;
}

/** The directory, most recently added first. */
export async function listCustomers(limit = 200): Promise<CustomerRow[]> {
  const rows = (await getDb().execute(sql`
    SELECT c.id, c.phone, c.phone_display, c.name, c.email, c.notes, c.flag,
           COUNT(r.id) AS rentals,
           MAX(r.start_date) AS last_rental_on,
           -- Szkody liczone PODZAPYTANIEM, nie kolejnym LEFT JOIN-em: dwa
           -- joiny jeden-do-wielu mnożą się przez siebie i klient z dwiema
           -- szkodami nagle ma dwa razy więcej najmów, niż miał.
           (SELECT COUNT(*) FROM damages d WHERE d.customer_id = c.id) AS damages,
           (SELECT COUNT(*) FROM damages d
             WHERE d.customer_id = c.id AND d.status <> 'closed') AS damages_open
    FROM customers c
    LEFT JOIN reservations r ON r.customer_id = c.id
    GROUP BY c.id
    ORDER BY c.created_at DESC
    LIMIT ${limit}
  `)) as unknown as
    Record<string, unknown>[] | { rows?: Record<string, unknown>[] };
  const list = Array.isArray(rows) ? rows : (rows.rows ?? []);

  return list.map((r) => ({
    id: String(r.id),
    phone: String(r.phone),
    phoneDisplay: String(r.phone_display),
    name: String(r.name),
    email: (r.email as string) ?? null,
    notes: (r.notes as string) ?? null,
    flag: ((r.flag as string) ?? "none") as CustomerFlag,
    rentals: Number(r.rentals) || 0,
    damages: Number(r.damages) || 0,
    damagesOpen: Number(r.damages_open) || 0,
    lastRentalOn: r.last_rental_on
      ? String(r.last_rental_on).slice(0, 10)
      : null,
  }));
}

/** One customer with their rentals, for the directory page. */
export async function getCustomer(id: string) {
  const [customer] = await getDb()
    .select()
    .from(schema.customers)
    .where(eq(schema.customers.id, id))
    .limit(1);
  if (!customer) return null;

  const rentals = await getDb()
    .select({
      id: schema.reservations.id,
      reference: schema.reservations.reference,
      startDate: schema.reservations.startDate,
      endDate: schema.reservations.endDate,
      status: schema.reservations.status,
      totalGrosze: schema.reservations.totalGrosze,
    })
    .from(schema.reservations)
    .where(eq(schema.reservations.customerId, id))
    .orderBy(desc(schema.reservations.startDate));

  return { customer, rentals };
}
