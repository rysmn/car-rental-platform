import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { depositTotals } from "./deposits";
import { formatPlnPrecise } from "@/lib/format";
import type { Bilingual } from "@/lib/i18n-pick";
import { isoDay } from "@/lib/booking/availability";
import { getMonthlySeries } from "@/lib/admin/economics";
import { resolveFleetState, type FleetState } from "@/lib/fleet/status";
import type { ReservationStatus } from "@/lib/admin/reservation-status";

/**
 * What the dashboard has to answer before anyone has had coffee: what happens
 * today, what needs a decision, and where every car is.
 *
 * "Today" is the server's date, which is the operator's date — the box runs in
 * Europe/Warsaw and the panel has exactly one office. Everything blocking is
 * `confirmed` or `completed`, the same definition the calendar and the
 * allocator use; a `pending` request is a hope, not a rental, and counting it
 * as one would put a car on the road that nobody has agreed to hand over.
 */

function rowsOf<T>(result: unknown): T[] {
  const r = result as T[] | { rows?: T[] };
  return Array.isArray(r) ? r : (r.rows ?? []);
}

const day = (v: string | Date | null): string | null =>
  v == null ? null : v instanceof Date ? isoDay(v) : String(v).slice(0, 10);

/** `time` columns arrive as "16:00:00"; the panel shows hours and minutes. */
const hhmm = (v: string | null): string | null =>
  v == null ? null : String(v).slice(0, 5);

export type DashboardKpi = {
  /** Requests that arrived today, whatever their status. */
  reservationsToday: number;
  pending: number;
  carsRented: number;
  carsAvailable: number;
  returnsToday: number;
  pickupsToday: number;
  /** Current month, allocated by rental day — the same figure as analytics. */
  revenueMonthGrosze: number;
};

export async function getDashboardKpi(): Promise<DashboardKpi> {
  const [counts, months] = await Promise.all([
    getDb().execute(sql`
      SELECT
        (SELECT COUNT(*) FROM reservations
          WHERE created_at::date = CURRENT_DATE)                     AS reservations_today,
        (SELECT COUNT(*) FROM reservations
          WHERE status = 'pending')                                  AS pending,
        (SELECT COUNT(DISTINCT car_id) FROM reservations
          WHERE status IN ('confirmed','completed')
            AND CURRENT_DATE BETWEEN start_date AND end_date)        AS cars_rented,
        (SELECT COUNT(*) FROM reservations
          WHERE status IN ('confirmed','completed')
            AND end_date = CURRENT_DATE)                             AS returns_today,
        (SELECT COUNT(*) FROM reservations
          WHERE status IN ('confirmed','completed')
            AND start_date = CURRENT_DATE)                           AS pickups_today,
        -- Available means "could be handed over now": roadworthy, not out, not
        -- blocked. A car in for service is not available and neither is one
        -- somebody is driving, so both are excluded rather than counted twice.
        (SELECT COUNT(*) FROM cars c
          WHERE c.status = 'available'
            AND NOT EXISTS (
              SELECT 1 FROM reservations r
              WHERE r.car_id = c.id AND r.status IN ('confirmed','completed')
                AND CURRENT_DATE BETWEEN r.start_date AND r.end_date)
            AND NOT EXISTS (
              SELECT 1 FROM availability_blocks ab
              WHERE ab.car_id = c.id
                AND CURRENT_DATE BETWEEN ab.start_date AND ab.end_date)
          )                                                          AS cars_available
    `),
    // Borrowed rather than re-derived: the dashboard and the analytics page
    // must never quote two different figures for the same month.
    getMonthlySeries(1),
  ]);

  const r = rowsOf<Record<string, string | number>>(counts)[0] ?? {};
  const n = (k: string) => Number(r[k] ?? 0) || 0;

  return {
    reservationsToday: n("reservations_today"),
    pending: n("pending"),
    carsRented: n("cars_rented"),
    carsAvailable: n("cars_available"),
    returnsToday: n("returns_today"),
    pickupsToday: n("pickups_today"),
    revenueMonthGrosze: months[months.length - 1]?.revenueGrosze ?? 0,
  };
}

export type TodayOperation = {
  reservationId: string;
  reference: string;
  kind: "pickup" | "return";
  /** "HH:MM", or null when no handover time was agreed. */
  time: string | null;
  customerName: string;
  customerPhone: string;
  carName: string;
  plate: string;
  locationName: string;
  status: ReservationStatus;
};

/**
 * Every handover happening today, both directions, in clock order.
 *
 * One rental can appear twice — as a pickup in the morning and, on a one-day
 * hire, as a return in the evening — because those are two things somebody has
 * to physically do. Rows with no agreed time sort last: an unscheduled
 * handover is a call to make, not a slot to stand in.
 */
export async function getTodayOperations(): Promise<TodayOperation[]> {
  const rows = rowsOf<{
    reservation_id: string;
    reference: string;
    kind: "pickup" | "return";
    time: string | null;
    customer_name: string;
    customer_phone: string;
    car_name: string;
    plate: string;
    location_name: string;
    status: ReservationStatus;
  }>(
    await getDb().execute(sql`
      SELECT r.id AS reservation_id, r.reference, k.kind, k.time,
             r.customer_name, r.customer_phone,
             cm.brand || ' ' || cm.model AS car_name,
             c.plate, pl.name AS location_name, r.status::text AS status
      FROM reservations r
      JOIN cars c ON c.id = r.car_id
      JOIN car_models cm ON cm.id = r.car_model_id
      JOIN pickup_locations pl ON pl.id = r.pickup_location_id
      CROSS JOIN LATERAL (
        VALUES ('pickup', r.start_date, r.pickup_time),
               ('return', r.end_date,  r.return_time)
      ) AS k(kind, on_date, time)
      WHERE k.on_date = CURRENT_DATE
        -- Pending is included on purpose: a request for today is the most
        -- urgent thing on the page, precisely because nobody has decided yet.
        AND r.status IN ('pending','confirmed','completed')
      ORDER BY k.time ASC NULLS LAST, k.kind DESC, c.plate ASC
    `),
  );

  return rows.map((r) => ({
    reservationId: r.reservation_id,
    reference: r.reference,
    kind: r.kind,
    time: hhmm(r.time),
    customerName: r.customer_name,
    customerPhone: r.customer_phone,
    carName: r.car_name,
    plate: r.plate,
    locationName: r.location_name,
    status: r.status,
  }));
}

/**
 * Re-exported, not redeclared. The states and the precedence that orders them
 * now live in `lib/fleet/status`, because the public car cards ask the same
 * question and a second copy of this order is how two surfaces end up telling a
 * customer two different things about one car.
 */
export type { FleetState };

export type FleetStatusRow = {
  carId: string;
  modelId: string;
  plate: string;
  carName: string;
  state: FleetState;
  /** Rented: when it comes back. Reserved: when it goes out. */
  date: string | null;
  /** The agreed handover time on that date, when there is one. */
  time: string | null;
  customerName: string | null;
};

/**
 * Where every car stands right now, without opening the fleet page.
 *
 * Precedence is deliberate and matters: a car in the garage is in the garage
 * even if a reservation exists for it, so `service` wins over everything. Then
 * "out today", then "blocked today", then "goes out soon" — each answers a
 * different question and only the first true one is worth showing.
 */
export async function getFleetStatus(soonDays = 14): Promise<FleetStatusRow[]> {
  const rows = rowsOf<{
    car_id: string;
    model_id: string;
    plate: string;
    car_name: string;
    car_status: string;
    rented_until: string | Date | null;
    return_time: string | null;
    rented_by: string | null;
    blocked_until: string | Date | null;
    next_from: string | Date | null;
    next_time: string | null;
    next_by: string | null;
  }>(
    await getDb().execute(sql`
      SELECT c.id AS car_id, c.model_id, c.plate, c.status::text AS car_status,
             cm.brand || ' ' || cm.model AS car_name,
             now_r.end_date  AS rented_until,
             now_r.return_time AS return_time,
             now_r.customer_name AS rented_by,
             blk.end_date AS blocked_until,
             nxt.start_date AS next_from,
             nxt.pickup_time AS next_time,
             nxt.customer_name AS next_by
      FROM cars c
      JOIN car_models cm ON cm.id = c.model_id
      LEFT JOIN LATERAL (
        SELECT r.end_date, r.return_time, r.customer_name
        FROM reservations r
        WHERE r.car_id = c.id AND r.status IN ('confirmed','completed')
          AND CURRENT_DATE BETWEEN r.start_date AND r.end_date
        ORDER BY r.end_date DESC LIMIT 1
      ) now_r ON TRUE
      LEFT JOIN LATERAL (
        SELECT ab.end_date FROM availability_blocks ab
        WHERE ab.car_id = c.id
          AND CURRENT_DATE BETWEEN ab.start_date AND ab.end_date
        ORDER BY ab.end_date DESC LIMIT 1
      ) blk ON TRUE
      LEFT JOIN LATERAL (
        SELECT r.start_date, r.pickup_time, r.customer_name
        FROM reservations r
        WHERE r.car_id = c.id AND r.status = 'confirmed'
          AND r.start_date > CURRENT_DATE
          AND r.start_date <= CURRENT_DATE + ${soonDays}::int
        ORDER BY r.start_date ASC LIMIT 1
      ) nxt ON TRUE
      ORDER BY cm.brand ASC, cm.model ASC, c.plate ASC
    `),
  );

  return rows.map((r) => {
    // "Reserved" here means "goes out within `soonDays`" — the calendar below
    // feeds a different fact into the same slot. The ORDER is what the two
    // views share, and it is `resolveFleetState`.
    const state = resolveFleetState({
      inGarage: r.car_status === "service" || r.car_status === "damaged",
      rented: r.rented_until != null,
      blocked: r.blocked_until != null,
      reserved: r.next_from != null,
    });

    return {
      carId: r.car_id,
      modelId: r.model_id,
      plate: r.plate,
      carName: r.car_name,
      state,
      date:
        state === "rented"
          ? day(r.rented_until)
          : state === "blocked"
            ? day(r.blocked_until)
            : state === "reserved"
              ? day(r.next_from)
              : null,
      time:
        state === "rented"
          ? hhmm(r.return_time)
          : state === "reserved"
            ? hhmm(r.next_time)
            : null,
      customerName:
        state === "rented"
          ? r.rented_by
          : state === "reserved"
            ? r.next_by
            : null,
    };
  });
}

/* ── This month, in management terms ──────────────────────────────────────── */

export type MonthFinance = {
  revenueGrosze: number;
  expenseGrosze: number;
  marginGrosze: number;
  /** Rented car-days ÷ available car-days so far this month, 0–1. */
  occupancy: number;
  /** Revenue ÷ rented days. Null until something has actually been rented. */
  avgDailyRateGrosze: number | null;
  /** Mean length of the rentals that started this month, in days. */
  avgRentalDays: number | null;
  daysRented: number;
  /** Days of the month elapsed, which is what occupancy is measured against. */
  daysElapsed: number;
};

/**
 * The four numbers an owner actually asks for, plus the two that explain them.
 *
 * Occupancy is measured against days ELAPSED, not the whole month: on the 3rd,
 * dividing by 31 would report 6% and look like a catastrophe every month until
 * the 20th. Cars in the fleet is today's count — a car bought mid-month is not
 * retroactively idle for the first fortnight.
 *
 * Revenue and costs come from `getMonthlySeries`, i.e. the same day-allocated
 * figures as the analytics page and the dashboard tile above.
 */
export async function getMonthFinance(): Promise<MonthFinance> {
  const [months, meta] = await Promise.all([
    getMonthlySeries(1),
    getDb().execute(sql`
      SELECT
        EXTRACT(DAY FROM CURRENT_DATE)::int AS days_elapsed,
        (SELECT COUNT(*) FROM cars)         AS fleet_size,
        (SELECT COUNT(DISTINCT (r.car_id, g.d))
           FROM reservations r
           CROSS JOIN LATERAL generate_series(r.start_date, r.end_date, INTERVAL '1 day') AS g(d)
          WHERE r.status IN ('confirmed','completed')
            AND g.d >= date_trunc('month', CURRENT_DATE)
            AND g.d <= CURRENT_DATE)        AS days_rented,
        (SELECT AVG(days)::numeric
           FROM reservations
          WHERE status IN ('confirmed','completed')
            AND start_date >= date_trunc('month', CURRENT_DATE)
            AND start_date <= CURRENT_DATE) AS avg_days
    `),
  ]);

  const m = months[months.length - 1];
  const r = rowsOf<Record<string, string | number | null>>(meta)[0] ?? {};
  const num = (k: string) => Number(r[k] ?? 0) || 0;

  const daysElapsed = Math.max(1, num("days_elapsed"));
  const fleetSize = num("fleet_size");
  const daysRented = num("days_rented");
  const capacity = fleetSize * daysElapsed;
  const revenueGrosze = m?.revenueGrosze ?? 0;
  const avgDays = r.avg_days == null ? null : Number(r.avg_days);

  return {
    revenueGrosze,
    expenseGrosze: m?.expenseGrosze ?? 0,
    marginGrosze: m?.marginGrosze ?? 0,
    occupancy: capacity > 0 ? Math.min(1, daysRented / capacity) : 0,
    avgDailyRateGrosze:
      daysRented > 0 ? Math.round(revenueGrosze / daysRented) : null,
    avgRentalDays: avgDays && Number.isFinite(avgDays) ? avgDays : null,
    daysRented,
    daysElapsed,
  };
}

/* ── Fleet calendar ───────────────────────────────────────────────────────── */

export type CalendarCell = { date: string; state: FleetState };

export type FleetCalendarRow = {
  carId: string;
  modelId: string;
  plate: string;
  carName: string;
  cells: CalendarCell[];
};

/**
 * Every car against the next three weeks, one cell per day.
 *
 * This is the answer to "can I sell this car to the customer on the phone for
 * the 22nd", which is otherwise four clicks and a guess. Same precedence as
 * the status list: the garage beats the calendar, a rental beats a block, a
 * block beats a future reservation.
 *
 * Built in one query rather than one per car — a fleet of thirteen over 21
 * days is 273 cells, and doing that as 273 round trips would make the
 * dashboard the slowest page in the panel.
 */
export async function getFleetCalendar(days = 21): Promise<FleetCalendarRow[]> {
  const rows = rowsOf<{
    car_id: string;
    model_id: string;
    plate: string;
    car_name: string;
    car_status: string;
    d: string | Date;
    rented: boolean;
    reserved: boolean;
    blocked: boolean;
  }>(
    await getDb().execute(sql`
      WITH span AS (
        SELECT generate_series(
          CURRENT_DATE, CURRENT_DATE + (${days}::int - 1), INTERVAL '1 day'
        )::date AS d
      )
      SELECT c.id AS car_id, c.model_id, c.plate, c.status::text AS car_status,
             cm.brand || ' ' || cm.model AS car_name,
             span.d,
             EXISTS (
               SELECT 1 FROM reservations r
               WHERE r.car_id = c.id AND r.status IN ('confirmed','completed')
                 AND span.d BETWEEN r.start_date AND r.end_date
             ) AS rented,
             EXISTS (
               SELECT 1 FROM reservations r
               WHERE r.car_id = c.id AND r.status = 'pending'
                 AND span.d BETWEEN r.start_date AND r.end_date
             ) AS reserved,
             EXISTS (
               SELECT 1 FROM availability_blocks ab
               WHERE ab.car_id = c.id
                 AND span.d BETWEEN ab.start_date AND ab.end_date
             ) AS blocked
      FROM cars c
      JOIN car_models cm ON cm.id = c.model_id
      CROSS JOIN span
      ORDER BY cm.brand, cm.model, c.plate, span.d
    `),
  );

  const byCar = new Map<string, FleetCalendarRow>();
  for (const r of rows) {
    let row = byCar.get(r.car_id);
    if (!row) {
      row = {
        carId: r.car_id,
        modelId: r.model_id,
        plate: r.plate,
        carName: r.car_name,
        cells: [],
      };
      byCar.set(r.car_id, row);
    }
    row.cells.push({
      date: day(r.d) ?? "",
      // Here "reserved" means "a pending request covers this square", which is
      // a different question from the status list's "goes out soon". Same
      // precedence, different input — see `lib/fleet/status`.
      state: resolveFleetState({
        inGarage: r.car_status === "service" || r.car_status === "damaged",
        rented: Boolean(r.rented),
        blocked: Boolean(r.blocked),
        reserved: Boolean(r.reserved),
      }),
    });
  }
  return [...byCar.values()];
}

/* ── Needs attention ──────────────────────────────────────────────────────── */

export type AttentionKind =
  | "overdue"
  | "decision"
  | "pickup"
  | "return"
  | "payment"
  | "tyres"
  | "document"
  | "service"
  | "cost"
  | "deadline"
  | "deposit";

export type AttentionItem = {
  kind: AttentionKind;
  /** What it is about: a car, or a reservation reference. */
  subject: Bilingual;
  detail: Bilingual;
  /** What the operator is supposed to DO about it. */
  action: Bilingual;
  urgent: boolean;
  href: string | null;
};

/**
 * One row of the attention query. The SQL names WHAT happened (`code`) and
 * carries the facts (`params`); the sentences are written in JS, in both
 * languages, so no Polish is baked into the database query.
 */
type AttentionRow = {
  kind: AttentionKind;
  code: string;
  params: Record<string, unknown> | null;
  urgent: boolean;
  id: string | null;
  sort: number;
};

const both = (pl: string, en: string): Bilingual => ({ pl, en });

/** Plural "dzień / dni" and "day / days" for a whole-number count. */
const pluralDays = (n: number, one: Bilingual, many: Bilingual): Bilingual =>
  n === 1 ? one : many;

function attentionText(
  code: string,
  p: Record<string, unknown>,
): { subject: Bilingual; detail: Bilingual; action: Bilingual } {
  const s = (k: string) => (p[k] == null ? "" : String(p[k]));
  const n = (k: string) => Number(p[k] ?? 0);
  const car = s("car");
  switch (code) {
    case "overdue": {
      const d = n("days");
      const unit = pluralDays(d, both("dnia", "day"), both("dni", "days"));
      return {
        subject: both(car, car),
        detail: both(
          `Zwrot zaległy od ${d} ${unit.pl} · ${s("name")} · ${s("phone")}`,
          `Return overdue by ${d} ${unit.en} · ${s("name")} · ${s("phone")}`,
        ),
        action: both("Zadzwoń i odbierz auto", "Call and collect the car"),
      };
    }
    case "decision":
      return {
        subject: both(`Rezerwacja ${s("ref")}`, `Reservation ${s("ref")}`),
        detail: both(
          `Czeka na decyzję · ${s("car")} · od ${s("from")}`,
          `Awaiting decision · ${s("car")} · from ${s("from")}`,
        ),
        action: both("Potwierdź albo odrzuć", "Confirm or reject"),
      };
    case "pickup": {
      const t = s("time") ? ` ${s("time")}` : "";
      return {
        subject: both(car, car),
        detail: both(
          `Wydanie dzisiaj${t} · ${s("name")} · ${s("phone")}`,
          `Handover today${t} · ${s("name")} · ${s("phone")}`,
        ),
        action: both(
          "Przygotuj i wydaj auto",
          "Prepare and hand over the car",
        ),
      };
    }
    case "return": {
      const t = s("time") ? ` ${s("time")}` : "";
      return {
        subject: both(car, car),
        detail: both(
          `Zwrot dzisiaj${t} · ${s("name")}`,
          `Return today${t} · ${s("name")}`,
        ),
        action: both(
          "Odbierz auto i spisz licznik",
          "Collect the car and note the mileage",
        ),
      };
    }
    case "payment": {
      const ref = s("ref");
      const detail = p.hasPaid
        ? both(
            `Zapłacono ${s("paid")} z ${s("total")} zł · zostało ${s("owed")} zł`,
            `Paid ${s("paid")} of ${s("total")} PLN · ${s("owed")} PLN left`,
          )
        : both(`Brak wpłaty · ${s("total")} zł`, `No payment · ${s("total")} PLN`);
      return {
        subject: both(`Rezerwacja ${ref}`, `Reservation ${ref}`),
        detail,
        action: both("Pobierz należność", "Collect the amount due"),
      };
    }
    case "tyres": {
      const summer = s("fitted") === "summer";
      const changed = s("changed");
      const last = changed
        ? both(` · ostatnia zmiana ${changed}`, ` · last change ${changed}`)
        : both("", "");
      return {
        subject: both(car, car),
        detail: both(
          (summer
            ? "Opony letnie, a trwa sezon zimowy"
            : "Opony zimowe, a trwa sezon letni") + last.pl,
          (summer
            ? "Summer tyres, but it is winter season"
            : "Winter tyres, but it is summer season") + last.en,
        ),
        action: summer
          ? both(
              "Załóż opony zimowe — nie wydawaj auta",
              "Fit winter tyres — do not hand the car over",
            )
          : both("Załóż opony letnie", "Fit summer tyres"),
      };
    }
    case "expiry": {
      const diff = n("diff");
      const kind = s("kind");
      const label =
        kind === "insurance"
          ? both("OC", "Liability insurance (OC)")
          : kind === "ac"
            ? both("AC", "Comprehensive insurance (AC)")
            : kind === "inspection"
              ? both("Badanie techniczne", "Technical inspection")
              : both("Serwis", "Service");
      const timing =
        diff < 0
          ? both(
              ` po terminie od ${-diff} ${-diff === 1 ? "dzień" : "dni"}`,
              ` overdue by ${-diff} ${-diff === 1 ? "day" : "days"}`,
            )
          : diff === 0
            ? both(" — dzisiaj", " — today")
            : both(
              ` za ${diff} ${diff === 1 ? "dzień" : "dni"}`,
              ` in ${diff} ${diff === 1 ? "day" : "days"}`,
            );
      const action =
        kind === "insurance"
          ? both("Przedłuż OC", "Renew liability insurance")
          : kind === "ac"
            ? both("Przedłuż AC", "Renew comprehensive insurance")
            : kind === "inspection"
              ? both("Umów badanie techniczne", "Book the technical inspection")
              : both("Umów serwis", "Book a service");
      return {
        subject: both(car, car),
        detail: both(
          label.pl + timing.pl,
          label.en + timing.en,
        ),
        action,
      };
    }
    case "serviceKm": {
      const isService = s("kind") === "service";
      const label = isService
        ? both("Serwis", "Service")
        : both("Wymiana oleju", "Oil change");
      const over = p.over != null;
      const timing = over
        ? both(` przekroczony o ${s("over")} km`, ` overdue by ${s("over")} km`)
        : both(` za ${s("left")} km`, ` in ${s("left")} km`);
      return {
        subject: both(car, car),
        detail: both(label.pl + timing.pl, label.en + timing.en),
        action: isService
          ? both("Umów serwis", "Book a service")
          : both("Umów wymianę oleju", "Book an oil change"),
      };
    }
    case "cost": {
      const cat = s("category");
      const label =
        cat === "leasing"
          ? both("Rata leasingu", "Leasing instalment")
          : cat === "insurance"
            ? both("Rata ubezpieczenia", "Insurance instalment")
            : cat === "tax"
              ? both("Podatek", "Tax")
              : cat === "parking"
                ? both("Opłata za parking", "Parking fee")
                : both("Koszt cykliczny", "Recurring cost");
      const due = s("due");
      const when =
        s("rel") === "past"
          ? both(`termin minął ${due}`, `due date passed ${due}`)
          : s("rel") === "today"
            ? both("termin dzisiaj", "due today")
            : both(`termin ${due}`, `due ${due}`);
      return {
        subject: both(car, car),
        detail: both(
          `${label.pl} ${s("amount")} zł · ${when.pl}`,
          `${label.en} ${s("amount")} PLN · ${when.en}`,
        ),
        action: both("Opłać i zapisz w kosztach", "Pay and record it in costs"),
      };
    }
    case "deadline": {
      const kind = s("kind");
      const label =
        kind === "fine"
          ? both("Mandat", "Fine")
          : kind === "damage"
            ? both("Szkoda", "Damage")
            : kind === "deposit_take"
              ? both("Kaucja do pobrania", "Deposit to take")
              : kind === "deposit_return"
                ? both("Kaucja do zwrotu", "Deposit to return")
                : kind === "prep"
                  ? both("Przygotowanie auta", "Car preparation")
                  : both("Termin", "Deadline");
      const action =
        kind === "fine"
          ? both("Opłać mandat", "Pay the fine")
          : kind === "damage"
            ? both("Domknij szkodę", "Close the damage claim")
            : kind === "deposit_take"
              ? both("Pobierz kaucję", "Take the deposit")
              : kind === "deposit_return"
                ? both("Zwróć kaucję", "Return the deposit")
                : kind === "prep"
                  ? both("Przygotuj auto", "Prepare the car")
                  : both("Zrób i odhacz", "Do it and tick it off");
      const amount = p.amount == null ? "" : ` · ${s("amount")} zł`;
      const amountEn = p.amount == null ? "" : ` · ${s("amount")} PLN`;
      const due = s("due");
      const when =
        s("rel") === "past"
          ? both(`termin minął ${due}`, `due date passed ${due}`)
          : s("rel") === "today"
            ? both("termin dzisiaj", "due today")
            : both(`termin ${due}`, `due ${due}`);
      return {
        subject: both(car, car),
        detail: both(
          `${label.pl}: ${s("title")}${amount} · ${when.pl}`,
          `${label.en}: ${s("title")}${amountEn} · ${when.en}`,
        ),
        action,
      };
    }
    default:
      return {
        subject: both(car, car),
        detail: both(code, code),
        action: both("", ""),
      };
  }
}

/**
 * The short list of things that will cost money or a customer if ignored today.
 *
 * Deliberately not a feed of everything: four kinds, worst first, and each one
 * names what to do. An alert list nobody can clear is an alert list nobody
 * reads.
 */
export async function getAttentionItems(): Promise<AttentionItem[]> {
  // Money, written the way Polish writes it. `to_char` groups with commas and
  // points whatever the server's locale is, and "2,850.00 zł" reads as a
  // different number here than "2 850,00 zł". Built outside the query template
  // because a nested backtick would close it.
  const money = (expr: string) =>
    sql.raw(
      `replace(replace(to_char((${expr}) / 100.0, 'FM999G999D00'), ',', ' '), '.', ',')`,
    );
  const paidSoFar = money("COALESCE(p.paid, 0)");
  const totalDue = money("r.total_grosze");
  const stillOwed = money("r.total_grosze - COALESCE(p.paid, 0)");
  const recurringAmount = money("rc.amount_grosze");
  const deadlineAmount = money("d.amount_grosze");

  const rows = rowsOf<AttentionRow>(
    await getDb().execute(sql`
      -- Every branch below scans the WHOLE fleet and every reservation. The
      -- car names in any example are just what happens to be due; nothing here
      -- is keyed to a particular vehicle.
      --
      -- Column order is fixed for the UNION: kind, code, params, urgent,
      -- id, sort. "code" names the sentence; "params" carries its facts; the
      -- Polish and English wording is built in JS (attentionText).

      -- 1. A car that should have come back and has not.
      SELECT 'overdue'::text AS kind,
             'overdue'::text AS code,
             jsonb_build_object(
               'car', cm.brand || ' ' || cm.model || ' · ' || c.plate,
               'days', CURRENT_DATE - r.end_date,
               'name', r.customer_name,
               'phone', r.customer_phone) AS params,
             true AS urgent,
             r.id::text AS id,
             0 AS sort
      FROM reservations r
      JOIN cars c ON c.id = r.car_id
      JOIN car_models cm ON cm.id = r.car_model_id
      WHERE r.status = 'confirmed' AND r.end_date < CURRENT_DATE

      UNION ALL

      -- 2. Requests nobody has decided on.
      SELECT 'decision', 'decision',
             jsonb_build_object(
               'ref', r.reference,
               'car', cm.brand || ' ' || cm.model,
               'from', to_char(r.start_date, 'DD.MM')),
             (r.start_date <= CURRENT_DATE + 2),
             r.id::text, 1
      FROM reservations r
      JOIN car_models cm ON cm.id = r.car_model_id
      WHERE r.status = 'pending'

      UNION ALL

      -- 3. Handovers due today.
      SELECT 'pickup', 'pickup',
             jsonb_build_object(
               'car', cm.brand || ' ' || cm.model || ' · ' || c.plate,
               'time', to_char(r.pickup_time, 'HH24:MI'),
               'name', r.customer_name,
               'phone', r.customer_phone),
             true, r.id::text, 2
      FROM reservations r
      JOIN cars c ON c.id = r.car_id
      JOIN car_models cm ON cm.id = r.car_model_id
      WHERE r.status = 'confirmed' AND r.start_date = CURRENT_DATE

      UNION ALL

      -- 4. Returns due today.
      SELECT 'return', 'return',
             jsonb_build_object(
               'car', cm.brand || ' ' || cm.model || ' · ' || c.plate,
               'time', to_char(r.return_time, 'HH24:MI'),
               'name', r.customer_name),
             true, r.id::text, 3
      FROM reservations r
      JOIN cars c ON c.id = r.car_id
      JOIN car_models cm ON cm.id = r.car_model_id
      WHERE r.status = 'confirmed' AND r.end_date = CURRENT_DATE

      UNION ALL

      -- 5. Money owed on a rental that has started or starts within three days.
      SELECT 'payment', 'payment',
             jsonb_build_object(
               'ref', r.reference,
               'hasPaid', COALESCE(p.paid, 0) > 0,
               'paid', CASE WHEN COALESCE(p.paid, 0) > 0 THEN ${paidSoFar} END,
               'total', ${totalDue},
               'owed', ${stillOwed}),
             (r.start_date <= CURRENT_DATE),
             r.id::text, 4
      FROM reservations r
      LEFT JOIN LATERAL (
        SELECT SUM(amount_grosze) AS paid
        FROM reservation_payments rp WHERE rp.reservation_id = r.id
      ) p ON TRUE
      WHERE r.status = 'confirmed'
        AND COALESCE(p.paid, 0) < r.total_grosze
        AND r.start_date <= CURRENT_DATE + 3

      UNION ALL

      -- 6. Tyres against the season.
      --
      -- Winter runs 1 November to 31 March here. A car on summer rubber in
      -- December is not a reminder, it is a car that must not leave the yard,
      -- so it is urgent from the first day and the action says so. All-season
      -- tyres are never wrong and never alert.
      SELECT 'tyres', 'tyres',
             jsonb_build_object(
               'car', cm.brand || ' ' || cm.model || ' · ' || c.plate,
               'fitted', c.tyres_fitted,
               'changed', to_char(c.tyres_changed_on, 'DD.MM.YYYY')),
             (c.tyres_fitted = 'summer'),
             NULL, 5
      FROM cars c
      JOIN car_models cm ON cm.id = c.model_id
      WHERE c.tyres_fitted IS NOT NULL
        AND c.tyres_fitted <> 'all_season'
        AND (
          (c.tyres_fitted = 'summer'
             AND (EXTRACT(MONTH FROM CURRENT_DATE) >= 11
                  OR EXTRACT(MONTH FROM CURRENT_DATE) <= 3))
          OR
          (c.tyres_fitted = 'winter'
             AND EXTRACT(MONTH FROM CURRENT_DATE) BETWEEN 5 AND 9)
        )

      UNION ALL

      -- 7. Paperwork and the planned service date.
      SELECT CASE WHEN k.kind = 'service' THEN 'service' ELSE 'document' END,
             'expiry',
             jsonb_build_object(
               'car', cm.brand || ' ' || cm.model || ' · ' || c.plate,
               'kind', k.kind,
               'diff', k.date - CURRENT_DATE),
             (k.date <= CURRENT_DATE + 7),
             NULL, 6
      FROM cars c
      JOIN car_models cm ON cm.id = c.model_id
      CROSS JOIN LATERAL (
        VALUES ('insurance', c.insurance_expiry),
               ('ac', c.ac_expiry),
               ('inspection', c.inspection_expiry),
               ('service', c.service_due)
      ) AS k(kind, date)
      WHERE k.date IS NOT NULL AND k.date <= CURRENT_DATE + 30

      UNION ALL

      -- 8. Service and oil by distance. Two intervals, same shape: without an
      -- interval AND a reading from the last one there is nothing to count
      -- down from, and a guessed countdown is worse than none.
      SELECT 'service', 'serviceKm',
             jsonb_build_object(
               'car', cm.brand || ' ' || cm.model || ' · ' || c.plate,
               'kind', j.kind,
               'over', CASE WHEN c.mileage_km >= j.last + j.step
                            THEN c.mileage_km - j.last - j.step END,
               'left', CASE WHEN c.mileage_km < j.last + j.step
                            THEN j.last + j.step - c.mileage_km END),
             (c.mileage_km >= j.last + j.step - 500),
             NULL, 6
      FROM cars c
      JOIN car_models cm ON cm.id = c.model_id
      CROSS JOIN LATERAL (
        VALUES
          ('service', c.service_interval_km, c.last_service_km),
          ('oil', c.oil_interval_km, c.last_oil_km)
      ) AS j(kind, step, last)
      WHERE j.step IS NOT NULL AND j.last IS NOT NULL
        AND c.mileage_km >= j.last + j.step - 2000

      UNION ALL

      -- 9. Recurring costs falling due — leasing, insurance instalments, tax,
      -- parking. Read from the schedule the operator already set up, so a
      -- leasing instalment cannot be forgotten just because nobody looked at
      -- the car's expense tab this month.
      SELECT 'cost', 'cost',
             jsonb_build_object(
               'car', cm.brand || ' ' || cm.model || ' · ' || c.plate,
               'category', rc.category,
               'amount', ${recurringAmount},
               'due', to_char(nx.due, 'DD.MM'),
               'rel', CASE WHEN nx.due < CURRENT_DATE THEN 'past'
                           WHEN nx.due = CURRENT_DATE THEN 'today'
                           ELSE 'future' END),
             (nx.due <= CURRENT_DATE),
             NULL, 7
      FROM recurring_costs rc
      JOIN cars c ON c.id = rc.car_id
      JOIN car_models cm ON cm.id = c.model_id
      CROSS JOIN LATERAL (
        -- The next period start that has no expense recorded against it yet.
        SELECT MIN(g.d)::date AS due
        FROM generate_series(
               rc.start_on,
               LEAST(COALESCE(rc.end_on, CURRENT_DATE + 60), CURRENT_DATE + 14),
               CASE rc.interval
                 WHEN 'monthly' THEN INTERVAL '1 month'
                 WHEN 'quarterly' THEN INTERVAL '3 months'
                 ELSE INTERVAL '1 year'
               END) AS g(d)
        WHERE NOT EXISTS (
          SELECT 1 FROM car_expenses e
          WHERE e.recurring_id = rc.id AND e.period_start = g.d::date
        )
      ) nx
      WHERE rc.active AND nx.due IS NOT NULL

      UNION ALL

      -- 10. Everything the system cannot work out for itself: fines, damages,
      -- deposits to take or give back, prep jobs, one-off obligations. The
      -- operator sets the date; this reads it. Anything already dealt with
      -- (done_at set) is out.
      SELECT 'deadline', 'deadline',
             jsonb_build_object(
               'car', cm.brand || ' ' || cm.model || ' · ' || c.plate,
               'kind', d.kind,
               'title', d.title,
               'amount', ${deadlineAmount},
               'due', to_char(d.due_on, 'DD.MM'),
               'rel', CASE WHEN d.due_on < CURRENT_DATE THEN 'past'
                           WHEN d.due_on = CURRENT_DATE THEN 'today'
                           ELSE 'future' END),
             (d.due_on <= CURRENT_DATE),
             NULL, 8
      FROM car_deadlines d
      JOIN cars c ON c.id = d.car_id
      JOIN car_models cm ON cm.id = c.model_id
      WHERE d.done_at IS NULL AND d.due_on <= CURRENT_DATE + 14

      ORDER BY sort, urgent DESC
    `),
  );

  const items: AttentionItem[] = rows.map((r) => {
    const text = attentionText(r.code, r.params ?? {});
    return {
      kind: r.kind,
      subject: text.subject,
      detail: text.detail,
      action: text.action,
      urgent: Boolean(r.urgent),
      href: r.id ? `/admin/reservations/${r.id}` : null,
    };
  });

  // 11. Deposits owed back, as ONE row rather than one per rental.
  //
  // Money held on trust is a batch job — the operator settles them in a
  // sitting or not at all — and a row per deposit would push the car that
  // never came back off the screen. The count and the sum are what the owner
  // asked to see: "Kaucje do zwrotu: 3 / 6 000 zł".
  const deposits = await depositTotals();
  if (deposits.toReturnCount > 0) {
    items.push({
      kind: "deposit",
      subject: both(
        `Kaucje do zwrotu: ${deposits.toReturnCount}`,
        `Deposits to return: ${deposits.toReturnCount}`,
      ),
      detail: both(
        `${formatPlnPrecise(deposits.toReturnGrosze, "pl")} czeka na zwrot klientom`,
        `${formatPlnPrecise(deposits.toReturnGrosze, "en")} awaiting return to customers`,
      ),
      action: both("Rozlicz i zwróć", "Settle and return"),
      urgent: true,
      href: "/admin/kaucje",
    });
  }

  return items;
}

