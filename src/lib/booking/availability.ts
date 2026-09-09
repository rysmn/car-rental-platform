import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { doba, okresPytania, zajetoscBloku, zajetoscRezerwacji } from "./bufor";

/**
 * Date-aware availability.
 *
 * The rest of the app long treated `cars.status = 'available'` as "available",
 * which answers a different question: it says a unit is roadworthy, not that it
 * is free on the days a customer wants. The only place that ever asked the real
 * question was the allocator inside `createReservation`. These queries reuse
 * that exact predicate, so what a visitor is shown and what the booking engine
 * will accept cannot drift apart:
 *
 *   a unit is free on a day when its status is `available`, no reservation in a
 *   BLOCKING status covers the day, and no availability block covers it.
 *
 * `pending` reservations deliberately do NOT block. An unconfirmed request does
 * not hold the car — two customers may ask for the same days and the operator
 * decides. Painting those days red would tell visitors "no" while the form
 * still says "yes".
 *
 * Zajętość liczy `aa_zajetosc()` — ta sama funkcja, którą sprawdza ograniczenie
 * EXCLUDE (migracja 0045), wołana przez `lib/booking/bufor.ts`. Do 30.08.2026
 * stał tu `daterange(..., '[]')`: najem kończący się 12-go zajmował cały 12-ty,
 * więc bufor między zwrotem a kolejnym wydaniem wynosił pełną dobę. Teraz
 * wynosi dokładnie trzy godziny liczone od GODZINY zwrotu — a tam, gdzie
 * godziny nie ma (rezerwacje sprzed jej wprowadzenia), zostaje cała doba, jak
 * dotąd.
 *
 * Zapytania niżej pytają o CAŁE doby, bo na etapie przeglądania floty klient
 * nie wybrał jeszcze godzin. To jest odpowiedź ostrożniejsza niż reguła, którą
 * zastosuje silnik rezerwacji — i taka ma być. Widok wolno, żeby powiedział
 * „nie" tam, gdzie silnik powiedziałby „tak"; nigdy odwrotnie.
 */

/** Raw `execute` rows, whichever envelope the driver hands back. */
function rowsOf<T>(result: unknown): T[] {
  const r = result as T[] | { rows?: T[] };
  return Array.isArray(r) ? r : (r.rows ?? []);
}

/** `YYYY-MM-DD` in local time — the same calendar day the visitor sees. */
export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export type DayAvailability = {
  /** `YYYY-MM-DD` → number of units free that day. 0 means fully booked. */
  freeByDay: Record<string, number>;
  /** Units that could ever be free — 0 means the model has no bookable car. */
  unitCount: number;
};

/**
 * Per-day free-unit counts for one model across a window, for the calendar.
 *
 * One query: `generate_series` produces every day in the window and the join
 * counts units free on each. Doing it per day from JS would be one round trip
 * per square in the grid.
 */
export async function getModelDayAvailability(
  modelId: string,
  from: string,
  to: string,
): Promise<DayAvailability> {
  const db = getDb();

  const [countRow] = rowsOf<{ n: number }>(
    await db.execute(sql`
      SELECT COUNT(*)::int AS n FROM cars c
      WHERE c.model_id = ${modelId} AND c.status = 'available'
    `),
  );

  const rows = rowsOf<{ day: string | Date; free: number }>(
    await db.execute(sql`
      WITH days AS (
        SELECT d::date AS day
        FROM generate_series(${from}::date, ${to}::date, interval '1 day') d
      )
      SELECT days.day, COUNT(c.id)::int AS free
      FROM days
      LEFT JOIN cars c
        ON c.model_id = ${modelId}
       AND c.status = 'available'
       AND NOT EXISTS (
         SELECT 1 FROM reservations r
         WHERE r.car_id = c.id
           AND r.status IN ('confirmed', 'completed')
           AND ${zajetoscRezerwacji("r")} && ${doba(sql`days.day`)}
       )
       AND NOT EXISTS (
         SELECT 1 FROM availability_blocks ab
         WHERE ab.car_id = c.id
           AND ${zajetoscBloku("ab")} && ${doba(sql`days.day`)}
       )
      GROUP BY days.day
      ORDER BY days.day
    `),
  );

  const freeByDay: Record<string, number> = {};
  for (const row of rows) {
    // postgres-js may hand back a Date for a `date` column depending on driver
    // config; normalise before it becomes a lookup key the client can't match.
    const key =
      row.day instanceof Date ? isoDay(row.day) : String(row.day).slice(0, 10);
    freeByDay[key] = Number(row.free) || 0;
  }

  return { freeByDay, unitCount: Number(countRow?.n) || 0 };
}

/**
 * Free-unit count per model for one date range — what the fleet list needs to
 * decide which cars to show for the dates a visitor typed.
 *
 * Overlap (`&&`), not containment: a car is unusable for the range if anything
 * touches any part of it.
 */
export async function getFreeUnitsByModel(
  startDate: string,
  endDate: string,
): Promise<Map<string, number>> {
  const db = getDb();

  const rows = rowsOf<{ model_id: string; free: number }>(
    await db.execute(sql`
      SELECT c.model_id, COUNT(*)::int AS free
      FROM cars c
      WHERE c.status = 'available'
        AND NOT EXISTS (
          SELECT 1 FROM reservations r
          WHERE r.car_id = c.id
            AND r.status IN ('confirmed', 'completed')
            AND ${zajetoscRezerwacji("r")} && ${okresPytania(startDate, endDate)}
        )
        AND NOT EXISTS (
          SELECT 1 FROM availability_blocks ab
          WHERE ab.car_id = c.id
            AND ${zajetoscBloku("ab")} && ${okresPytania(startDate, endDate)}
        )
      GROUP BY c.model_id
    `),
  );

  return new Map(rows.map((r) => [r.model_id, Number(r.free) || 0]));
}

/**
 * Pierwszy dzień, w którym model ma wolny egzemplarz — dla całej floty naraz.
 *
 * ## Po co to istnieje
 *
 * Karta auta mówiła klientowi „Zablokowany", bo taki jest stan pojazdu DZIŚ.
 * To prawda o dzisiaj i nieprawda o ofercie: auto zablokowane dziś bywa wolne
 * od jutra i formularz taką rezerwację przyjmie. Klient tego nie wiedział
 * i wychodził.
 *
 * Ta funkcja daje jedyną liczbę, której brakowało, żeby powiedzieć mu prawdę:
 * NAJBLIŻSZY dzień, w którym da się to auto wziąć. Data nie jest zgadywana ani
 * liczona z odstępu — pochodzi z tego samego predykatu, którym `getFreeUnits`
 * i `createReservation` decydują o wydaniu samochodu. Gdy w oknie nie ma ani
 * jednego wolnego dnia, model po prostu nie ma tu wiersza i karta mówi
 * „aktualnie niedostępny" zamiast obiecywać termin.
 *
 * ## Dlaczego jedno zapytanie, a nie jedno na model
 *
 * `getModelDayAvailability` odpowiada na to samo pytanie dla JEDNEGO modelu
 * i robi to dobrze na karcie auta. Na siatce floty jest jedenaście modeli, więc
 * byłoby jedenaście przejść do bazy na każde wyświetlenie strony głównej.
 * `generate_series` × `cars` mieści to w jednym.
 *
 * ## Okno, a nie nieskończoność
 *
 * `horizonDays` domyślnie 60. Auto wolne dopiero za pół roku nie jest ofertą,
 * na którą klient czeka — jest odpowiedzią „nie". Krótsze okno to też krótsze
 * zapytanie: 60 dni × liczba egzemplarzy.
 */
export async function getNextFreeDayByModel(
  from: string,
  horizonDays = 60,
): Promise<Map<string, string>> {
  try {
    const db = getDb();

    const rows = rowsOf<{ model_id: string; day: string | Date }>(
      await db.execute(sql`
        WITH days AS (
          SELECT d::date AS day
          FROM generate_series(
            ${from}::date,
            ${from}::date + ${horizonDays}::int,
            interval '1 day'
          ) d
        )
        SELECT c.model_id::text AS model_id, MIN(days.day) AS day
        FROM days
        JOIN cars c ON c.status = 'available'
        WHERE NOT EXISTS (
          SELECT 1 FROM reservations r
          WHERE r.car_id = c.id
            AND r.status IN ('confirmed', 'completed')
            AND ${zajetoscRezerwacji("r")} && ${doba(sql`days.day`)}
        )
        AND NOT EXISTS (
          SELECT 1 FROM availability_blocks ab
          WHERE ab.car_id = c.id
            AND ${zajetoscBloku("ab")} && ${doba(sql`days.day`)}
        )
        GROUP BY c.model_id
      `),
    );

    const out = new Map<string, string>();
    for (const row of rows) {
      if (!row.day) continue;
      out.set(
        row.model_id,
        row.day instanceof Date
          ? isoDay(row.day)
          : String(row.day).slice(0, 10),
      );
    }
    return out;
  } catch {
    /*
      Ta sama zasada, co w `getPublicModelStates`: napis o dostępności jest
      najmniej ważną rzeczą na karcie auta i awaria bazy nie ma prawa położyć
      przez niego całej floty. Pusta mapa znaczy „nie wiem, kiedy" — a wtedy
      karta mówi „sprawdź dostępność", czyli zdanie prawdziwe zawsze.
    */
    return new Map();
  }
}

export type FreeUnit = {
  id: string;
  modelId: string;
  plate: string | null;
  brand: string;
  model: string;
  /** Cena katalogowa modelu — do pokazania różnicy przy przesiadce. */
  dailyPriceGrosze: number;
};

/**
 * Free units — the cars themselves, not a count per model.
 *
 * Needed when a rental has to be MOVED to another car (breakdown, upgrade):
 * a count answers "is there anything", and the operator has to answer "which
 * one". `exceptReservationId` is what makes it usable at all — the rental
 * being moved is itself blocking the dates, so without excluding it the list
 * would hide the very cars that are free once it moves off them.
 *
 * Same predicate as `getFreeUnitsByModel`, deliberately: two "almost the same"
 * availability queries are the first thing to drift apart, and the one that
 * drifts is always the one nobody looks at.
 */
export async function getFreeUnits(
  startDate: string,
  endDate: string,
  exceptReservationId?: string,
): Promise<FreeUnit[]> {
  const db = getDb();
  const except = exceptReservationId ?? null;

  const rows = rowsOf<{
    id: string;
    model_id: string;
    plate: string | null;
    brand: string;
    model: string;
    daily_price_grosze: number | string;
  }>(
    await db.execute(sql`
      SELECT c.id::text, c.model_id::text, c.plate,
             cm.brand, cm.model, cm.daily_price_grosze
      FROM cars c
      JOIN car_models cm ON cm.id = c.model_id
      WHERE c.status = 'available'
        AND NOT EXISTS (
          SELECT 1 FROM reservations r
          WHERE r.car_id = c.id
            AND r.status IN ('confirmed', 'completed')
            AND (${except}::uuid IS NULL OR r.id <> ${except}::uuid)
            AND ${zajetoscRezerwacji("r")} && ${okresPytania(startDate, endDate)}
        )
        AND NOT EXISTS (
          SELECT 1 FROM availability_blocks ab
          WHERE ab.car_id = c.id
            AND ${zajetoscBloku("ab")} && ${okresPytania(startDate, endDate)}
        )
      ORDER BY cm.brand, cm.model, c.plate
    `),
  );

  return rows.map((r) => ({
    id: r.id,
    modelId: r.model_id,
    plate: r.plate,
    brand: r.brand,
    model: r.model,
    dailyPriceGrosze: Number(r.daily_price_grosze) || 0,
  }));
}
