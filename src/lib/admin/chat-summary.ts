import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import type { Bilingual } from "@/lib/i18n-pick";

/**
 * One conversation, summarised — what was wanted, what happened, and where it
 * stopped.
 *
 * Assembled from facts recorded while the conversation was happening, never
 * from re-reading the transcript afterwards. Re-reading would mean guessing,
 * and a guess printed in a table looks exactly like a measurement.
 *
 * Two fields are honest about a gap rather than filling it:
 *
 *   · `reservation` — the booking form is reached by a link carrying
 *     `zrodlo=chatbot`, and a completed booking records that source. It does
 *     NOT record which conversation sent it, so the assistant's total bookings
 *     are known while any single conversation's are not. Linking the two would
 *     mean changing the reservation flow, which is out of bounds here.
 *   · `noBookingReason` — returns "brak danych" whenever the evidence does not
 *     single out a cause, which is often, and correctly so.
 */

export type ConversationSummary = {
  id: string;
  startedAt: Date;
  lastMessageAt: Date;
  locale: string;
  intent: string | null;
  status: string;
  messageCount: number;
  /** What the visitor asked for, deduplicated — see `chat_demand`. */
  wanted: {
    label: string;
    brand: string | null;
    model: string | null;
    segment: string | null;
    seats: number | null;
    inFleet: boolean;
    unavailable: boolean;
    alternativesShown: boolean;
    times: number;
  }[];
  dateFrom: string | null;
  dateTo: string | null;
  locationName: string | null;
  carName: string | null;
  searchedCar: boolean;
  matchedCar: boolean;
  sawPrice: boolean;
  alternativesShown: boolean;
  wentToBooking: boolean;
  leadCreated: boolean;
  handoff: boolean;
  aiUsed: boolean;
  aiFallback: boolean;
  unansweredCount: number;
  noBookingReason: Bilingual;
};

const REASON: Record<string, Bilingual> = {
  brak_auta: {
    pl: "Brak odpowiedniego auta we flocie",
    en: "No suitable car in the fleet",
  },
  brak_dostepnosci: {
    pl: "Brak dostępności w terminie",
    en: "Not available on the dates",
  },
  pracownik: {
    pl: "Przekazano do pracownika",
    en: "Handed over to a member of staff",
  },
  lead: {
    pl: "Zostawił kontakt zamiast rezerwować",
    en: "Left contact details instead of booking",
  },
  nie_rozpoznano: {
    pl: "Nie rozpoznano pytania",
    en: "Question not recognised",
  },
  tylko_sprawdzal: {
    pl: "Klient tylko sprawdzał",
    en: "Customer was only checking",
  },
  zamknieto: {
    pl: "Zamknięto rozmowę po pierwszej wiadomości",
    en: "Conversation closed after the first message",
  },
  brak_danych: {
    pl: "Brak danych — za mało śladów, żeby orzec",
    en: "No data — too few traces to decide",
  },
  rezerwacja: {
    pl: "Doszło do przejścia na formularz rezerwacji",
    en: "Moved on to the booking form",
  },
};

export async function getConversationSummary(
  id: string,
): Promise<ConversationSummary | null> {
  const db = getDb();

  const head = (await db.execute(sql`
    SELECT c.id, c.started_at, c.last_message_at, c.locale, c.topic, c.status,
           c.message_count, c.date_from, c.date_to,
           c.searched_car, c.matched_car, c.saw_price, c.alternatives_shown,
           c.went_to_booking, c.lead_created, c.ai_used, c.ai_fallback,
           c.unanswered_count,
           pl.name AS location_name,
           CASE WHEN cm.id IS NULL THEN NULL
                ELSE cm.brand || ' ' || cm.model END AS car_name,
           EXISTS (SELECT 1 FROM chat_demand x
                    WHERE x.conversation_id = c.id AND NOT x.in_fleet) AS want_missing,
           EXISTS (SELECT 1 FROM chat_demand x
                    WHERE x.conversation_id = c.id AND x.unavailable) AS want_taken
      FROM chat_conversations c
      LEFT JOIN pickup_locations pl ON pl.id = c.location_id
      LEFT JOIN car_models cm ON cm.id = c.car_model_id
     WHERE c.id = ${id}
     LIMIT 1
  `)) as unknown as Record<string, unknown>[];

  const h = (Array.isArray(head) ? head : [])[0];
  if (!h) return null;

  const wantedRows = (await db.execute(sql`
    SELECT label, brand, model, segment, seats, in_fleet, unavailable,
           alternatives_shown, times
      FROM chat_demand
     WHERE conversation_id = ${id}
     ORDER BY times DESC, created_at
  `)) as unknown as Record<string, unknown>[];

  const b = (v: unknown) => v === true || v === "t" || v === "true";
  const wentToBooking = b(h.went_to_booking);
  const status = String(h.status);

  /**
   * The same ladder the aggregate report uses, applied to one row.
   *
   * Order is certainty, not frequency: a named car we do not own explains the
   * ending on its own; "the visitor sent two messages and left" explains
   * nothing, and says so.
   */
  const reasonKey = wentToBooking
    ? "rezerwacja"
    : status === "handoff"
      ? "pracownik"
      : b(h.want_missing)
        ? "brak_auta"
        : b(h.want_taken)
          ? "brak_dostepnosci"
          : b(h.lead_created)
            ? "lead"
            : Number(h.unanswered_count) > 0 && !b(h.matched_car)
              ? "nie_rozpoznano"
              : b(h.saw_price) || b(h.matched_car)
                ? "tylko_sprawdzal"
                : Number(h.message_count) <= 2
                  ? "zamknieto"
                  : "brak_danych";

  return {
    id: String(h.id),
    startedAt: new Date(h.started_at as string),
    lastMessageAt: new Date(h.last_message_at as string),
    locale: String(h.locale),
    intent: (h.topic as string) ?? null,
    status,
    messageCount: Number(h.message_count) || 0,
    wanted: (Array.isArray(wantedRows) ? wantedRows : []).map((r) => ({
      label: String(r.label),
      brand: (r.brand as string) ?? null,
      model: (r.model as string) ?? null,
      segment: (r.segment as string) ?? null,
      seats: r.seats == null ? null : Number(r.seats),
      inFleet: b(r.in_fleet),
      unavailable: b(r.unavailable),
      alternativesShown: b(r.alternatives_shown),
      times: Number(r.times) || 1,
    })),
    dateFrom: (h.date_from as string) ?? null,
    dateTo: (h.date_to as string) ?? null,
    locationName: (h.location_name as string) ?? null,
    carName: (h.car_name as string) ?? null,
    searchedCar: b(h.searched_car),
    matchedCar: b(h.matched_car),
    sawPrice: b(h.saw_price),
    alternativesShown: b(h.alternatives_shown),
    wentToBooking,
    leadCreated: b(h.lead_created),
    handoff: status === "handoff",
    aiUsed: b(h.ai_used),
    aiFallback: b(h.ai_fallback),
    unansweredCount: Number(h.unanswered_count) || 0,
    noBookingReason: REASON[reasonKey] ?? { pl: reasonKey, en: reasonKey },
  };
}
