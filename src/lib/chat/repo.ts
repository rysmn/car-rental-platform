import "server-only";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { Intent } from "./nlu";
import type { ChatSlots } from "./types";
import type { LeadReason, RequestSource } from "@/lib/db/schema";
import type { Demand } from "./demand";
import { sanitizeForStorage } from "./ai/sanitize";
import { reasonFromIntents } from "./lead-reason";
import { reportAlert } from "@/lib/alerts/record";

/**
 * Persistence for the assistant.
 *
 * What is stored: the transcript, what the conversation was about (as ids), and
 * questions that went unanswered. What is NOT stored: IP addresses, browser
 * fingerprints, or any copy of a price or availability answer. The rate limiter
 * keeps an address in memory for five minutes; nothing writes one to disk.
 *
 * Retention is enforced by `purgeOldChats`, called from the daily cron. A
 * transcript is operational data with a short useful life — after ninety days
 * it is a liability rather than an asset, and the aggregate counts the analytics
 * page needs survive in `chat_unanswered` and `chat_leads`.
 */

export const RETENTION_DAYS = 90;

export type StartedConversation = { id: string };

export async function startConversation(locale: string): Promise<string> {
  const [row] = await getDb()
    .insert(schema.chatConversations)
    /*
     * The two funnel flags start as `false`, not as NULL.
     *
     * NULL on those columns means "this stage was not being measured when the
     * conversation happened" — the state every row written before 22.08.2026
     * is in. A conversation starting now IS measured, so it says so from the
     * first message, and the analytics can tell a real zero from a blind spot.
     */
    .values({ locale, bookingFormStarted: false, carOpened: false })
    .returning({ id: schema.chatConversations.id });
  return row.id;
}

/** Does this id exist and is it still open? Guards a forged conversation id. */
export async function conversationExists(id: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: schema.chatConversations.id })
    .from(schema.chatConversations)
    .where(eq(schema.chatConversations.id, id))
    .limit(1);
  return Boolean(row);
}

export async function recordTurn(params: {
  conversationId: string;
  userMessage: string;
  botBlocks: string;
  intent: Intent;
  locale: string;
  slots: ChatSlots;
  unanswered: boolean;
  handoff: boolean;
  /** Was this turn about choosing a car at all? */
  searchedCar?: boolean;
  /** Were real cars put in front of the visitor? */
  matchedCar?: boolean;
  /** Was a priced quote shown? */
  sawPrice?: boolean;
  /** Were substitutes offered? */
  alternativesShown?: boolean;
  /** Did Cloudflare read this message, and did it then have to fall back? */
  aiUsed?: boolean;
  aiFallback?: boolean;
  /** Normalised question to remember as unsettled, or null to clear it. */
  pendingUnanswered?: string | null;
}): Promise<void> {
  const db = getDb();

  /**
   * What the visitor typed, minus the things nobody here needs.
   *
   * A national ID, a card number or an IBAN typed into a chat box is not
   * information A&A asked for and not information it should keep. Masked here
   * rather than on the way out, so there is no window in which the full value
   * exists in a row. Phone numbers and e-mail addresses are left intact — an
   * operator reading this transcript needs them.
   */
  const storedUserMessage = sanitizeForStorage(params.userMessage).text;

  await db.insert(schema.chatMessages).values([
    {
      conversationId: params.conversationId,
      role: "user" as const,
      body: storedUserMessage.slice(0, 2000),
      intent: params.intent,
    },
    {
      conversationId: params.conversationId,
      role: "bot" as const,
      body: params.botBlocks.slice(0, 4000),
      intent: null,
    },
  ]);

  await db
    .update(schema.chatConversations)
    .set({
      locale: params.locale,
      topic: params.intent,
      // Slots are pointers into live data — safe to store, and they are what
      // the admin list means by "interesujący samochód" and "termin".
      carModelId: params.slots.carModelIds[0] ?? null,
      dateFrom: params.slots.dateFrom,
      dateTo: params.slots.dateTo,
      locationId: params.slots.locationId,
      messageCount: sql`${schema.chatConversations.messageCount} + 2`,
      // Latched, never cleared: each of these is "did this EVER happen in this
      // conversation". A visitor who was shown three cars and then asked about
      // insurance has still been shown three cars, and a funnel that forgot
      // that would report the last turn instead of the conversation.
      searchedCar: params.searchedCar
        ? true
        : sql`${schema.chatConversations.searchedCar}`,
      matchedCar: params.matchedCar
        ? true
        : sql`${schema.chatConversations.matchedCar}`,
      sawPrice: params.sawPrice
        ? true
        : sql`${schema.chatConversations.sawPrice}`,
      alternativesShown: params.alternativesShown
        ? true
        : sql`${schema.chatConversations.alternativesShown}`,
      aiUsed: params.aiUsed ? true : sql`${schema.chatConversations.aiUsed}`,
      aiFallback: params.aiFallback
        ? true
        : sql`${schema.chatConversations.aiFallback}`,
      pendingUnanswered:
        params.pendingUnanswered === undefined
          ? sql`${schema.chatConversations.pendingUnanswered}`
          : params.pendingUnanswered,
      unansweredCount: params.unanswered
        ? sql`${schema.chatConversations.unansweredCount} + 1`
        : sql`${schema.chatConversations.unansweredCount}`,
      status: params.handoff ? "handoff" : undefined,
      lastMessageAt: new Date(),
    })
    .where(eq(schema.chatConversations.id, params.conversationId));
}

/**
 * The visitor closed the panel — the conversation is over.
 *
 * Marks the row `closed` rather than deleting it. Reset ends a conversation; it
 * never erases a business record, so the transcript, the lead and the analytics
 * all stay exactly where they were. Without this the status column only ever
 * held `active` or `handoff`, "rozmowy zakończone" could not be counted, and a
 * conversation abandoned an hour ago still looked live in the admin panel.
 *
 * A `handoff` row keeps its status: somebody is waiting to call that person
 * back, and closing a browser tab does not settle that.
 */
export async function endConversation(conversationId: string): Promise<void> {
  await getDb()
    .update(schema.chatConversations)
    .set({ status: "closed" })
    .where(
      and(
        eq(schema.chatConversations.id, conversationId),
        eq(schema.chatConversations.status, "active"),
      ),
    );
}

/** The visitor pressed a booking link — one half of the conversion funnel. */
export async function markWentToBooking(conversationId: string): Promise<void> {
  await getDb()
    .update(schema.chatConversations)
    .set({ wentToBooking: true, lastMessageAt: new Date() })
    .where(eq(schema.chatConversations.id, conversationId));
}

/**
 * The booking page opened with this conversation's id on it.
 *
 * Best-effort and idempotent: the panel may mount more than once (a remount, a
 * back-and-forward) and the column is a flag, not a counter, so repeats cost
 * one cheap write and change nothing. A failure here must never be visible to
 * somebody trying to book a car, which is why it is swallowed like the
 * reservation link below.
 */
export async function markBookingFormStarted(
  conversationId: string,
): Promise<void> {
  try {
    await getDb()
      .update(schema.chatConversations)
      .set({ bookingFormStarted: true, wentToBooking: true })
      .where(eq(schema.chatConversations.id, conversationId));
  } catch (err) {
    console.error("[chat] booking form start not recorded:", err);
    /*
     * Still swallowed — a customer opening the booking form must never be shown
     * an error because a funnel flag did not write. But swallowed is not the
     * same as unseen: silently losing this flag makes the funnel in
     * /admin/chatbot/analityka understate the last step, and a conversion
     * report that quietly reads low is worse than one that is visibly broken.
     */
    reportAlert({
      module: "chat",
      severity: "warning",
      key: "chat:booking-form-flag-not-written",
      title: "Nie zapisano znacznika lejka: formularz rezerwacji otwarty",
      detail: "Lejek w analityce zaniży ostatni krok. Rezerwacja klienta nie jest tym dotknięta.",
      error: err,
    });
  }
}

/**
 * The visitor opened one of the cars the assistant showed.
 *
 * The stage between "cars were shown" and "went to book", and until now it did
 * not exist: both buttons on a chat card reported `booking_click`, so somebody
 * browsing a car page and somebody heading for the form were the same number.
 *
 * Best-effort and idempotent, for the same reasons as the flag above: it is a
 * beacon on a page a customer is trying to read, and it must never be the
 * reason that page misbehaves.
 */
export async function markCarOpened(conversationId: string): Promise<void> {
  try {
    await getDb()
      .update(schema.chatConversations)
      .set({ carOpened: true, lastMessageAt: new Date() })
      .where(eq(schema.chatConversations.id, conversationId));
  } catch (err) {
    console.error("[chat] car open not recorded:", err);
    reportAlert({
      module: "chat",
      severity: "warning",
      key: "chat:car-opened-flag-not-written",
      title: "Nie zapisano znacznika lejka: auto otwarte",
      detail: "Lejek w analityce zaniży krok CAR OPENED. Strona auta działa normalnie.",
      error: err,
    });
  }
}

/**
 * Close the loop: this conversation ended in this reservation.
 *
 * Best-effort by design, and called after the booking is already saved. The
 * customer's reservation must never depend on an analytics link succeeding, so
 * a failure here is logged and swallowed — and a conversation id that no longer
 * exists simply matches no row.
 */
export async function linkReservation(
  conversationId: string,
  reservationId: string,
): Promise<void> {
  try {
    await getDb()
      .update(schema.chatConversations)
      .set({ reservationId, wentToBooking: true })
      .where(eq(schema.chatConversations.id, conversationId));
  } catch (err) {
    console.error("[chat] reservation not linked to conversation:", err);
    /*
     * The handoff from the assistant to a real booking — the one number that
     * says whether the assistant earns its keep. The reservation itself is
     * already committed and safe, so this stays swallowed; but if it fails
     * repeatedly, "the assistant produced no bookings" would be a reporting
     * artefact rather than the truth, and nobody could tell from the outside.
     */
    reportAlert({
      module: "chat",
      severity: "warning",
      key: "chat:reservation-not-linked",
      title: "Rezerwacja zapisana, ale nie powiązana z rozmową asystenta",
      detail:
        "Rezerwacja klienta jest bezpieczna. Statystyka „asystent → rezerwacja” będzie zaniżona.",
      error: err,
      context: { rezerwacja: reservationId },
    });
  }
}

/**
 * Log a question nobody could answer, grouping repeats.
 *
 * `onConflictDoUpdate` on (normalized, locale) is what makes the admin list a
 * ranked to-do rather than a wall of near-duplicates.
 */
export async function logUnanswered(params: {
  question: string;
  normalized: string;
  locale: string;
  category: string;
  intent?: string;
  /**
   * `unanswered` — the assistant said it did not know.
   * `low_confidence` — it answered, but only just cleared the matcher's floor.
   */
  kind?: "unanswered" | "low_confidence";
}): Promise<void> {
  if (!params.normalized.trim()) return;
  // Same rule as the transcript: an admin reviewing a question has no use for
  // the asker's national ID or card number, so it never reaches the row.
  const question = sanitizeForStorage(params.question).text.slice(0, 500);
  const kind = params.kind ?? "unanswered";
  await getDb()
    .insert(schema.chatUnanswered)
    .values({
      question,
      normalized: params.normalized.slice(0, 500),
      locale: params.locale,
      category: params.category,
      intent: params.intent ?? null,
      kind,
    })
    .onConflictDoUpdate({
      target: [schema.chatUnanswered.normalized, schema.chatUnanswered.locale],
      set: {
        times: sql`${schema.chatUnanswered.times} + 1`,
        intent: params.intent ?? sql`${schema.chatUnanswered.intent}`,
        lastAskedAt: new Date(),
        /**
         * A question that has ever gone completely unanswered stays marked
         * that way, even if a later phrasing of it scraped an answer. The
         * worse of the two states is the one worth showing an administrator.
         */
        kind:
          kind === "unanswered"
            ? "unanswered"
            : sql`${schema.chatUnanswered.kind}`,
        // Keep the most recent phrasing — it reads better than the first one.
        question,
      },
    });
}

/**
 * Write down what somebody asked for.
 *
 * **One row per interest per conversation.** The `onConflictDoUpdate` on
 * (conversation_id, normalized) is the whole anti-duplication mechanism, and it
 * is enforced by the database rather than by a check in the caller — a visitor
 * who writes "macie Cayenne?", "a Cayenne S?", "na pewno nie ma Cayenne?" is
 * one person wanting one car, and three rows would report three customers. The
 * repeats land in `times`, which is genuinely useful: asking three times is a
 * stronger signal than asking once.
 *
 * The flags only ever move toward "yes". If the first mention found the car
 * unavailable and a later one was asked without dates, the row keeps
 * `unavailable = true` — the clash happened, and a later vaguer question does
 * not unhappen it.
 */
export async function recordDemand(params: {
  conversationId: string;
  demand: Demand;
  inFleet: boolean;
  unavailable: boolean;
  alternativesShown: boolean;
  locale: string;
  dateFrom: string | null;
  dateTo: string | null;
}): Promise<void> {
  const d = params.demand;
  if (!d.normalized.trim()) return;

  await getDb()
    .insert(schema.chatDemand)
    .values({
      conversationId: params.conversationId,
      kind: d.kind,
      brand: d.brand,
      model: d.model,
      segment: d.segment,
      seats: d.seats,
      gearbox: d.gearbox,
      fuel: d.fuel,
      label: d.label.slice(0, 120),
      normalized: d.normalized.slice(0, 120),
      inFleet: params.inFleet,
      unavailable: params.unavailable,
      alternativesShown: params.alternativesShown,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      locale: params.locale,
    })
    .onConflictDoUpdate({
      target: [schema.chatDemand.conversationId, schema.chatDemand.normalized],
      set: {
        times: sql`${schema.chatDemand.times} + 1`,
        lastSeenAt: new Date(),
        unavailable: sql`${schema.chatDemand.unavailable} OR ${params.unavailable}`,
        alternativesShown: sql`${schema.chatDemand.alternativesShown} OR ${params.alternativesShown}`,
        // Dates from the newest mention, when it carried any.
        dateFrom: params.dateFrom
          ? params.dateFrom
          : sql`${schema.chatDemand.dateFrom}`,
        dateTo: params.dateTo
          ? params.dateTo
          : sql`${schema.chatDemand.dateTo}`,
      },
    });
}

/** The question left unsettled by the previous turn, if there was one. */
export async function pendingUnanswered(
  conversationId: string,
): Promise<string | null> {
  const [row] = await getDb()
    .select({ q: schema.chatConversations.pendingUnanswered })
    .from(schema.chatConversations)
    .where(eq(schema.chatConversations.id, conversationId))
    .limit(1);
  return row?.q ?? null;
}

/**
 * Settle a question that went unanswered a moment ago.
 *
 * Counted forward rather than inferred. When the assistant fails, the route
 * remembers which question it was; on the very next turn it comes back here and
 * says what happened — the visitor rephrased and got an answer, or gave up and
 * asked for a person. That distinction is the difference between a question
 * that needs a better FAQ entry and one that needs a human, and no amount of
 * staring at the question text alone recovers it.
 */
export async function settleUnanswered(params: {
  normalized: string;
  locale: string;
  outcome: "answered" | "human";
}): Promise<void> {
  if (!params.normalized.trim()) return;
  const column =
    params.outcome === "answered"
      ? schema.chatUnanswered.answeredLater
      : schema.chatUnanswered.wentToHuman;
  await getDb()
    .update(schema.chatUnanswered)
    .set({
      [params.outcome === "answered" ? "answeredLater" : "wentToHuman"]:
        sql`${column} + 1`,
    })
    .where(
      and(
        eq(schema.chatUnanswered.normalized, params.normalized.slice(0, 500)),
        eq(schema.chatUnanswered.locale, params.locale),
      ),
    );
}

/**
 * Czym była ta rozmowa — czytane z BAZY, nigdy z żądania.
 *
 * Zdanie klienta, które uruchomiło gałąź B2B, jest już zapisane przy jego
 * wiadomości jako intencja, więc nie ma powodu pytać o nie przeglądarki —
 * a przeglądarka nie ma jak skłamać.
 *
 * DLACZEGO CAŁA HISTORIA, A NIE `chat_conversations.topic`. Tamta kolumna
 * trzyma intencję OSTATNIEJ wiadomości i jest nadpisywana co obrót. Rozmowa
 * „potrzebuję 10 aut dla firmy na rok" → „zadzwońcie do mnie" kończy się
 * z `topic = "CONTACT_HUMAN"`, więc zapytanie firmowe warte roku najmu
 * docierało do obsługi opisane jako zwykła prośba o telefon. Intencje przy
 * wiadomościach klienta są zapisane wszystkie i nic ich nie nadpisuje.
 *
 * Rozmowa bez wiersza (albo skasowana) to zwykły czat: `chat` jest wartością
 * domyślną także w schemacie, więc obie warstwy mówią to samo.
 */
export async function leadContextOfConversation(
  conversationId: string | null,
): Promise<{ source: RequestSource; reason: LeadReason }> {
  if (!conversationId) return { source: "chat", reason: "general" };
  const db = getDb();

  const [intents, offFleet] = await Promise.all([
    db
      .select({ intent: schema.chatMessages.intent })
      .from(schema.chatMessages)
      .where(
        and(
          eq(schema.chatMessages.conversationId, conversationId),
          eq(schema.chatMessages.role, "user"),
        ),
      ),
    /*
     * Czy w tej rozmowie padło auto, którego nie mamy. Nie da się tego
     * odczytać z intencji: „Szukam Mercedesa V-Class" jest FIND_CAR dokładnie
     * tak samo jak „Szukam SUV-a", a różnica polega na tym, czy cokolwiek się
     * znalazło — i to jest już zapisane w rejestrze zapotrzebowania.
     */
    db
      .select({ id: schema.chatDemand.id })
      .from(schema.chatDemand)
      .where(
        and(
          eq(schema.chatDemand.conversationId, conversationId),
          eq(schema.chatDemand.inFleet, false),
        ),
      )
      .limit(1),
  ]);

  const names = intents.map((r) => r.intent).filter((i): i is string => !!i);
  const nonFleet = offFleet.length > 0;
  const reason = reasonFromIntents(names, nonFleet);

  /*
   * `source` zostaje kanałem: `b2b` jest w tym enumie od 44D i wciąż znaczy
   * „zapytanie firmowe z czatu", ale reszta tematów NIE dokłada tam wartości.
   * Od tego jest `reason`, i to jest cały powód, dla którego powstał.
   */
  return { source: reason === "b2b" ? "b2b" : "chat", reason };
}

/**
 * Kontakt, który TA rozmowa już zostawiła — albo `null`.
 *
 * Klucz to `conversation_id` i nic poza nim. Nie ma tu wyszukiwania po
 * numerze ani po adresie: gdyby było, dwie osoby korzystające z tego samego
 * telefonu firmowego zobaczyłyby nawzajem swoje dane, a widget stałby się
 * czytnikiem cudzych zgłoszeń po zgadniętym numerze. Identyfikator rozmowy
 * jest losowym uuid i ma tę jedną rolę.
 *
 * Sprawy zamknięte pomijamy z tego samego powodu, co przy zapisie: klient,
 * który wraca tydzień później, zgłasza nową rzecz.
 */
export async function contactLeftInConversation(
  conversationId: string,
): Promise<{ name: string | null; phone: string | null; email: string | null } | null> {
  const [row] = await getDb()
    .select({
      name: schema.chatLeads.name,
      phone: schema.chatLeads.phone,
      email: schema.chatLeads.email,
    })
    .from(schema.chatLeads)
    .where(
      and(
        eq(schema.chatLeads.conversationId, conversationId),
        sql`${schema.chatLeads.status} not in ('closed', 'spam')`,
      ),
    )
    .orderBy(desc(schema.chatLeads.createdAt))
    .limit(1);

  if (!row) return null;
  if (!row.name && !row.phone && !row.email) return null;
  return row;
}

/**
 * Wynik zapisu zgłoszenia.
 *
 * `created` istnieje dla POCZTY. Powiadomienie ma wyjść przy nowej sprawie,
 * a nie przy każdym dopisaniu numeru do sprawy, którą obsługa już ma na
 * biurku — a bez tej flagi wywołujący nie ma jak tych dwóch rzeczy odróżnić,
 * bo `id` wygląda tak samo w obu przypadkach.
 */
export type SavedLead = { id: string; created: boolean };

/**
 * Zapisz zgłoszenie klienta — INSERT albo UPDATE istniejącego.
 *
 * Nazwa została `createLead`, bo z punktu widzenia wywołującego to wciąż jest
 * „zapisz to zgłoszenie"; rozstrzygnięcie, czy powstaje nowy wiersz, należy do
 * tej funkcji i wraca w `created`. Patrz sekcja o duplikatach w środku.
 */
/**
 * Ile minut po zapisie kolejne wysłanie tego samego formularza jest jeszcze
 * TYM SAMYM zgłoszeniem.
 *
 * Dwie minuty, bo tyle trwa przypadek: podwójne kliknięcie, powrót wstecz
 * z ponownym wysłaniem, odświeżenie po zamulonej sieci. Wszystko dłuższe
 * zaczyna zjadać prawdziwe drugie zapytanie tej samej osoby — a klient, który
 * po kwadransie pisze, że jednak chodziło mu o inny model, ma prawo do własnej
 * sprawy w skrzynce.
 */
const DUPLICATE_WINDOW_MINUTES = 2;

export async function createLead(params: {
  conversationId: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  slots: ChatSlots;
  topic: string;
  /**
   * The rate the euro budget in `slots` was converted at, when there was one.
   *
   * Passed in rather than fetched here: the conversion happened when the
   * customer spoke, and re-reading the rate at save time could stamp the row
   * with a different number from the one that actually chose the cars.
   */
  plnPerEur?: number | null;
  /** Which language to call back in. */
  locale?: string | null;
  /**
   * Skąd przyszło zapytanie. Podaje je WYWOŁUJĄCY, który to wie — nigdy ciało
   * żądania. Pominięte znaczy „z rozmowy": wtedy wyprowadzamy je niżej
   * z zapisanej intencji, żeby zapytanie firmowe nie wyglądało jak zwykłe.
   */
  source?: RequestSource;
  /** Temat jednym zdaniem — z formularza. Czat układa go z rozmowy. */
  subject?: string | null;
  /** Pytanie do istniejącej rezerwacji. */
  reservationId?: string | null;
  /**
   * Treść wpisana przez klienta w formularzu.
   *
   * Dla leada z czatu zostaje `undefined` i pytanie czytamy z transkryptu —
   * patrz niżej. Formularz nie ma transkryptu, więc musi podać wprost.
   */
  message?: string | null;
  /**
   * Czego sprawa dotyczy. Pominięte znaczy „wyprowadź z rozmowy".
   * Formularz podaje wprost, bo transkryptu nie ma.
   */
  reason?: LeadReason;
  /** Firma, w imieniu której pisze klient. */
  company?: string | null;
  /** Model współpracy z formularza partnerskiego — patrz `chat_leads`. */
  partnerModel?: string | null;
  /** Orientacyjny zakres zaangażowania, tekstem, tak jak podał klient. */
  investRange?: string | null;
}): Promise<SavedLead> {
  const db = getDb();

  /*
   * What the visitor last asked, read from the transcript rather than sent by
   * the browser.
   *
   * It is the single most useful line on a lead — an operator who reads it
   * before dialling does not make the customer explain themselves twice — and
   * the server already has it. Taking it from the request instead would add a
   * free-text field anyone could post arbitrary content into, for information
   * that is already sitting in `chat_messages` under an id we have just
   * verified.
   */
  let question: string | null = params.message?.slice(0, 500) ?? null;
  if (!question && params.conversationId) {
    const [last] = await db
      .select({ body: schema.chatMessages.body })
      .from(schema.chatMessages)
      .where(
        and(
          eq(schema.chatMessages.conversationId, params.conversationId),
          eq(schema.chatMessages.role, "user"),
        ),
      )
      .orderBy(desc(schema.chatMessages.createdAt))
      .limit(1);
    question = last?.body?.slice(0, 500) ?? null;
  }
  const derived =
    params.source && params.reason
      ? { source: params.source, reason: params.reason }
      : await leadContextOfConversation(params.conversationId);
  const source = params.source ?? derived.source;
  const reason = params.reason ?? derived.reason;

  const values = {
    conversationId: params.conversationId,
    name: params.name,
    phone: params.phone,
    email: params.email,
    carModelId: params.slots.carModelIds[0] ?? null,
    dateFrom: params.slots.dateFrom,
    dateTo: params.slots.dateTo,
    locationId: params.slots.locationId,
    /*
     * The rest of what the conversation established, so the operator does
     * not open the call with "and what were you looking for?" — the customer
     * has already answered that.
     */
    seats: params.slots.seats,
    /*
     * The budget as the conversation held it, all four parts.
     *
     * Splitting them would be the same bug the assistant was just cured of:
     * "1500" without "za cały wynajem" reads as a nightly figure, and an
     * operator calling back would quote five times the price the customer had
     * in mind. The rate goes with them when the figure was said in euro, so the
     * złoty number in the row can still be explained a week later.
     */
    budgetGrosze: params.slots.budgetGrosze,
    budgetMinGrosze: params.slots.budgetMinGrosze,
    budgetKind: params.slots.budgetKind,
    budgetCurrency: params.slots.budgetCurrency,
    budgetPlnPerEur:
      params.slots.budgetCurrency === "eur" && params.plnPerEur
        ? params.plnPerEur.toFixed(4)
        : null,
    locale: params.locale ?? null,
    question,
    topic: params.topic,
    source,
    reason,
    subject: params.subject ?? null,
    reservationId: params.reservationId ?? null,
    company: params.company ?? null,
    partnerModel: params.partnerModel ?? null,
    investRange: params.investRange ?? null,
  };

  /*
   * ═══ OCHRONA PRZED DUPLIKATAMI — DWA KLUCZE, JEDNA TRANSAKCJA ═════════
   *
   * JEDNA ROZMOWA = JEDNO ZGŁOSZENIE. Formularz kontaktu w czacie pojawia się
   * w kilkunastu odpowiedziach asystenta i klient może go wypełnić drugi raz
   * — bo dopisał numer, bo wrócił po godzinie, bo pierwszy raz nacisnął dwa
   * razy. Każde z tych naciśnięć zakładało osobny wiersz, więc obsługa
   * dzwoniła do tej samej osoby tyle razy, ile razy nacisnęła.
   *
   * Kluczem jest ROZMOWA, nie treść. Porównywanie pól ma tę wadę, że drugie
   * zgłoszenie z dopisanym e-mailem NIE jest identyczne — a jest tą samą
   * sprawą. Rozmowa to rozstrzyga bez zgadywania.
   *
   * FORMULARZ PUBLICZNY ROZMOWY NIE MA i do tego etapu nie miał żadnej
   * ochrony: dwa szybkie naciśnięcia dawały dwie sprawy. Drugim kluczem jest
   * więc KONTAKT + TEMAT w KRÓTKIM OKNIE — świadomie krótkim, bo ten sam
   * człowiek ma pełne prawo napisać znowu za tydzień i to jest NOWA sprawa,
   * a nie duplikat. Bronimy się przed przypadkiem i przed dwoma równoległymi
   * żądaniami, nie przed powrotem klienta.
   *
   * DLACZEGO TRANSAKCJA I ZAMEK, A NIE SAMO `SELECT`. Dwa żądania wysłane
   * w tej samej milisekundzie oba nie znajdą niczego i oba wstawią wiersz —
   * sprawdzenie bez zamka nie broni dokładnie przed tym przypadkiem, dla
   * którego powstało. `pg_advisory_xact_lock` na skrócie kontaktu ustawia je
   * w kolejce: drugie wchodzi dopiero, gdy pierwsze zapisało, więc widzi jego
   * wiersz i tylko go uzupełnia. Zamek zwalnia się z końcem transakcji, bez
   * sprzątania w kodzie. Ta sama rodzina rozwiązań co zasuwka `notified_at`:
   * prawo do zapisu ZDOBYWA SIĘ w bazie, a nie sprawdza w pamięci procesu.
   *
   * Sprawa ZAMKNIĘTA nie jest aktualizowana: klient, który wraca tydzień po
   * załatwieniu sprawy, zgłasza nową rzecz, a nie tę samą. Wskrzeszenie
   * zamkniętego wiersza ukryłoby ją przed licznikiem, bo ten wiersz już był
   * przeczytany.
   */
  return db.transaction(async (tx) => {
    /*
     * Skrót kontaktu: same cyfry z telefonu i e-mail małymi literami, żeby
     * „+48 600 100 200" i „600100200" były tym samym numerem. `null`, gdy
     * zgłoszenie ma rozmowę (klucz jest wtedy inny) albo gdy nie ma kontaktu
     * — bez kontaktu nie ma czego porównywać.
     */
    const phoneKey = params.conversationId
      ? ""
      : (params.phone ?? "").replace(/\D/g, "");
    const emailKey = params.conversationId
      ? ""
      : (params.email ?? "").trim().toLowerCase();
    /*
     * Zamek bierze JEDEN skrót — telefon, a gdy go nie ma, e-mail. Dwa
     * przypadkowe wysłania tego samego formularza niosą ten sam numer, więc
     * ustawiają się w tej samej kolejce. Osobne zamki na każde pole nie
     * serializowałyby niczego: dwa żądania weszłyby dwiema bramkami naraz.
     */
    const lockKey = phoneKey || emailKey;

    if (lockKey) {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`lead:${reason}:${lockKey}`}))`,
      );
    }

    const existing = params.conversationId
      ? await tx
          .select({ id: schema.chatLeads.id })
          .from(schema.chatLeads)
          .where(
            and(
              eq(schema.chatLeads.conversationId, params.conversationId),
              sql`${schema.chatLeads.status} not in ('closed', 'spam')`,
            ),
          )
          .orderBy(desc(schema.chatLeads.createdAt))
          .limit(1)
      : lockKey
        ? await tx
            .select({ id: schema.chatLeads.id })
            .from(schema.chatLeads)
            .where(
              and(
                eq(schema.chatLeads.reason, reason),
                sql`${schema.chatLeads.status} not in ('closed', 'spam')`,
                sql`${schema.chatLeads.createdAt} > now() - ${sql.raw(
                  `interval '${DUPLICATE_WINDOW_MINUTES} minutes'`,
                )}`,
                /*
                 * `\\D` z PODWÓJNYM ukośnikiem, i to nie jest literówka.
                 * W literale szablonowym JavaScriptu `\D` to zwykłe „D",
                 * więc pierwsza wersja kazała bazie wycinać z numeru literę D
                 * zamiast wszystkiego, co nie jest cyfrą. Porównanie nigdy się
                 * nie zgadzało i ochrona milczała — bez jednego błędu w logu.
                 *
                 * TELEFON **ALBO** E-MAIL, nigdy sklejka obu.
                 *
                 * Pierwsza wersja porównywała `concat_ws('|', telefon, mail)`
                 * i przez to nie rozpoznawała najczęstszego przypadku: klient
                 * wysyła pierwszy raz z numerem i mailem, drugi raz z samym
                 * numerem — sklejki się różnią, więc powstawały dwie sprawy.
                 * Ten sam numer to ten sam człowiek, niezależnie od tego, ile
                 * pól wypełnił za drugim razem.
                 */
                sql`(
                      (${phoneKey} <> '' AND regexp_replace(coalesce(${schema.chatLeads.phone}, ''), '\\D', '', 'g') = ${phoneKey})
                      OR
                      (${emailKey} <> '' AND lower(trim(coalesce(${schema.chatLeads.email}, ''))) = ${emailKey})
                    )`,
              ),
            )
            .orderBy(desc(schema.chatLeads.createdAt))
            .limit(1)
        : [];

    if (existing[0]) {
      /*
       * AKTUALIZACJA UZUPEŁNIA, NIGDY NIE KASUJE. `coalesce(nowe, stare)` na
       * każdym polu: klient, który za drugim razem podał sam telefon, nie może
       * wymazać e-maila, który zostawił za pierwszym. Obsługa straciłaby dane,
       * które klient jej DAŁ, przez to, że dał więcej.
       *
       * `notified_at` zostaje nietknięte — patrz komentarz przy kolumnie.
       * `read_at` też: dopisanie numeru do sprawy, którą ktoś już czytał, nie
       * czyni jej nieprzeczytaną. Zmienił się szczegół, nie sprawa.
       */
      const filled = Object.fromEntries(
        Object.entries(values).filter(([, v]) => v !== null && v !== undefined),
      ) as Partial<typeof values>;
      /* `conversationId` już się zgadza — to po nim znaleźliśmy ten wiersz. */
      delete filled.conversationId;
      /*
       * `unsure` to DOMYŚLNA wartość listy w formularzu, czyli brak wyboru —
       * i dlatego nie może nadpisać wyboru dokonanego wcześniej.
       *
       * Klient, który za pierwszym razem zaznaczył „Partner pojazdowy",
       * a potem wysłał formularz ponownie, nie odwołał tamtej odpowiedzi:
       * po prostu nie ruszył listy, która wróciła do stanu początkowego.
       * Zapisanie „Do ustalenia" byłoby skasowaniem informacji, którą DAŁ —
       * dokładnie tego zabrania reguła nad tym blokiem. Wybór konkretnego
       * modelu za drugim razem nadal nadpisuje pierwszy, bo to jest zmiana
       * zdania, a nie jej brak.
       */
      if (filled.partnerModel === "unsure") delete filled.partnerModel;

      await tx
        .update(schema.chatLeads)
        .set({
          ...filled,
          /*
           * Temat i kanał są przeliczane z CAŁEJ rozmowy, więc idą zawsze,
           * także wtedy, gdy `filled` by je pominęło: rozmowa, w której po
           * prośbie o kontakt padło „a właściwie potrzebujemy dziesięciu aut
           * dla firmy", jest teraz zapytaniem firmowym i tak ma wyglądać
           * w skrzynce.
           */
          source: values.source,
          reason: values.reason,
          updatedAt: new Date(),
        })
        .where(eq(schema.chatLeads.id, existing[0].id));

      return { id: existing[0].id, created: false };
    }

    const [row] = await tx
      .insert(schema.chatLeads)
      .values({
        ...values,
        // Written at the moment the visitor pressed the button on a form that
        // stated what the data is for. Without that press there is no row.
        consentAt: new Date(),
      })
      .returning({ id: schema.chatLeads.id });

    if (params.conversationId) {
      await tx
        .update(schema.chatConversations)
        .set({ leadCreated: true })
        .where(eq(schema.chatConversations.id, params.conversationId));
    }
    return { id: row.id, created: true };
  });
}

/** Delete transcripts past the retention window. Returns rows removed. */
export async function purgeOldChats(days = RETENTION_DAYS): Promise<number> {
  const result = await getDb().execute(sql`
    WITH gone AS (
      DELETE FROM chat_conversations
      WHERE last_message_at < now() - MAKE_INTERVAL(days => ${days}::int)
      RETURNING 1
    )
    SELECT COUNT(*)::int AS n FROM gone
  `);
  const rows = (
    Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows
  ) as { n: number }[] | undefined;
  return Number(rows?.[0]?.n ?? 0) || 0;
}

/* ── Admin reads ──────────────────────────────────────────────────────────── */

export async function listConversations(limit = 100) {
  return getDb()
    .select({
      id: schema.chatConversations.id,
      locale: schema.chatConversations.locale,
      topic: schema.chatConversations.topic,
      dateFrom: schema.chatConversations.dateFrom,
      dateTo: schema.chatConversations.dateTo,
      leadCreated: schema.chatConversations.leadCreated,
      wentToBooking: schema.chatConversations.wentToBooking,
      unansweredCount: schema.chatConversations.unansweredCount,
      messageCount: schema.chatConversations.messageCount,
      status: schema.chatConversations.status,
      startedAt: schema.chatConversations.startedAt,
      carBrand: schema.carModels.brand,
      carModel: schema.carModels.model,
    })
    .from(schema.chatConversations)
    .leftJoin(
      schema.carModels,
      eq(schema.carModels.id, schema.chatConversations.carModelId),
    )
    .orderBy(desc(schema.chatConversations.startedAt))
    .limit(limit);
}

export async function getTranscript(conversationId: string) {
  return getDb()
    .select()
    .from(schema.chatMessages)
    .where(eq(schema.chatMessages.conversationId, conversationId))
    .orderBy(schema.chatMessages.createdAt);
}

export async function listLeads(limit = 200) {
  return getDb()
    .select({
      id: schema.chatLeads.id,
      name: schema.chatLeads.name,
      phone: schema.chatLeads.phone,
      email: schema.chatLeads.email,
      dateFrom: schema.chatLeads.dateFrom,
      dateTo: schema.chatLeads.dateTo,
      topic: schema.chatLeads.topic,
      seats: schema.chatLeads.seats,
      budgetGrosze: schema.chatLeads.budgetGrosze,
      budgetMinGrosze: schema.chatLeads.budgetMinGrosze,
      budgetKind: schema.chatLeads.budgetKind,
      budgetCurrency: schema.chatLeads.budgetCurrency,
      budgetPlnPerEur: schema.chatLeads.budgetPlnPerEur,
      leadLocale: schema.chatLeads.locale,
      question: schema.chatLeads.question,
      status: schema.chatLeads.status,
      note: schema.chatLeads.note,
      createdAt: schema.chatLeads.createdAt,
      conversationId: schema.chatLeads.conversationId,
      carBrand: schema.carModels.brand,
      carModel: schema.carModels.model,
      locationName: schema.pickupLocations.name,
    })
    .from(schema.chatLeads)
    .leftJoin(
      schema.carModels,
      eq(schema.carModels.id, schema.chatLeads.carModelId),
    )
    .leftJoin(
      schema.pickupLocations,
      eq(schema.pickupLocations.id, schema.chatLeads.locationId),
    )
    .orderBy(desc(schema.chatLeads.createdAt))
    .limit(limit);
}

export async function listUnanswered(limit = 200) {
  return getDb()
    .select()
    .from(schema.chatUnanswered)
    .orderBy(
      desc(schema.chatUnanswered.times),
      desc(schema.chatUnanswered.lastAskedAt),
    )
    .limit(limit);
}

export type ChatStats = {
  today: number;
  week: number;
  month: number;
  activeNow: number;
  leadsNew: number;
  leadsTotal: number;
  wentToBooking: number;
  reservationsFromChat: number;
  /** Conversations → booking clicks, as a percentage. */
  conversionPct: number | null;
  unansweredOpen: number;
  handoffs: number;
  /** Conversations the visitor closed — the other end of "rozmowy zaczęte". */
  ended: number;
  topCars: { name: string; n: number }[];
  topQuestions: { question: string; times: number }[];
};

/**
 * Everything the chatbot dashboard shows, in one round trip per group.
 *
 * `reservationsFromChat` counts reservations carrying `source = 'chatbot'` —
 * the far end of the funnel, and the only number here that proves the assistant
 * produced revenue rather than clicks.
 */
export async function getChatStats(): Promise<ChatStats> {
  const db = getDb();

  const [counts] = (await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE started_at >= date_trunc('day', now()))::int AS today,
      COUNT(*) FILTER (WHERE started_at >= now() - interval '7 days')::int AS week,
      COUNT(*) FILTER (WHERE started_at >= date_trunc('month', now()))::int AS month,
      COUNT(*) FILTER (WHERE last_message_at >= now() - interval '15 minutes'
                         AND status = 'active')::int AS active_now,
      COUNT(*) FILTER (WHERE went_to_booking)::int AS went,
      COUNT(*) FILTER (WHERE status = 'handoff')::int AS handoffs,
      COUNT(*) FILTER (WHERE status = 'closed')::int AS ended,
      COUNT(*)::int AS total
    FROM chat_conversations
  `)) as unknown as {
    today: number;
    week: number;
    month: number;
    active_now: number;
    went: number;
    handoffs: number;
    ended: number;
    total: number;
  }[];

  const [leads] = (await db.execute(sql`
    SELECT COUNT(*) FILTER (WHERE status = 'new')::int AS new,
           COUNT(*)::int AS total
    FROM chat_leads
  `)) as unknown as { new: number; total: number }[];

  const [reservations] = (await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM reservations WHERE source = 'chatbot'
  `)) as unknown as { n: number }[];

  const [unanswered] = (await db.execute(sql`
    SELECT COALESCE(SUM(times), 0)::int AS n FROM chat_unanswered
  `)) as unknown as { n: number }[];

  const topCars = (await db.execute(sql`
    SELECT cm.brand || ' ' || cm.model AS name, COUNT(*)::int AS n
    FROM chat_conversations c
    JOIN car_models cm ON cm.id = c.car_model_id
    GROUP BY 1 ORDER BY n DESC LIMIT 5
  `)) as unknown as { name: string; n: number }[];

  const topQuestions = (await db.execute(sql`
    SELECT question, times FROM chat_unanswered
    ORDER BY times DESC, last_asked_at DESC LIMIT 5
  `)) as unknown as { question: string; times: number }[];

  const total = Number(counts?.total ?? 0) || 0;
  const went = Number(counts?.went ?? 0) || 0;

  return {
    today: Number(counts?.today ?? 0) || 0,
    week: Number(counts?.week ?? 0) || 0,
    month: Number(counts?.month ?? 0) || 0,
    activeNow: Number(counts?.active_now ?? 0) || 0,
    leadsNew: Number(leads?.new ?? 0) || 0,
    leadsTotal: Number(leads?.total ?? 0) || 0,
    wentToBooking: went,
    reservationsFromChat: Number(reservations?.n ?? 0) || 0,
    // Null rather than 0% when there is nothing to divide by — "no data yet"
    // and "nobody converts" are different answers.
    conversionPct: total > 0 ? (went / total) * 100 : null,
    unansweredOpen: Number(unanswered?.n ?? 0) || 0,
    handoffs: Number(counts?.handoffs ?? 0) || 0,
    ended: Number(counts?.ended ?? 0) || 0,
    topCars: (Array.isArray(topCars) ? topCars : []).map((r) => ({
      name: r.name,
      n: Number(r.n) || 0,
    })),
    topQuestions: (Array.isArray(topQuestions) ? topQuestions : []).map(
      (r) => ({
        question: r.question,
        times: Number(r.times) || 0,
      }),
    ),
  };
}

/** Most requested date ranges and locations, for the analytics page. */
export async function getChatPreferences() {
  const db = getDb();
  const locations = (await db.execute(sql`
    SELECT pl.name, COUNT(*)::int AS n
    FROM chat_conversations c
    JOIN pickup_locations pl ON pl.id = c.location_id
    GROUP BY 1 ORDER BY n DESC LIMIT 5
  `)) as unknown as { name: string; n: number }[];

  const months = (await db.execute(sql`
    SELECT to_char(date_from, 'YYYY-MM') AS month, COUNT(*)::int AS n
    FROM chat_conversations
    WHERE date_from IS NOT NULL
    GROUP BY 1 ORDER BY n DESC LIMIT 5
  `)) as unknown as { month: string; n: number }[];

  const intents = (await db.execute(sql`
    SELECT topic, COUNT(*)::int AS n
    FROM chat_conversations WHERE topic IS NOT NULL
    GROUP BY 1 ORDER BY n DESC LIMIT 8
  `)) as unknown as { topic: string; n: number }[];

  return {
    locations: (Array.isArray(locations) ? locations : []).map((r) => ({
      name: r.name,
      n: Number(r.n) || 0,
    })),
    months: (Array.isArray(months) ? months : []).map((r) => ({
      month: r.month,
      n: Number(r.n) || 0,
    })),
    intents: (Array.isArray(intents) ? intents : []).map((r) => ({
      topic: r.topic,
      n: Number(r.n) || 0,
    })),
  };
}

/** Conversations started in the last N days, for a simple trend line. */
export async function getChatDaily(days = 14) {
  const rows = (await getDb().execute(sql`
    WITH d AS (
      SELECT generate_series(
        (now() - MAKE_INTERVAL(days => ${days}::int - 1))::date,
        now()::date, interval '1 day'
      )::date AS day
    )
    SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
           COUNT(c.id)::int AS n
    FROM d
    LEFT JOIN chat_conversations c
      ON c.started_at >= d.day AND c.started_at < d.day + 1
    GROUP BY d.day ORDER BY d.day
  `)) as unknown as { day: string; n: number }[];
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    day: r.day,
    n: Number(r.n) || 0,
  }));
}

/** Leads created since a moment — used by the "new lead" admin notification. */
export async function countLeadsSince(since: Date): Promise<number> {
  const [row] = await getDb()
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(schema.chatLeads)
    .where(and(gte(schema.chatLeads.createdAt, since)));
  return Number(row?.n ?? 0) || 0;
}
