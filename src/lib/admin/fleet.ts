import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { toDriverClass, type DriverClass } from "@/lib/fleet/driver-class";
import { getFreeUnitsByModel, isoDay } from "@/lib/booking/availability";

/** All models with a rolled-up count of their physical units. */
export async function listFleet() {
  const db = getDb();
  const [models, units] = await Promise.all([
    db
      .select({
        id: schema.carModels.id,
        slug: schema.carModels.slug,
        brand: schema.carModels.brand,
        model: schema.carModels.model,
        year: schema.carModels.year,
        category: schema.carModels.category,
        dailyPriceGrosze: schema.carModels.dailyPriceGrosze,
        published: schema.carModels.published,
        sortOrder: schema.carModels.sortOrder,
      })
      .from(schema.carModels)
      .orderBy(asc(schema.carModels.sortOrder), asc(schema.carModels.brand)),
    db
      .select({ modelId: schema.cars.modelId, status: schema.cars.status })
      .from(schema.cars),
  ]);

  const counts = new Map<string, { total: number; available: number }>();
  for (const u of units) {
    const e = counts.get(u.modelId) ?? { total: 0, available: 0 };
    e.total += 1;
    if (u.status === "available") e.available += 1;
    counts.set(u.modelId, e);
  }

  /*
   * Ile sztuk da się WYNAJĄĆ DZIŚ — a nie ile ma sprawny status.
   *
   * `available` opisuje egzemplarz (czy nadaje się do jazdy), rezerwacja opisuje
   * termin. Panel liczył dotąd tylko to pierwsze, więc auto wydane klientowi na
   * tydzień nadal figurowało w kolumnie jako dostępne — operator patrzył na
   * „3 / 4 dostępnych" w dniu, w którym wszystkie trzy były w trasie.
   *
   * Liczone `getFreeUnitsByModel`, czyli DOKŁADNIE tym samym predykatem, z
   * którego korzystają flota publiczna, karta auta, `/compare`, asystent i
   * transakcja rezerwacji. Drugie zapytanie „prawie takie samo" byłoby drugim
   * źródłem prawdy i pierwszą rzeczą, która by się rozjechała.
   */
  const today = isoDay(new Date());
  const freeToday = await getFreeUnitsByModel(today, today);

  return models.map((m) => {
    const u = counts.get(m.id) ?? { total: 0, available: 0 };
    const free = freeToday.get(m.id) ?? 0;
    return {
      ...m,
      units: {
        ...u,
        /** Wolne dziś — po odjęciu rezerwacji i blokad, nie po samym statusie. */
        freeToday: free,
        /** Sprawne, ale zajęte na dziś: to jest stan RESERVED, widziany w panelu. */
        reservedToday: Math.max(0, u.available - free),
      },
    };
  });
}

/** One model plus its physical units, for the editor. */
export async function getModelWithUnits(id: string) {
  const db = getDb();
  const [model] = await db
    .select()
    .from(schema.carModels)
    .where(eq(schema.carModels.id, id))
    .limit(1);
  if (!model) return null;

  const units = await db
    .select()
    .from(schema.cars)
    .where(eq(schema.cars.modelId, id))
    .orderBy(asc(schema.cars.plate));

  return { model, units };
}

export type FleetModel = Awaited<ReturnType<typeof listFleet>>[number];
export type FleetUnit = NonNullable<
  Awaited<ReturnType<typeof getModelWithUnits>>
>["units"][number];
export type EditableModel = NonNullable<
  Awaited<ReturnType<typeof getModelWithUnits>>
>["model"];

/* ── Driver-requirement classes ──────────────────────────────────────────── */

export type DriverClassRow = {
  id: string;
  slug: string;
  brand: string;
  model: string;
  published: boolean;
  driverClass: DriverClass | null;
};

/**
 * Every model with the class it is assigned to — the table in Admin → Zasady
 * wynajmu.
 *
 * Unpublished models are included on purpose: a car taken off the site for a
 * week still has a class, and hiding it here would mean discovering it has
 * none on the day it goes back up.
 */
export async function listDriverClasses(): Promise<DriverClassRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.carModels.id,
      slug: schema.carModels.slug,
      brand: schema.carModels.brand,
      model: schema.carModels.model,
      published: schema.carModels.published,
      driverClass: schema.carModels.driverClass,
    })
    .from(schema.carModels)
    .orderBy(asc(schema.carModels.sortOrder), asc(schema.carModels.brand));

  return rows.map((r) => ({ ...r, driverClass: toDriverClass(r.driverClass) }));
}

/**
 * Write the assignment for several models at once.
 *
 * One statement per distinct class rather than one per car: ten cars in three
 * classes is three updates, and the rows that did not change are not written
 * at all. Returns the rows as they now stand, so the caller can put the real
 * "after" state in the audit log rather than what it hoped it wrote.
 */
export async function setDriverClasses(
  changes: { id: string; driverClass: DriverClass | null }[],
): Promise<DriverClassRow[]> {
  const db = getDb();
  const byClass = new Map<DriverClass | null, string[]>();
  for (const c of changes) {
    byClass.set(c.driverClass, [...(byClass.get(c.driverClass) ?? []), c.id]);
  }
  for (const [cls, ids] of byClass) {
    if (ids.length === 0) continue;
    await db
      .update(schema.carModels)
      .set({ driverClass: cls, updatedAt: new Date() })
      .where(inArray(schema.carModels.id, ids));
  }
  return listDriverClasses();
}
