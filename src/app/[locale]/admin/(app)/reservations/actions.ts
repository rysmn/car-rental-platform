"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { requirePermission } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/auth/audit";
import {
  canTransition,
  type ReservationStatus,
} from "@/lib/admin/reservation-status";
import { isOverlapError } from "@/lib/admin/reservations";
import {
  notifyReservationConfirmed,
  notifyReservationRejected,
} from "@/lib/email/notify";
import { getFeeCatalog } from "@/lib/booking/repo";
import { computeQuote, rentalDays } from "@/lib/booking/pricing";
import { upsertCustomer } from "@/lib/admin/customers";
import { syncPaidAt } from "@/lib/admin/payments";
import {
  DEPOSIT_STATUSES,
  DEPOSIT_TAKES_AMOUNT,
  listDepositEvents,
  summariseDeposit,
} from "@/lib/admin/deposits";
import { adminActionFailed } from "@/lib/alerts/admin";
import { przypnijDokumenty } from "@/lib/documents/repo";
import { wyslijDokumentyRezerwacji } from "@/lib/documents/wysylka";
import { siteConfig } from "@/lib/config/site";
import { getSetting } from "@/lib/admin/settings";
import { chwilaWarszawska } from "@/lib/booking/lead-time";
import { HANDOVER } from "@/lib/booking/fees";
import { recordAlert } from "@/lib/alerts/record";
import { formatPln } from "@/lib/format";
import { noShowMozliwy } from "@/lib/booking/cancellation";
import {
  naleznosc,
  oznaczZaplacona,
  umorz,
  wycenAnulowanie,
  zapiszNaleznosc,
} from "@/lib/booking/cancellation-repo";
import { notifyCancellationFeeWaived } from "@/lib/email/notify";
import {
  okresPytania,
  zajetoscBloku,
  zajetoscRezerwacji,
} from "@/lib/booking/bufor";

const input = z.object({
  id: z.string().uuid(),
  to: z.enum(["confirmed", "rejected", "cancelled", "completed"]),
  // Only meaningful when rejecting; ignored otherwise. Optional — an admin may
  // reject without a note.
  reason: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((s) => s ?? ""),
});

export type StatusResult =
  | { ok: true }
  | {
      ok: false;
      error: "invalid" | "not_found" | "illegal" | "overlap" | "server";
    };

export async function updateReservationStatus(
  raw: unknown,
): Promise<StatusResult> {
  const admin = await requirePermission("rezerwacje.status"); // authoritative — actions are their own endpoint
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { id, to, reason } = parsed.data;

  const db = getDb();
  try {
    // Pull the customer + car details up front so a rejection can be emailed
    // without a second round-trip, and joined to the model for a readable name.
    const [current] = await db
      .select({
        status: schema.reservations.status,
        reference: schema.reservations.reference,
        startDate: schema.reservations.startDate,
        endDate: schema.reservations.endDate,
        customerName: schema.reservations.customerName,
        customerEmail: schema.reservations.customerEmail,
        brand: schema.carModels.brand,
        model: schema.carModels.model,
        // Do wiadomości C z punktu 4 — potwierdzenie rezerwacji dla klienta.
        pickupTime: schema.reservations.pickupTime,
        returnTime: schema.reservations.returnTime,
        totalGrosze: schema.reservations.totalGrosze,
        // Migawka warunków — mail potwierdzający wypisuje z niej limit
        // i stawkę nadprzebiegu obowiązujące dla TEJ rezerwacji.
        quote: schema.reservations.quote,
        locale: schema.reservations.locale,
      })
      .from(schema.reservations)
      .leftJoin(
        schema.carModels,
        eq(schema.reservations.carModelId, schema.carModels.id),
      )
      .where(eq(schema.reservations.id, id))
      .limit(1);
    if (!current) return { ok: false, error: "not_found" };

    if (!canTransition(current.status as ReservationStatus, to)) {
      return { ok: false, error: "illegal" };
    }

    const rejecting = to === "rejected";

    // Confirming a reservation is what BLOCKS the calendar: the DB EXCLUDE
    // constraint rejects the UPDATE if it would overlap another confirmed
    // booking for the same car unit. That's the enforcement point.
    await db
      .update(schema.reservations)
      .set({
        status: to,
        // Persist the note on a rejection; clear it on any other transition so a
        // stale reason can't linger on a record that is no longer rejected.
        rejectionReason: rejecting ? reason || null : null,
        updatedAt: new Date(),
      })
      .where(eq(schema.reservations.id, id));

    await recordAudit({
      adminId: admin.id,
      action: `reservation.${to}`,
      entity: "reservation",
      entityId: id,
      before: { status: current.status },
      after: rejecting ? { status: to, reason } : { status: to },
    });

    /*
      POTWIERDZENIE dla klienta — wiadomość C z punktu 4.

      Do 30.08.2026 obsługa klikała „Potwierdź", auto stawało się zarezerwowane
      i klient nie dowiadywał się o tym w żaden sposób. Odrzucenie miało swój
      mail od miesięcy; potwierdzenie — czyli ta wiadomość, na którą klient
      naprawdę czeka — nie miało żadnego.

      Ten sam kontrakt co przy odrzuceniu: nigdy nie rzuca, więc awaria poczty
      nie cofa zmiany statusu, którą admin właśnie wykonał.
    */
    if (to === "confirmed") {
      /*
        Punkt 16: klient dostaje dokumenty DO ZAPOZNANIA SIĘ, zanim podpisze.

        Przypinane w chwili potwierdzenia, bo to jest moment, w którym warunki
        przestają być ruchome: od tej pory klient ma prawo do wersji, którą
        wtedy dostał, także wtedy, gdy regulamin zmieni się nazajutrz.
        Powtórne potwierdzenie niczego nie podmienia — pierwsze przypięcie jest
        tym, które obowiązuje.

        Nigdy nie przewraca akcji: status jest już zmieniony, a brak
        dokumentów w katalogu (świeży system) to zero przypiętych pozycji,
        nie błąd.
      */
      let maDokumenty = false;
      try {
        const ile = await przypnijDokumenty(
          id,
          current.locale === "en" ? "en" : "pl",
        );
        maDokumenty = ile > 0;
      } catch (err) {
        console.error("przypnijDokumenty:", err);
      }

      /*
        DOKUMENTY JAKO ZAŁĄCZNIKI — osobnym listem, zaraz po potwierdzeniu.

        Do 30.08.2026 klient dostawał wyłącznie ODNOŚNIK do strony „moje
        rezerwacje". Ta strona rozpoznaje go po numerze i kluczu z
        `localStorage` TEJ SAMEJ przeglądarki, więc mail otwarty na telefonie
        po rezerwacji zrobionej na komputerze prowadził na pustą stronę.
        Dokument był przypięty i pozostawał nieosiągalny — dokładnie to zgłosił
        właściciel.

        Idą tylko dokumenty z `auto_send = true`, i tylko te, które jeszcze nie
        wyszły. Drugi warunek jest całą ochroną przed podwójną wysyłką:
        powtórzone potwierdzenie nie wyśle umowy drugi raz.

        PO zapisie statusu i bez `await` w sensie sterowania: rezerwacja jest
        już potwierdzona, więc awaria poczty nie ma prawa jej cofnąć. Funkcja
        sama nie rzuca — zapisuje niepowodzenie przy dokumencie i podnosi alert,
        żeby obsługa mogła wysłać ręcznie.
      */
      if (maDokumenty) {
        void wyslijDokumentyRezerwacji(id).catch((err) =>
          console.error("wyslijDokumentyRezerwacji:", err),
        );
      }

      await notifyReservationConfirmed({
        reference: current.reference,
        carName: `${current.brand ?? ""} ${current.model ?? ""}`.trim() || "—",
        startDate: current.startDate,
        endDate: current.endDate,
        pickupTime: current.pickupTime,
        returnTime: current.returnTime,
        totalGrosze: current.totalGrosze,
        ...warunkiPrzebiegu(current.quote),
        customerName: current.customerName,
        customerEmail: current.customerEmail,
        locale: current.locale === "en" ? "en" : "pl",
        // Adres pokazujemy tylko wtedy, gdy naprawdę jest co pokazać —
        // odnośnik do pustej strony jest gorszy niż jego brak.
        documentsUrl: maDokumenty
          ? `${siteConfig.url}/${current.locale === "en" ? "en/" : ""}moje-rezerwacje`
          : null,
      });
    }

    // Tell the customer why. Best-effort: notifyReservationRejected never throws,
    // so a mail outage cannot undo the status change the admin just made.
    if (rejecting) {
      await notifyReservationRejected({
        reference: current.reference,
        carName: `${current.brand ?? ""} ${current.model ?? ""}`.trim() || "—",
        startDate: current.startDate,
        endDate: current.endDate,
        customerName: current.customerName,
        customerEmail: current.customerEmail,
        reason,
        locale: current.locale === "en" ? "en" : "pl",
      });
    }

    revalidatePath("/admin/reservations");
    revalidatePath(`/admin/reservations/${id}`);
    // Confirming or releasing a booking changes what the public availability
    // calendar and the fleet date filter must show, so the public tree is stale
    // the moment this succeeds.
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    if (isOverlapError(err)) return { ok: false, error: "overlap" };
    adminActionFailed("updateReservationStatus", err);
    return { ok: false, error: "server" };
  }
}

/**
 * Odometer readings taken at handover and at return.
 *
 * A separate action from the status workflow on purpose: these are operational
 * facts recorded by whoever hands the keys over, and they must be editable
 * after a reservation is completed — the reading is often written on paper and
 * typed in later. Tying them to a status transition would make a late
 * correction impossible.
 */
const odometerInput = z
  .object({
    id: z.string().uuid(),
    startOdometerKm: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? null : v),
      z.union([z.coerce.number().int().min(0).max(2_000_000), z.null()]),
    ),
    endOdometerKm: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? null : v),
      z.union([z.coerce.number().int().min(0).max(2_000_000), z.null()]),
    ),
  })
  // A return reading below the handover one is a typo, not a car driven
  // backwards. Rejected rather than stored, because the economics query would
  // silently drop it and the operator would never learn the figure is missing.
  .refine(
    (d) =>
      d.startOdometerKm == null ||
      d.endOdometerKm == null ||
      d.endOdometerKm >= d.startOdometerKm,
    { path: ["endOdometerKm"] },
  );


/**
 * Warunki przebiegu odczytane z migawki wyceny rezerwacji.
 *
 * Czytane defensywnie i nigdy nie rzucające: `quote` to kolumna tekstowa,
 * a rezerwacje sprzed 01.09.2026 mają w niej JSON bez tych pól. Brak = brak
 * wiersza w mailu, nigdy liczba wzięta z dzisiejszego cennika — ta sama
 * zasada, co w „moich rezerwacjach" i w rozliczeniu zwrotu.
 */
function warunkiPrzebiegu(quote: string): {
  includedMileageKm: number | null;
  extraMileageFeeGrosze: number | null;
} {
  try {
    const o = (JSON.parse(quote) ?? {}) as Record<string, unknown>;
    const liczba = (v: unknown) =>
      typeof v === "number" && Number.isFinite(v) ? v : null;
    return {
      includedMileageKm: liczba(o.includedMileageKm),
      extraMileageFeeGrosze: liczba(o.extraMileageFeeGrosze),
    };
  } catch {
    return { includedMileageKm: null, extraMileageFeeGrosze: null };
  }
}

export type OdometerResult = { ok: true } | { ok: false; error: string };

export async function updateOdometer(
  _prev: OdometerResult | null,
  formData: FormData,
): Promise<OdometerResult> {
  const admin = await requirePermission("wydania.prowadz");
  const parsed = odometerInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error:
        "Sprawdź stany licznika — muszą być liczbami, a stan przy zwrocie nie może być niższy niż przy wydaniu.",
    };
  }
  const d = parsed.data;

  const db = getDb();
  try {
    const [before] = await db
      .select({
        id: schema.reservations.id,
        carId: schema.reservations.carId,
        start: schema.reservations.startOdometerKm,
        end: schema.reservations.endOdometerKm,
      })
      .from(schema.reservations)
      .where(eq(schema.reservations.id, d.id))
      .limit(1);
    if (!before) return { ok: false, error: "Nie znaleziono rezerwacji." };

    await db
      .update(schema.reservations)
      .set({
        startOdometerKm: d.startOdometerKm,
        endOdometerKm: d.endOdometerKm,
        updatedAt: new Date(),
      })
      .where(eq(schema.reservations.id, d.id));

    // The car's own mileage follows the highest reading we have seen, so the
    // fleet list stops drifting out of date on its own.
    if (d.endOdometerKm != null) {
      await db
        .update(schema.cars)
        .set({ mileageKm: d.endOdometerKm, updatedAt: new Date() })
        .where(eq(schema.cars.id, before.carId));
    }

    await recordAudit({
      adminId: admin.id,
      action: "reservation.odometer.update",
      entity: "reservation",
      entityId: d.id,
      before: { start: before.start, end: before.end },
      after: { start: d.startOdometerKm, end: d.endOdometerKm },
    });

    revalidatePath(`/admin/reservations/${d.id}`);
    revalidatePath("/admin/analytics");
    revalidatePath(`/admin/analytics/${before.carId}`);
    return { ok: true };
  } catch (err) {
    adminActionFailed("updateOdometer", err);
    return { ok: false, error: "Wystąpił błąd. Spróbuj ponownie." };
  }
}

/* ── Booking taken over the phone ─────────────────────────────────────────── */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Deliberately lighter than the public `bookingRequestSchema`.
 *
 * The public form asks for address, date of birth and licence number because
 * the customer is filling it in themselves and those end up on the contract.
 * On the phone they are four extra questions between "do you have a Panamera
 * for Friday" and "yes, booked" — so the admin path requires a name, a phone
 * number and a date range, and the rest is added later on the reservation
 * page. An email is optional because plenty of callers do not offer one.
 */
const phoneBooking = z
  .object({
    modelId: z.string().uuid(),
    locationId: z.string().uuid(),
    startDate: z.string().regex(DATE_RE, "Podaj datę odbioru"),
    endDate: z.string().regex(DATE_RE, "Podaj datę zwrotu"),
    pickupTime: z
      .string()
      .trim()
      .refine((v) => v === "" || TIME_RE.test(v), "Godzina w formacie GG:MM")
      .transform((v) => (v === "" ? null : v)),
    returnTime: z
      .string()
      .trim()
      .refine((v) => v === "" || TIME_RE.test(v), "Godzina w formacie GG:MM")
      .transform((v) => (v === "" ? null : v)),
    customerName: z.string().trim().min(2, "Imię i nazwisko").max(120),
    customerPhone: z.string().trim().min(6, "Numer telefonu").max(40),
    customerEmail: z
      .string()
      .trim()
      .max(200)
      .refine(
        (v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
        "Nieprawidłowy adres e-mail",
      ),
    extraDriver: z.coerce.boolean(),
    childSeat: z.coerce.boolean(),
    protectionPackage: z.coerce.boolean(),
    depositVariant: z.enum(["with_deposit", "no_deposit"]),
    /**
     * Confirmed by default: an admin typing this in has just agreed it with
     * the customer, and a booking that does not block the calendar is how the
     * same car gets promised twice. "Oczekująca" stays available for the
     * "hold it while they call back" case.
     */
    /**
     * Three words the operator uses, mapped onto two independent facts.
     *
     * "Wstępna" and "potwierdzona" are reservation statuses — they decide
     * whether the car is blocked. "Opłacona" is not a third status: it is a
     * confirmed booking that has been paid for. Squeezing payment into the
     * status enum would mean a paid rental could not also be "completed", and
     * the calendar would have to care about money.
     */
    stage: z.enum(["pending", "confirmed", "paid"]),
    paymentMethod: z.enum(["", "cash", "card", "transfer", "online"]),
  })
  .refine((d) => d.endDate >= d.startDate, {
    message: "Zwrot nie może być przed odbiorem",
    path: ["endDate"],
  });

export type PhoneBookingResult =
  | { ok: true; id: string; reference: string }
  | {
      ok: false;
      error: "validation" | "not_found" | "full" | "overlap" | "server";
      fieldErrors?: Record<string, string>;
      /**
       * Everything the operator had typed, handed back so the form can
       * repopulate itself. "That car is taken this week" is a normal answer on
       * a phone call, and making somebody read the name and number back out
       * because the page cleared them is how a sixty-second booking becomes a
       * three-minute one.
       */
      values?: Record<string, string>;
    };

export async function createPhoneBooking(
  _prev: PhoneBookingResult | null,
  formData: FormData,
): Promise<PhoneBookingResult> {
  const admin = await requirePermission("rezerwacje.status");

  // Kept for every failure path below. React puts its own bookkeeping into
  // the same FormData ($ACTION_REF, $ACTION_KEY…); echoing that back to the
  // browser would be noise at best, so only real form fields are kept.
  const values: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v === "string" && !k.startsWith("$")) values[k] = v;
  }

  const parsed = phoneBooking.safeParse({
    modelId: formData.get("modelId") ?? "",
    locationId: formData.get("locationId") ?? "",
    startDate: formData.get("startDate") ?? "",
    endDate: formData.get("endDate") ?? "",
    pickupTime: formData.get("pickupTime") ?? "",
    returnTime: formData.get("returnTime") ?? "",
    customerName: formData.get("customerName") ?? "",
    customerPhone: formData.get("customerPhone") ?? "",
    customerEmail: formData.get("customerEmail") ?? "",
    extraDriver: formData.get("extraDriver") === "on",
    childSeat: formData.get("childSeat") === "on",
    protectionPackage: formData.get("protectionPackage") === "on",
    depositVariant: formData.get("depositVariant") ?? "with_deposit",
    stage: formData.get("stage") ?? "confirmed",
    paymentMethod: formData.get("paymentMethod") ?? "",
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, error: "validation", fieldErrors, values };
  }
  const d = parsed.data;

  try {
    const db = getDb();
    const [model] = await db
      .select()
      .from(schema.carModels)
      .where(eq(schema.carModels.id, d.modelId))
      .limit(1);
    if (!model) return { ok: false, error: "not_found", values };

    const [loc] = await db
      .select()
      .from(schema.pickupLocations)
      .where(eq(schema.pickupLocations.id, d.locationId))
      .limit(1);
    if (!loc) return { ok: false, error: "not_found", values };

    // The price is computed here from the same catalogue the public site
    // prices against — never typed in, so a phone booking and a web booking
    // for the same car and dates cost the same.
    const fees = await getFeeCatalog();
    const days = rentalDays(
      new Date(`${d.startDate}T00:00:00Z`),
      new Date(`${d.endDate}T00:00:00Z`),
    );
    const quote = computeQuote({
      dailyPriceGrosze: model.dailyPriceGrosze,
      dailyPrice3to6Grosze: model.dailyPrice3to6Grosze ?? null,
      dailyPrice7to13Grosze: model.dailyPrice7to13Grosze ?? null,
      dailyPrice14to29Grosze: model.dailyPrice14to29Grosze ?? null,
      monthlyPriceGrosze: model.monthlyPriceGrosze,
      depositGrosze: model.depositGrosze,
      kmPerDayLimit: model.kmPerDayLimit,
      extraMileageFeeGrosze: model.extraMileageFeeGrosze,
      cancellationPolicy: await getSetting("cancellation"),
      days,
      locationFeeGrosze: loc.feeGrosze,
      extras: {
        extraDriver: d.extraDriver,
        childSeat: d.childSeat,
        protectionPackage: d.protectionPackage,
      },
      depositVariant: d.depositVariant,
      fees,
    });

    // The directory is kept current as a side effect of taking the booking,
    // so the next call from this number fills the form by itself.
    const customerId = await upsertCustomer({
      phone: d.customerPhone,
      name: d.customerName,
      email: d.customerEmail,
    });

    const reference = `AA-${globalThis.crypto
      .randomUUID()
      .replace(/-/g, "")
      .slice(0, 8)
      .toUpperCase()}`;

    const created = await db.transaction(async (tx) => {
      // Same allocation as the public path: a roadworthy unit of this model
      // with nothing blocking overlapping the range. SKIP LOCKED so two
      // admins booking the last car at once get one booking and one honest
      // "no cars free", instead of a deadlock.
      const free = await tx.execute(sql`
        SELECT c.id FROM cars c
        WHERE c.model_id = ${model.id} AND c.status = 'available'
        AND NOT EXISTS (
          SELECT 1 FROM reservations r
          WHERE r.car_id = c.id AND r.status IN ('confirmed', 'completed')
          AND ${zajetoscRezerwacji("r")}
              && ${okresPytania(d.startDate, d.endDate, d.pickupTime, d.returnTime)}
        )
        AND NOT EXISTS (
          SELECT 1 FROM availability_blocks ab
          WHERE ab.car_id = c.id
          AND ${zajetoscBloku("ab")}
              && ${okresPytania(d.startDate, d.endDate, d.pickupTime, d.returnTime)}
        )
        ORDER BY c.created_at
        LIMIT 1
        FOR UPDATE OF c SKIP LOCKED
      `);
      const result = free as unknown as
        { id: string }[] | { rows?: { id: string }[] };
      const rows = Array.isArray(result) ? result : (result.rows ?? []);
      const carId = rows[0]?.id;
      if (!carId) return null;

      const [row] = await tx
        .insert(schema.reservations)
        .values({
          reference,
          carModelId: model.id,
          carId,
          startDate: d.startDate,
          endDate: d.endDate,
          pickupTime: d.pickupTime,
          returnTime: d.returnTime,
          days,
          pickupLocationId: loc.id,
          extraDriver: d.extraDriver,
          childSeat: d.childSeat,
          protectionPackage: d.protectionPackage,
          depositVariant: d.depositVariant,
          totalGrosze: quote.totalGrosze,
          depositGrosze: quote.depositGrosze,
          quote: JSON.stringify(quote),
          customerName: d.customerName,
          customerEmail: d.customerEmail,
          customerPhone: d.customerPhone,
          customerId,
          status: d.stage === "pending" ? "pending" : "confirmed",
          paymentMethod: d.paymentMethod === "" ? null : d.paymentMethod,
          paidAt: d.stage === "paid" ? new Date() : null,
        })
        .returning({ id: schema.reservations.id });
      return row.id;
    });

    if (!created) return { ok: false, error: "full", values };

    await recordAudit({
      adminId: admin.id,
      action: "reservation.create.phone",
      entity: "reservation",
      entityId: created,
      after: {
        reference,
        stage: d.stage,
        payment: d.paymentMethod || null,
        total: quote.totalGrosze,
      },
    });

    revalidatePath("/admin");
    revalidatePath("/admin/reservations");
    return { ok: true, id: created, reference };
  } catch (err) {
    if (isOverlapError(err)) return { ok: false, error: "overlap", values };
    adminActionFailed("phoneBooking", err);
    return { ok: false, error: "server", values };
  }
}

/* ── Payments ─────────────────────────────────────────────────────────────── */

const paymentInput = z.object({
  reservationId: z.string().uuid(),
  amount: z.coerce
    .number()
    .refine((v) => Number.isFinite(v) && v !== 0, "Podaj kwotę"),
  method: z.enum(["cash", "card", "transfer", "online"]),
  paidOn: z.string().regex(DATE_RE, "Podaj datę"),
  note: z.string().trim().max(300),
});

export type PaymentResult = { ok: true } | { ok: false; error: string };

/**
 * Record money received. Negative amounts are allowed and mean a refund —
 * a returned deposit or a corrected overpayment is a payment in the other
 * direction, and forcing an admin to delete and re-enter the history to
 * express one is how ledgers stop matching reality.
 */
export async function addPayment(
  _prev: PaymentResult | null,
  formData: FormData,
): Promise<PaymentResult> {
  const admin = await requirePermission("finanse.edytuj");
  const parsed = paymentInput.safeParse({
    reservationId: formData.get("reservationId") ?? "",
    amount: String(formData.get("amount") ?? "").replace(",", "."),
    method: formData.get("method") ?? "cash",
    paidOn: formData.get("paidOn") ?? "",
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Popraw dane wpłaty",
    };
  }
  const d = parsed.data;

  try {
    await getDb()
      .insert(schema.reservationPayments)
      .values({
        reservationId: d.reservationId,
        amountGrosze: Math.round(d.amount * 100),
        method: d.method,
        paidOn: d.paidOn,
        note: d.note || null,
        createdBy: admin.id,
      });
    await syncPaidAt(d.reservationId);
    await recordAudit({
      adminId: admin.id,
      action: "reservation.payment.add",
      entity: "reservation",
      entityId: d.reservationId,
      after: { amount: Math.round(d.amount * 100), method: d.method },
    });
    revalidatePath("/admin");
    revalidatePath(`/admin/reservations/${d.reservationId}`);
    return { ok: true };
  } catch (err) {
    adminActionFailed("Payment", err);
    return { ok: false, error: "Nie udało się zapisać wpłaty" };
  }
}

export async function deletePayment(
  _prev: PaymentResult | null,
  formData: FormData,
): Promise<PaymentResult> {
  const admin = await requirePermission("finanse.edytuj");
  const id = String(formData.get("id") ?? "");
  const reservationId = String(formData.get("reservationId") ?? "");
  if (!UUID_RE.test(id) || !UUID_RE.test(reservationId)) {
    return { ok: false, error: "Nieprawidłowe dane" };
  }
  try {
    await getDb()
      .delete(schema.reservationPayments)
      .where(eq(schema.reservationPayments.id, id));
    await syncPaidAt(reservationId);
    await recordAudit({
      adminId: admin.id,
      action: "reservation.payment.delete",
      entity: "reservation",
      entityId: reservationId,
      before: { paymentId: id },
    });
    revalidatePath("/admin");
    revalidatePath(`/admin/reservations/${reservationId}`);
    return { ok: true };
  } catch (err) {
    adminActionFailed("paymentDelete", err);
    return { ok: false, error: "Nie udało się usunąć wpłaty" };
  }
}

/* ── Deposits ─────────────────────────────────────────────────────────────── */

const depositInput = z.object({
  reservationId: z.string().uuid(),
  status: z.enum(DEPOSIT_STATUSES),
  amount: z.coerce.number().min(0, "Kwota nie może być ujemna"),
  kept: z.coerce.number().min(0, "Kwota nie może być ujemna"),
  method: z.enum(["cash", "card", "transfer", "online"]).optional(),
  note: z.string().trim().max(300),
});

export type DepositResult = { ok: true } | { ok: false; error: string };

/**
 * Add one step to a deposit's history.
 *
 * Refusals here are deliberately few and all of the same kind: they stop the
 * log from saying something that cannot be true (giving back more than is
 * held, keeping money without a reason). Everything else is allowed, because
 * deposits go sideways in real life — a card hold expires, a return happens in
 * two parts — and a panel that rejects the unusual case sends the operator to
 * a notebook, which is the record we are trying not to lose.
 */
export async function addDepositEvent(
  _prev: DepositResult | null,
  formData: FormData,
): Promise<DepositResult> {
  const admin = await requirePermission("kaucje.prowadz");
  const parsed = depositInput.safeParse({
    reservationId: formData.get("reservationId") ?? "",
    status: formData.get("status") ?? "",
    amount: String(formData.get("amount") ?? "0").replace(",", ".") || "0",
    kept: String(formData.get("kept") ?? "0").replace(",", ".") || "0",
    method: String(formData.get("method") ?? "") || undefined,
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Popraw dane kaucji",
    };
  }
  const d = parsed.data;
  const amount = Math.round(d.amount * 100);
  const kept = Math.round(d.kept * 100);
  const movesMoney = DEPOSIT_TAKES_AMOUNT[d.status];

  if (movesMoney && amount + kept <= 0) {
    return { ok: false, error: "Podaj kwotę" };
  }
  if (d.status === "partially_kept" && kept <= 0) {
    return { ok: false, error: "Podaj, ile zatrzymujecie" };
  }
  if (d.status === "partially_kept" && !d.note) {
    return { ok: false, error: "Napisz, za co zatrzymana jest część kaucji" };
  }

  try {
    const [r] = await getDb()
      .select({
        depositGrosze: schema.reservations.depositGrosze,
        depositVariant: schema.reservations.depositVariant,
      })
      .from(schema.reservations)
      .where(eq(schema.reservations.id, d.reservationId));
    if (!r) return { ok: false, error: "Nie ma takiej rezerwacji" };

    const events = await listDepositEvents(d.reservationId);
    const before = summariseDeposit(r.depositGrosze, r.depositVariant, events);
    const releasing =
      d.status === "returned" || d.status === "partially_kept"
        ? amount + kept
        : 0;
    if (releasing > before.securedGrosze) {
      return {
        ok: false,
        error: `Zabezpieczone jest ${(before.securedGrosze / 100).toFixed(2)} zł — nie można rozliczyć więcej`,
      };
    }

    await getDb()
      .insert(schema.reservationDepositEvents)
      .values({
        reservationId: d.reservationId,
        status: d.status,
        amountGrosze: movesMoney ? amount : 0,
        keptGrosze: d.status === "partially_kept" ? kept : 0,
        method: movesMoney ? (d.method ?? null) : null,
        note: d.note || null,
        createdBy: admin.id,
      });
    await recordAudit({
      adminId: admin.id,
      action: "reservation.deposit.add",
      entity: "reservation",
      entityId: d.reservationId,
      before: { status: before.status, secured: before.securedGrosze },
      after: { status: d.status, amount, kept },
    });
    revalidatePath("/admin");
    revalidatePath("/admin/kaucje");
    revalidatePath(`/admin/reservations/${d.reservationId}`);
    return { ok: true };
  } catch (err) {
    adminActionFailed("Deposit", err);
    return { ok: false, error: "Nie udało się zapisać kaucji" };
  }
}

/**
 * Undo the LAST step, and only the last one.
 *
 * A mistyped amount has to be fixable, but a deposit's history is the answer
 * to "who let the customer's money go" — so nothing may be removed from the
 * middle of it. Undoing the top of the stack leaves a chain that still reads
 * in order; deleting from the middle leaves one that lies about what happened.
 * The removal itself lands in the audit log either way.
 */
export async function deleteLastDepositEvent(
  _prev: DepositResult | null,
  formData: FormData,
): Promise<DepositResult> {
  const admin = await requirePermission("kaucje.prowadz");
  const id = String(formData.get("id") ?? "");
  const reservationId = String(formData.get("reservationId") ?? "");
  if (!UUID_RE.test(id) || !UUID_RE.test(reservationId)) {
    return { ok: false, error: "Nieprawidłowe dane" };
  }
  try {
    const events = await listDepositEvents(reservationId);
    const last = events[events.length - 1];
    if (!last || last.id !== id) {
      return {
        ok: false,
        error: "Cofnąć można tylko ostatni wpis — historia kaucji nie ma dziur",
      };
    }
    await getDb()
      .delete(schema.reservationDepositEvents)
      .where(eq(schema.reservationDepositEvents.id, id));
    await recordAudit({
      adminId: admin.id,
      action: "reservation.deposit.delete",
      entity: "reservation",
      entityId: reservationId,
      before: {
        status: last.status,
        amount: last.amountGrosze,
        kept: last.keptGrosze,
      },
    });
    revalidatePath("/admin");
    revalidatePath("/admin/kaucje");
    revalidatePath(`/admin/reservations/${reservationId}`);
    return { ok: true };
  } catch (err) {
    adminActionFailed("depositDelete", err);
    return { ok: false, error: "Nie udało się cofnąć wpisu" };
  }
}

/* ── Przeniesienie na inne auto ───────────────────────────────────────────── */

export type MoveResult = { ok: true } | { ok: false; error: string };

/**
 * Przenieś rezerwację na inny egzemplarz — awaria, upgrade, przetasowanie.
 *
 * Trzy rzeczy, które ta akcja robi świadomie INACZEJ, niż podpowiada odruch:
 *
 *   1. **Cena zostaje.** Przesiadka jest naszą decyzją operacyjną, a nie nową
 *      ofertą: klient nie ma dopłacać za to, że nasze auto stanęło. Gdyby
 *      przesiadka miała kosztować, to jest rozmowa z klientem i osobna zmiana
 *      wyceny, a nie efekt uboczny kliknięcia w panelu.
 *   2. **Model idzie za egzemplarzem.** `car_model_id` jest przepisywany z
 *      nowego auta, bo inaczej rezerwacja twierdziłaby, że klient jedzie
 *      sedanem, siedząc w busie — a cała flota publiczna, kalendarz i
 *      analityka czytają model, nie egzemplarz.
 *   3. **Kolizję rozstrzyga baza, nie ten kod.** Sprawdzenie dostępności przed
 *      zapisem jest tylko po to, żeby dać zrozumiały komunikat; jedyną
 *      gwarancją, że jedno auto nie zostanie wynajęte dwa razy, jest
 *      ograniczenie EXCLUDE — i to ono ma odmówić.
 */
export async function moveReservation(input: {
  id: string;
  carId: string;
}): Promise<MoveResult> {
  const admin = await requirePermission("rezerwacje.status");
  if (!UUID_RE.test(input.id) || !UUID_RE.test(input.carId)) {
    return { ok: false, error: "Nieprawidłowe dane" };
  }

  try {
    const db = getDb();
    const [before] = await db
      .select({
        carId: schema.reservations.carId,
        status: schema.reservations.status,
        reference: schema.reservations.reference,
      })
      .from(schema.reservations)
      .where(eq(schema.reservations.id, input.id));
    if (!before) return { ok: false, error: "Nie ma takiej rezerwacji" };
    if (before.status === "cancelled" || before.status === "rejected") {
      return {
        ok: false,
        error: "Odwołanej rezerwacji nie ma po co przenosić",
      };
    }
    if (before.carId === input.carId) {
      return { ok: false, error: "To jest to samo auto" };
    }

    const [car] = await db
      .select({ modelId: schema.cars.modelId, status: schema.cars.status })
      .from(schema.cars)
      .where(eq(schema.cars.id, input.carId));
    if (!car) return { ok: false, error: "Nie ma takiego auta" };
    if (car.status !== "available") {
      return { ok: false, error: "To auto nie jest sprawne" };
    }

    await db
      .update(schema.reservations)
      .set({
        carId: input.carId,
        carModelId: car.modelId,
        updatedAt: new Date(),
      })
      .where(eq(schema.reservations.id, input.id));

    await recordAudit({
      adminId: admin.id,
      action: "reservation.move",
      entity: "reservation",
      entityId: input.id,
      before: { carId: before.carId },
      after: { carId: input.carId },
    });

    revalidatePath("/admin");
    revalidatePath("/admin/reservations");
    revalidatePath(`/admin/reservations/${input.id}`);
    revalidatePath("/admin/fleet");
    return { ok: true };
  } catch (err) {
    if (isOverlapError(err)) {
      return {
        ok: false,
        error: "To auto jest w tym terminie zajęte — ktoś je właśnie wziął",
      };
    }
    adminActionFailed("reservationMove", err);
    return { ok: false, error: "Nie udało się przenieść rezerwacji" };
  }
}


/* ── Pomocniki anulowania ────────────────────────────────────────────────── */

/**
 * Godziny do odbioru liczone z zapisu w bazie, a nie z `Wiersz` samoobsługi.
 *
 * Przechodzi przez `chwilaWarszawska`, czyli tę samą funkcję, co próg
 * minimalnego czasu do odbioru i okno zmiany terminu — dzięki temu panel
 * i strona klienta nigdy nie policzą tej samej rezerwacji inaczej.
 */
function godzinyDoOdbioruZapisu(
  startDate: string,
  pickupTime: string | null,
  teraz: number,
): number {
  const chwila = chwilaWarszawska(
    startDate,
    (pickupTime ?? HANDOVER.defaultPickup).slice(0, 5),
  );
  if (Number.isNaN(chwila)) return Number.POSITIVE_INFINITY;
  return (chwila - teraz) / 3_600_000;
}

/** Dane rezerwacji w kształcie, którego oczekuje list do klienta. */
async function daneKlientaDoListu(id: string) {
  const db = getDb();
  const [r] = await db
    .select({
      reference: schema.reservations.reference,
      startDate: schema.reservations.startDate,
      endDate: schema.reservations.endDate,
      pickupTime: schema.reservations.pickupTime,
      returnTime: schema.reservations.returnTime,
      totalGrosze: schema.reservations.totalGrosze,
      customerName: schema.reservations.customerName,
      customerEmail: schema.reservations.customerEmail,
      locale: schema.reservations.locale,
      brand: schema.carModels.brand,
      model: schema.carModels.model,
    })
    .from(schema.reservations)
    .leftJoin(
      schema.carModels,
      eq(schema.reservations.carModelId, schema.carModels.id),
    )
    .where(eq(schema.reservations.id, id))
    .limit(1);
  if (!r) return null;
  return {
    reference: r.reference,
    carName: `${r.brand ?? ""} ${r.model ?? ""}`.trim() || "—",
    startDate: String(r.startDate),
    endDate: String(r.endDate),
    pickupTime: r.pickupTime,
    returnTime: r.returnTime,
    // List o umorzeniu nie jest rachunkiem za najem — kwota najmu tylko
    // rozpraszałaby uwagę od jedynej liczby, która się w nim liczy.
    totalGrosze: 0,
    customerName: r.customerName,
    customerEmail: r.customerEmail,
    locale: (r.locale === "en" ? "en" : "pl") as "pl" | "en",
  };
}

/**
 * Wpis do centrum powiadomień panelu — istniejącego rejestru, nie nowego.
 *
 * `warning`, nie `error`: anulowanie nie jest awarią systemu, tylko sprawą,
 * którą ktoś ma zobaczyć. Klucz zawiera numer rezerwacji, więc dwa anulowania
 * to dwa wpisy, a nie jeden licznik.
 */
async function powiadomOAnulowaniu(input: {
  reference: string;
  kwotaGrosze: number;
  nieodebranie?: boolean;
}): Promise<void> {
  const co = input.nieodebranie ? "nieodebrana" : "anulowana przez klienta";
  const kwota =
    input.kwotaGrosze > 0
      ? `Opłata: ${formatPln(input.kwotaGrosze, "pl")}. Status: DO ZAPŁATY.`
      : "Anulowanie bezpłatne — nie ma czego rozliczać.";
  await recordAlert({
    module: "booking",
    severity: "warning",
    key: `reservation.cancelled:${input.reference}`,
    title: `Rezerwacja ${input.reference} — ${co}`,
    detail: kwota,
    context: { reference: input.reference, kwotaGrosze: input.kwotaGrosze },
  });
}

/* ── Anulowanie: nieodebranie, umorzenie, wpłata ──────────────────────────── */

/**
 * Oznaczenie rezerwacji jako nieodebranej i naliczenie opłaty.
 *
 * RĘCZNIE, przez człowieka, i tylko po upływie tolerancji z polityki. Automat,
 * który po trzydziestu minutach sam obciąża klienta, jest dokładnie tym, czego
 * zamówienie zabrania: nikt nie wie, czy klient stoi w korku, czy nie przyjdzie.
 * Ta funkcja daje obsłudze przycisk, nie zegarowi prawo do rachunku.
 *
 * Opłata liczy się z zasad ZAPAMIĘTANYCH przy rezerwacji, nie z dzisiejszych —
 * i podlega temu samemu sufitowi, co anulowanie: nigdy więcej niż wartość
 * rezerwacji.
 */
export async function oznaczNieodebranie(
  _prev: unknown,
  formData: FormData,
): Promise<{ ok: true; kwotaGrosze: number } | { ok: false; error: string }> {
  const admin = await requirePermission("rezerwacje.status");
  const id = String(formData.get("id") ?? "");
  if (!UUID_RE.test(id)) return { ok: false, error: "Nieprawidłowe dane." };

  try {
    const db = getDb();
    const [r] = await db
      .select({
        id: schema.reservations.id,
        reference: schema.reservations.reference,
        status: schema.reservations.status,
        startDate: schema.reservations.startDate,
        pickupTime: schema.reservations.pickupTime,
        returnTime: schema.reservations.returnTime,
        endDate: schema.reservations.endDate,
        totalGrosze: schema.reservations.totalGrosze,
        quote: schema.reservations.quote,
        customerName: schema.reservations.customerName,
        customerEmail: schema.reservations.customerEmail,
        locale: schema.reservations.locale,
        brand: schema.carModels.brand,
        model: schema.carModels.model,
      })
      .from(schema.reservations)
      .leftJoin(
        schema.carModels,
        eq(schema.reservations.carModelId, schema.carModels.id),
      )
      .where(eq(schema.reservations.id, id))
      .limit(1);
    if (!r) return { ok: false, error: "not_found" };

    if (!canTransition(r.status as ReservationStatus, "no_show")) {
      return {
        ok: false,
        error: "Tylko potwierdzona rezerwacja może być nieodebrana.",
      };
    }

    const polityka = await getSetting("cancellation");
    const doOdbioruH = godzinyDoOdbioruZapisu(
      String(r.startDate),
      r.pickupTime,
      Date.now(),
    );
    /*
      Tolerancja liczona z DZISIEJSZEJ konfiguracji, a nie z migawki — i to jest
      świadome. Tolerancja nie jest ceną: mówi obsłudze, od kiedy wypada uznać,
      że klient nie przyjdzie, i nie zmienia tego, ile klient zapłaci. Kwota
      nadal pochodzi z migawki rezerwacji.
    */
    if (!noShowMozliwy(doOdbioruH, polityka)) {
      return {
        ok: false,
        error: `Za wcześnie. Rezerwację można uznać za nieodebraną dopiero ${polityka.noShowGraceMinutes} min po godzinie odbioru.`,
      };
    }

    const { charge, policy } = wycenAnulowanie({
      quote: r.quote,
      totalGrosze: r.totalGrosze,
      hoursToPickup: doOdbioruH,
      kind: "no_show",
    });

    const wynik = await db.transaction(async (tx) => {
      const zmienione = await tx
        .update(schema.reservations)
        .set({ status: "no_show", updatedAt: new Date() })
        .where(
          sql`${schema.reservations.id} = ${id} AND ${schema.reservations.status} = 'confirmed'`,
        )
        .returning({ id: schema.reservations.id });
      if (zmienione.length === 0) return "zajete" as const;
      await zapiszNaleznosc(tx, {
        reservationId: id,
        charge,
        policy,
        reservationTotalGrosze: r.totalGrosze,
        chargedBy: admin.id,
      });
      return "ok" as const;
    });
    if (wynik === "zajete") {
      return { ok: false, error: "Status zmienił się w międzyczasie." };
    }

    await recordAudit({
      adminId: admin.id,
      action: "reservation.no_show",
      entity: "reservation",
      entityId: id,
      before: { status: r.status },
      after: {
        status: "no_show",
        oplataGrosze: charge.amountGrosze,
        cennikGrosze: charge.policyGrosze,
        doOdbioruH: Number(doOdbioruH.toFixed(2)),
      },
    });

    void powiadomOAnulowaniu({
      reference: r.reference,
      kwotaGrosze: charge.amountGrosze,
      nieodebranie: true,
    });

    revalidatePath(`/admin/reservations/${id}`);
    revalidatePath("/admin/reservations");
    return { ok: true, kwotaGrosze: charge.amountGrosze };
  } catch (err) {
    adminActionFailed("oznaczNieodebranie", err);
    return { ok: false, error: "Wystąpił błąd. Spróbuj ponownie." };
  }
}

/**
 * Umorzenie opłaty — z powodem, bez kasowania czegokolwiek.
 *
 * Kwota pierwotna zostaje w wierszu; dopisujemy tylko kto, kiedy i dlaczego.
 * Powód jest OBOWIĄZKOWY, i to nie jest formalność: umorzenie bez powodu
 * wygląda po miesiącach jak zniknięcie należności, a nie jak decyzja.
 */
export async function umorzOplateAnulowania(
  _prev: unknown,
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await requirePermission("finanse.edytuj");
  const id = String(formData.get("id") ?? "");
  const powod = String(formData.get("reason") ?? "").trim();
  if (!UUID_RE.test(id)) return { ok: false, error: "Nieprawidłowe dane." };
  if (powod.length < 3 || powod.length > 500) {
    return { ok: false, error: "Podaj powód umorzenia (3–500 znaków)." };
  }

  try {
    const przed = await naleznosc(id);
    if (!przed) return { ok: false, error: "Brak naliczonej opłaty." };
    if (przed.status === "waived") {
      return { ok: false, error: "Ta opłata jest już umorzona." };
    }
    if (przed.amountGrosze <= 0) {
      return { ok: false, error: "Nie ma czego umarzać — opłata wynosi 0 zł." };
    }

    const po = await umorz({ reservationId: id, adminId: admin.id, reason: powod });
    if (!po) return { ok: false, error: "Ta opłata jest już umorzona." };

    await recordAudit({
      adminId: admin.id,
      action: "reservation.cancellation_fee.waive",
      entity: "reservation",
      entityId: id,
      before: {
        oplataGrosze: przed.amountGrosze,
        naliczono: przed.chargedAt.toISOString(),
        status: przed.status,
      },
      after: { status: "waived", powod, doZaplaty: 0 },
    });

    // Klient dostał list z kwotą — ma dostać i ten, że kwoty już nie ma.
    const dane = await daneKlientaDoListu(id);
    if (dane) {
      void notifyCancellationFeeWaived({
        ...dane,
        anulowanie: {
          kwotaGrosze: przed.amountGrosze,
          cennikGrosze: przed.policyGrosze,
          ograniczonaWartoscia: false,
          umorzona: true,
        },
      });
    }

    revalidatePath(`/admin/reservations/${id}`);
    revalidatePath("/admin/reservations");
    return { ok: true };
  } catch (err) {
    adminActionFailed("umorzOplateAnulowania", err);
    return { ok: false, error: "Wystąpił błąd. Spróbuj ponownie." };
  }
}

/** Odnotowanie wpłaty należności. Umorzonej nie da się „zapłacić". */
export async function oznaczOplateZaplacona(
  _prev: unknown,
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await requirePermission("finanse.edytuj");
  const id = String(formData.get("id") ?? "");
  if (!UUID_RE.test(id)) return { ok: false, error: "Nieprawidłowe dane." };
  try {
    const po = await oznaczZaplacona({ reservationId: id });
    if (!po) {
      return {
        ok: false,
        error: "Nie ma czego odnotować — opłata jest już zapłacona lub umorzona.",
      };
    }
    await recordAudit({
      adminId: admin.id,
      action: "reservation.cancellation_fee.paid",
      entity: "reservation",
      entityId: id,
      before: { status: "due", kwotaGrosze: po.amountGrosze },
      after: { status: "paid" },
    });
    revalidatePath(`/admin/reservations/${id}`);
    return { ok: true };
  } catch (err) {
    adminActionFailed("oznaczOplateZaplacona", err);
    return { ok: false, error: "Wystąpił błąd. Spróbuj ponownie." };
  }
}
