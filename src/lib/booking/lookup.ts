"use server";

import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

/**
 * What a visitor is allowed to see about a reservation they hold the reference
 * for. Note what is NOT here: customer name, email, phone, address, licence
 * number. That omission is the whole security design of this feature.
 *
 * A reference is a bearer token — it travels in confirmation emails, gets
 * screenshotted, sits in this browser's localStorage. It is unguessable
 * (`AA-` + 8 random hex, ~4.3 billion values) but it is not a password, and
 * there is no second factor. So the rule is: holding a reference reveals the
 * booking, never the person. Someone who finds a reference learns that a Volvo
 * is booked for a week in August, and nothing that identifies anybody.
 *
 * If a "my details" view is ever wanted here, it needs real authentication
 * (reference + the email it was booked with, at minimum) — do not widen this
 * type without adding that.
 */
export type ReservationSummary = {
  reference: string;
  carName: string;
  carSlug: string;
  startDate: string;
  endDate: string;
  days: number;
  totalGrosze: number;
  depositGrosze: number;
  /**
   * WARUNKI PRZEBIEGU Z DNIA REZERWACJI, nie z dzisiejszego cennika.
   *
   * Czytane z `reservations.quote` — migawki wyceny zamrożonej przy zawarciu.
   * Gdyby brać je z `car_models`, podniesienie stawki w panelu zmieniłoby
   * klientowi warunki umowy, którą już zawarł, i to bez żadnego śladu.
   *
   * `null` znaczy „przy tej rezerwacji nie zapisano" i tak ma być
   * pokazane — dotyczy rezerwacji sprzed 01.09.2026, których JSON tych pól
   * po prostu nie ma. Podstawienie dzisiejszej stawki byłoby zgadywaniem
   * cudzej umowy.
   */
  extraMileageFeeGrosze: number | null;
  includedMileageKm: number | null;
  /**
   * `pending_verification` jest tu od rozdziału 13.4: klient, który wysłał
   * formularz i nie kliknął jeszcze w link z maila, MUSI widzieć swoją sprawę
   * — to jedyne miejsce, w którym znajdzie ją, gdy mail wpadł do spamu.
   */
  status:
    | "pending_verification"
    | "pending"
    | "confirmed"
    | "cancelled"
    /** Klient nie zjawił się po auto — patrz `reservationStatus` w schemacie. */
    | "no_show"
    | "completed"
    | "rejected";
};

/** Cap per request so this cannot be driven as a bulk lookup oracle. */
const MAX_REFS = 30;

/**
 * Resolve reservation references to their public summaries.
 *
 * Unknown references are silently dropped rather than reported as missing:
 * a caller learns nothing from a reference that isn't theirs. Stale entries in
 * a visitor's browser therefore just disappear from their list.
 */
export async function lookupReservations(
  references: unknown,
): Promise<ReservationSummary[]> {
  if (!Array.isArray(references)) return [];

  const refs = references
    .filter((r): r is string => typeof r === "string")
    // The generator's exact shape: AA- followed by 8 uppercase hex characters.
    .filter((r) => /^AA-[0-9A-F]{8}$/.test(r))
    .slice(0, MAX_REFS);

  if (refs.length === 0) return [];
  if (!process.env.DATABASE_URL) return [];

  try {
    const db = getDb();
    const rows = await db
      .select({
        reference: schema.reservations.reference,
        brand: schema.carModels.brand,
        model: schema.carModels.model,
        slug: schema.carModels.slug,
        startDate: schema.reservations.startDate,
        endDate: schema.reservations.endDate,
        days: schema.reservations.days,
        totalGrosze: schema.reservations.totalGrosze,
        depositGrosze: schema.reservations.depositGrosze,
        quote: schema.reservations.quote,
        status: schema.reservations.status,
      })
      .from(schema.reservations)
      .innerJoin(
        schema.carModels,
        eq(schema.reservations.carModelId, schema.carModels.id),
      )
      .where(inArray(schema.reservations.reference, refs));

    /*
      Migawka wyceny jest JSON-em w kolumnie tekstowej, więc może być
      wszystkim — także zapisem starszego obrazu, który tych pól nie znał.
      Czytamy defensywnie: cokolwiek nie jest liczbą, staje się `null`,
      czyli „nie zapisano". Nigdy wyjątkiem, bo zepsuty JSON jednej
      rezerwacji nie może wygasić listy wszystkich pozostałych.
    */
    const zWyceny = (raw: string) => {
      try {
        const q: unknown = JSON.parse(raw);
        const o = (q ?? {}) as Record<string, unknown>;
        const liczba = (v: unknown) =>
          typeof v === "number" && Number.isFinite(v) ? v : null;
        return {
          extraMileageFeeGrosze: liczba(o.extraMileageFeeGrosze),
          includedMileageKm: liczba(o.includedMileageKm),
        };
      } catch {
        return { extraMileageFeeGrosze: null, includedMileageKm: null };
      }
    };

    const order = new Map(refs.map((r, i) => [r, i]));
    return rows
      .map((r) => ({
        ...zWyceny(r.quote),
        reference: r.reference,
        carName: `${r.brand} ${r.model}`,
        carSlug: r.slug,
        startDate: String(r.startDate),
        endDate: String(r.endDate),
        days: r.days,
        totalGrosze: r.totalGrosze,
        depositGrosze: r.depositGrosze,
        status: r.status,
      }))
      .sort(
        (a, b) => (order.get(a.reference) ?? 0) - (order.get(b.reference) ?? 0),
      );
  } catch (err) {
    // Detail stays in the server log; the visitor just sees an empty list.
    console.error("lookupReservations failed:", err);
    return [];
  }
}
