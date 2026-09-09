import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { isoDay } from "@/lib/booking/availability";

/**
 * Fleet performance and the paperwork that keeps it legal.
 *
 * Money and utilisation count only BLOCKING statuses (`confirmed`,
 * `completed`) — the same definition the calendar and the allocator use. A
 * pending request is a hope, not a rental, and counting it would flatter every
 * number on the page.
 */

function rowsOf<T>(result: unknown): T[] {
  const r = result as T[] | { rows?: T[] };
  return Array.isArray(r) ? r : (r.rows ?? []);
}

/** How soon a document has to expire before it is worth chasing. */
export const EXPIRY_SOON_DAYS = 30;

export type DocumentAlert = {
  carId: string;
  plate: string;
  carName: string;
  kind: DocumentKind;
  date: string;
  /** Negative once the date has passed. */
  daysLeft: number;
  level: "overdue" | "soon";
};

/**
 * The three dated obligations a car carries.
 *
 * `service` is a plan the operator sets rather than a document the state
 * issues, but it behaves identically here — a date that arrives, gets chased,
 * and is worth an email before it does.
 */
export type DocumentKind = "insurance" | "inspection" | "service";

export const DOCUMENT_KIND_LABEL: Record<DocumentKind, string> = {
  insurance: "OC/AC",
  inspection: "Przegląd",
  service: "Serwis",
};

export type ModelPerformance = {
  modelId: string;
  slug: string;
  name: string;
  units: number;
  rentals: number;
  daysRented: number;
  revenueGrosze: number;
  /** Share of available unit-days actually rented in the window, 0–1. */
  utilisation: number;
  upcoming: number;
};

export type FleetAnalytics = {
  windowDays: number;
  models: ModelPerformance[];
  totals: {
    rentals: number;
    daysRented: number;
    revenueGrosze: number;
    utilisation: number;
    avgRentalDays: number;
  };
};

/**
 * Insurance and inspection dates that have passed or are about to.
 *
 * Sorted by urgency rather than by car, because the question this answers is
 * "what do I have to deal with first", not "tell me about car X".
 */
export async function getDocumentAlerts(): Promise<DocumentAlert[]> {
  const db = getDb();

  const rows = rowsOf<{
    car_id: string;
    plate: string;
    car_name: string;
    kind: DocumentKind;
    date: string | Date;
    days_left: number;
  }>(
    await db.execute(sql`
      SELECT c.id AS car_id, c.plate,
             cm.brand || ' ' || cm.model AS car_name,
             k.kind, k.date,
             (k.date - CURRENT_DATE) AS days_left
      FROM cars c
      JOIN car_models cm ON cm.id = c.model_id
      CROSS JOIN LATERAL (
        VALUES ('insurance', c.insurance_expiry),
               ('inspection', c.inspection_expiry),
               ('service', c.service_due)
      ) AS k(kind, date)
      WHERE k.date IS NOT NULL
        -- Cast is load-bearing: drizzle sends the value as an untyped
        -- parameter, and date + unknown has no operator, so the whole query
        -- fails at plan time rather than returning any rows at all.
        AND k.date <= CURRENT_DATE + ${EXPIRY_SOON_DAYS}::int
      ORDER BY k.date ASC
    `),
  );

  return rows.map((r) => {
    const daysLeft = Number(r.days_left);
    return {
      carId: r.car_id,
      plate: r.plate,
      carName: r.car_name,
      kind: r.kind,
      date:
        r.date instanceof Date ? isoDay(r.date) : String(r.date).slice(0, 10),
      daysLeft,
      level: daysLeft < 0 ? ("overdue" as const) : ("soon" as const),
    };
  });
}

/**
 * Per-model performance over a trailing window.
 *
 * Utilisation divides rented unit-days by available unit-days in the window,
 * clamped to the window so a booking that runs past either edge counts only the
 * part inside it — otherwise a single long winter rental would report a car as
 * more than 100% busy.
 */
export async function getFleetAnalytics(
  windowDays = 90,
): Promise<FleetAnalytics> {
  const db = getDb();

  const rows = rowsOf<{
    model_id: string;
    slug: string;
    name: string;
    units: number;
    rentals: number;
    days_rented: number;
    revenue: number;
    window_days_rented: number;
    upcoming: number;
  }>(
    await db.execute(sql`
      WITH win AS (
        SELECT (CURRENT_DATE - ${windowDays}::int) AS from_day, CURRENT_DATE AS to_day
      ),
      unit_counts AS (
        SELECT model_id, COUNT(*)::int AS units
        FROM cars WHERE status = 'available'
        GROUP BY model_id
      ),
      booked AS (
        SELECT r.car_model_id,
               COUNT(*)::int AS rentals,
               COALESCE(SUM(r.days), 0)::int AS days_rented,
               COALESCE(SUM(r.total_grosze), 0)::bigint AS revenue,
               -- Days of this booking that fall inside the window.
               COALESCE(SUM(
                 GREATEST(0,
                   (LEAST(r.end_date, (SELECT to_day FROM win))
                    - GREATEST(r.start_date, (SELECT from_day FROM win))) + 1
                 )
               ), 0)::int AS window_days_rented
        FROM reservations r
        WHERE r.status IN ('confirmed', 'completed')
        GROUP BY r.car_model_id
      ),
      upcoming AS (
        SELECT r.car_model_id, COUNT(*)::int AS upcoming
        FROM reservations r
        WHERE r.status IN ('pending', 'confirmed')
          AND r.end_date >= CURRENT_DATE
        GROUP BY r.car_model_id
      )
      SELECT cm.id AS model_id, cm.slug,
             cm.brand || ' ' || cm.model AS name,
             COALESCE(u.units, 0) AS units,
             COALESCE(b.rentals, 0) AS rentals,
             COALESCE(b.days_rented, 0) AS days_rented,
             COALESCE(b.revenue, 0) AS revenue,
             COALESCE(b.window_days_rented, 0) AS window_days_rented,
             COALESCE(up.upcoming, 0) AS upcoming
      FROM car_models cm
      LEFT JOIN unit_counts u ON u.model_id = cm.id
      LEFT JOIN booked b ON b.car_model_id = cm.id
      LEFT JOIN upcoming up ON up.car_model_id = cm.id
      ORDER BY COALESCE(b.revenue, 0) DESC, cm.sort_order ASC
    `),
  );

  const models: ModelPerformance[] = rows.map((r) => {
    const units = Number(r.units) || 0;
    const capacity = units * windowDays;
    return {
      modelId: r.model_id,
      slug: r.slug,
      name: r.name,
      units,
      rentals: Number(r.rentals) || 0,
      daysRented: Number(r.days_rented) || 0,
      revenueGrosze: Number(r.revenue) || 0,
      utilisation:
        capacity > 0
          ? Math.min(1, (Number(r.window_days_rented) || 0) / capacity)
          : 0,
      upcoming: Number(r.upcoming) || 0,
    };
  });

  const rentals = models.reduce((n, m) => n + m.rentals, 0);
  const daysRented = models.reduce((n, m) => n + m.daysRented, 0);
  const capacity = models.reduce((n, m) => n + m.units * windowDays, 0);
  const windowRented = models.reduce(
    (n, m) => n + m.utilisation * m.units * windowDays,
    0,
  );

  return {
    windowDays,
    models,
    totals: {
      rentals,
      daysRented,
      revenueGrosze: models.reduce((n, m) => n + m.revenueGrosze, 0),
      utilisation: capacity > 0 ? windowRented / capacity : 0,
      avgRentalDays: rentals > 0 ? daysRented / rentals : 0,
    },
  };
}

export type CarDocuments = {
  carId: string;
  plate: string;
  carName: string;
  modelId: string;
  mileageKm: number;
  status: string;
  inspection: { date: string | null; daysLeft: number | null };
  insurance: { date: string | null; daysLeft: number | null };
  service: { date: string | null; daysLeft: number | null };
};

/**
 * Every unit with its paperwork, whatever state it is in.
 *
 * The alerts list answers "what is on fire"; this answers "where do we stand",
 * which needs the cars that are fine — and, more usefully, the ones with no
 * date recorded at all. A missing inspection date is not good news, it is an
 * unanswered question, so it is reported rather than left blank.
 */
export async function getCarDocuments(): Promise<CarDocuments[]> {
  const db = getDb();

  const rows = rowsOf<{
    car_id: string;
    plate: string;
    car_name: string;
    model_id: string;
    mileage_km: number;
    status: string;
    inspection: string | Date | null;
    inspection_days: number | null;
    insurance: string | Date | null;
    insurance_days: number | null;
    service: string | Date | null;
    service_days: number | null;
  }>(
    await db.execute(sql`
      SELECT c.id AS car_id, c.plate, c.model_id, c.mileage_km, c.status::text AS status,
             cm.brand || ' ' || cm.model AS car_name,
             c.inspection_expiry AS inspection,
             (c.inspection_expiry - CURRENT_DATE) AS inspection_days,
             c.insurance_expiry AS insurance,
             (c.insurance_expiry - CURRENT_DATE) AS insurance_days,
             c.service_due AS service,
             (c.service_due - CURRENT_DATE) AS service_days
      FROM cars c
      JOIN car_models cm ON cm.id = c.model_id
      ORDER BY
        LEAST(
          COALESCE(c.inspection_expiry, DATE '9999-12-31'),
          COALESCE(c.insurance_expiry, DATE '9999-12-31'),
          COALESCE(c.service_due, DATE '9999-12-31')
        ) ASC,
        c.plate ASC
    `),
  );

  const day = (v: string | Date | null) =>
    v == null ? null : v instanceof Date ? isoDay(v) : String(v).slice(0, 10);

  return rows.map((r) => ({
    carId: r.car_id,
    plate: r.plate,
    carName: r.car_name,
    modelId: r.model_id,
    mileageKm: Number(r.mileage_km) || 0,
    status: r.status,
    inspection: {
      date: day(r.inspection),
      daysLeft: r.inspection_days == null ? null : Number(r.inspection_days),
    },
    insurance: {
      date: day(r.insurance),
      daysLeft: r.insurance_days == null ? null : Number(r.insurance_days),
    },
    service: {
      date: day(r.service),
      daysLeft: r.service_days == null ? null : Number(r.service_days),
    },
  }));
}
