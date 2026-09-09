import { z } from "zod";
import { BOOKING_RULES, handoverSlots } from "./fees";
import { poleOchronne } from "@/lib/security/form-guard";

// A handover time is only valid if it is one of the slots the form offers —
// checked against the same generator, so the two can never disagree.
const handoverTime = z
  .string()
  .regex(/^\d{2}:\d{2}$/, "invalid_time")
  .refine((s) => handoverSlots().includes(s), "invalid_time");

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "invalid_date")
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), "invalid_date");

function utcMidnight(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}
function todayUtc(): number {
  const n = new Date();
  return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
}

/**
 * Boundary validation for a booking request. Everything an attacker can send is
 * checked here (types, formats, date order, past dates, min/max length, lead
 * time, enums) BEFORE any business logic. Note: NO price fields are accepted —
 * the total is computed server-side from DB prices, never taken from the client.
 */
export const bookingRequestSchema = z
  .object({
    modelSlug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(64),
    /**
     * Which surface started this booking.
     *
     * A closed set, defaulting to `website`, so the worst a forged request can
     * do is mislabel its own origin in a statistic. Everything that decides
     * money or availability is recomputed server-side regardless of what this
     * says — see `createReservation`.
     */
    source: z.enum(["website", "chatbot"]).default("website"),
    /**
     * Język klienta. `default` a nie pole wymagane: żądanie sprzed tej zmiany
     * (otwarta karta, powtórzone wysłanie) ma nadal przejść, a nie odbić się
     * o walidację z powodu pola, o którym nie mogło wiedzieć.
     */
    locale: z.enum(["pl", "en"]).default("pl"),
    /**
     * The assistant conversation this booking came out of, when it came out of
     * one. Recorded on the conversation row after the fact and used for nothing
     * else: it cannot change a price, a date, an availability answer or the
     * reservation itself, and an id pointing at no conversation links nothing.
     */
    conversationId: z
      .string()
      .regex(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        "invalid_conversation",
      )
      .nullish(),
    /*
     * Pola ochronne rozdziału 13.1 — pułapka na roboty, czas wypełniania
     * i token Turnstile. Stoją w schemacie, a nie obok niego, bo akcja
     * serwerowa przyjmuje JEDEN obiekt i wszystko, co do niej wchodzi, ma być
     * sprawdzone w tym samym miejscu. Żadne z nich nie wpływa na cenę, termin
     * ani dostępność; wszystkie trzy sprawdza `sprawdzFormularz`.
     */
    ...poleOchronne,
    startDate: isoDate,
    endDate: isoDate,
    pickupTime: handoverTime,
    returnTime: handoverTime,
    locationSlug: z.enum(["office", "airport", "delivery"]),
    extraDriver: z.boolean(),
    childSeat: z.boolean(),
    protectionPackage: z.boolean(),
    depositVariant: z.enum(["with_deposit", "no_deposit"]),
    customerName: z.string().trim().min(2).max(120),
    customerEmail: z.string().trim().email().max(200),
    customerPhone: z
      .string()
      .trim()
      .min(6)
      .max(32)
      .regex(/^[+0-9()\s-]+$/, "invalid_phone"),
    dateOfBirth: isoDate,
    addressStreet: z.string().trim().min(3).max(160),
    // Postcodes vary by country — "00-001" (PL), "SW1A 1AA" (UK), "10115" (DE),
    // "75008" (FR). Rather than a per-country format we only require a short
    // alphanumeric string (spaces/hyphens allowed), so the "-" is no longer
    // mandatory and non-Polish customers are not rejected.
    addressPostcode: z
      .string()
      .trim()
      .min(3)
      .max(12)
      .regex(/^[A-Za-z0-9][A-Za-z0-9 -]*$/, "invalid_postcode"),
    addressCity: z.string().trim().min(2).max(80),
    licenceNumber: z
      .string()
      .trim()
      .min(3)
      .max(40)
      .regex(/^[A-Za-z0-9/ -]+$/, "invalid_licence"),
  })
  .superRefine((v, ctx) => {
    const start = utcMidnight(v.startDate);
    const end = utcMidnight(v.endDate);
    const today = todayUtc();

    /**
     * The driver's age is NOT checked here any more.
     *
     * The threshold depends on the class of car — Standard, Premium or
     * Van/Bus — and this schema has only a slug, not the model row that says
     * which class it is. The check moved to `checkDriverEligibility`, called
     * in `createReservation` once the model has been read. See
     * `lib/booking/eligibility`.
     */

    if (start < today) {
      ctx.addIssue({
        code: "custom",
        path: ["startDate"],
        message: "past_date",
      });
    }
    if (end < start) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "end_before_start",
      });
    }
    const days = Math.round((end - start) / 86_400_000) + 1;
    if (days > BOOKING_RULES.maxDays) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "too_long" });
    }
    if ((start - today) / 86_400_000 > BOOKING_RULES.maxLeadDays) {
      ctx.addIssue({ code: "custom", path: ["startDate"], message: "too_far" });
    }
  });

export type BookingRequest = z.infer<typeof bookingRequestSchema>;
