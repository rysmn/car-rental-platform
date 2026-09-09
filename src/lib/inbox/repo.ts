import "server-only";
import { and, desc, eq, ilike, isNull, notInArray, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { leadReason, leadStatus, requestSource } from "@/lib/db/schema";
import type { LeadReason, LeadStatus, RequestSource } from "@/lib/db/schema";
import { SETTLED_STATUSES } from "./labels";

/**
 * Skrzynka zapytań klientów.
 *
 * TRZY RZECZY, KTÓRYCH NIE WOLNO ZE SOBĄ MIESZAĆ, i to jest cały powód
 * istnienia tego pliku:
 *
 *   REZERWACJE  — zamówienie, które klient już złożył. Obsługa operacyjna,
 *                 własny moduł, własne statusy. Rezerwacja NIE jest zapytaniem
 *                 i nie trafia tutaj.
 *   SKRZYNKA    — pytanie, które czeka na CZŁOWIEKA: prośba o kontakt z czatu,
 *                 zapytanie firmowe, formularz kontaktowy, pytanie o konkretne
 *                 auto, pytanie do istniejącej rezerwacji.
 *   ALERTY      — awaria techniczna. 500, nieudany zapis, padnięta poczta.
 *
 * Zapytanie klienta nie jest awarią systemu. Do sierpnia 2026 panel miał
 * licznik tylko dla alertów, więc jedyne miejsce z odznaką mówiło operatorowi
 * o rzeczach zepsutych, a o klientach czekających na odpowiedź — nic.
 *
 * DLACZEGO TO SIEDZI NA `chat_leads`, A NIE NA NOWEJ TABELI. Ta tabela ma już
 * dokładnie kształt zgłoszenia: kontakt, auto, terminy, miejsce, liczba osób,
 * budżet, język, pytanie klienta, zgoda, status i notatka obsługi. Do pełnej
 * skrzynki brakowało jej czterech kolumn (`source`, `read_at`, `subject`,
 * `reservation_id`) — a nie drugiego systemu obok, który trzeba by scalać
 * przy każdym odczycie i który rozjechałby się przy pierwszej rozbieżności.
 *
 * Nazwa `chat_leads` została świadomie: przemianowanie żywej tabeli z kluczami
 * obcymi i historią migracji kosztuje więcej ryzyka, niż jest warte, a komentarz
 * tłumaczy to raz na zawsze.
 */

/** Ile zgłoszeń pokazujemy bez stronicowania. */
const LIMIT = 200;

/**
 * Filtry przychodzą z adresu URL, czyli od kogokolwiek.
 *
 * Dlatego są tu ENUMAMI, nie napisami, a wejście przepuszczamy przez
 * `parseInboxFilter` — który nieznaną wartość po prostu POMIJA, zamiast
 * wkładać ją do zapytania. Napis w kolumnie enumowej i tak wywróciłby
 * zapytanie błędem 500, czyli literówka w adresie robiłaby awarię panelu.
 */
export type InboxFilter = {
  status?: LeadStatus | null;
  source?: RequestSource | null;
  /** Czego zapytanie dotyczy — druga oś, patrz `leadReason`. */
  reason?: LeadReason | null;
  /** Tylko nieprzeczytane. */
  unread?: boolean;
  /** Szukanie po nazwisku, telefonie, e-mailu i temacie. */
  q?: string | null;
};

/** Czyta filtry z adresu, milcząco pomijając wartości spoza słownika. */
export function parseInboxFilter(sp: {
  status?: string;
  source?: string;
  reason?: string;
  unread?: string;
  q?: string;
}): InboxFilter {
  const status = leadStatus.enumValues.find((v) => v === sp.status) ?? null;
  const source = requestSource.enumValues.find((v) => v === sp.source) ?? null;
  const reason = leadReason.enumValues.find((v) => v === sp.reason) ?? null;
  return {
    status,
    source,
    reason,
    unread: sp.unread === "1",
    q: sp.q?.trim().slice(0, 80) || null,
  };
}

export async function listInbox(filter: InboxFilter = {}, limit = LIMIT) {
  const where = [];
  if (filter.status) where.push(eq(schema.chatLeads.status, filter.status));
  if (filter.source) where.push(eq(schema.chatLeads.source, filter.source));
  if (filter.reason) where.push(eq(schema.chatLeads.reason, filter.reason));
  if (filter.unread) where.push(isNull(schema.chatLeads.readAt));
  if (filter.q) {
    /*
     * Szukanie po tym, czym operator dysponuje, gdy klient oddzwania: nazwisko
     * albo numer, z którego dzwoni. Numery bywają zapisane z odstępami
     * i z prefiksem, więc porównujemy je BEZ znaków nieliczbowych po obu
     * stronach — inaczej „600 781 995" nie znajduje „600781995", co jest
     * dokładnie tym przypadkiem, w którym szukanie jest potrzebne.
     */
    const like = `%${filter.q}%`;
    const digits = filter.q.replace(/\D/g, "");
    const conds = [
      ilike(schema.chatLeads.name, like),
      ilike(schema.chatLeads.email, like),
      ilike(schema.chatLeads.subject, like),
      ilike(schema.chatLeads.question, like),
    ];
    if (digits.length >= 3) {
      conds.push(
        sql`regexp_replace(coalesce(${schema.chatLeads.phone}, ''), '\\D', '', 'g') like ${`%${digits}%`}`,
      );
    }
    where.push(or(...conds));
  }

  return getDb()
    .select({
      id: schema.chatLeads.id,
      name: schema.chatLeads.name,
      phone: schema.chatLeads.phone,
      email: schema.chatLeads.email,
      subject: schema.chatLeads.subject,
      question: schema.chatLeads.question,
      dateFrom: schema.chatLeads.dateFrom,
      dateTo: schema.chatLeads.dateTo,
      seats: schema.chatLeads.seats,
      budgetGrosze: schema.chatLeads.budgetGrosze,
      budgetMinGrosze: schema.chatLeads.budgetMinGrosze,
      budgetKind: schema.chatLeads.budgetKind,
      budgetCurrency: schema.chatLeads.budgetCurrency,
      budgetPlnPerEur: schema.chatLeads.budgetPlnPerEur,
      leadLocale: schema.chatLeads.locale,
      status: schema.chatLeads.status,
      source: schema.chatLeads.source,
      reason: schema.chatLeads.reason,
      company: schema.chatLeads.company,
      partnerModel: schema.chatLeads.partnerModel,
      investRange: schema.chatLeads.investRange,
      readAt: schema.chatLeads.readAt,
      note: schema.chatLeads.note,
      createdAt: schema.chatLeads.createdAt,
      conversationId: schema.chatLeads.conversationId,
      reservationId: schema.chatLeads.reservationId,
      reservationRef: schema.reservations.reference,
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
    .leftJoin(
      schema.reservations,
      eq(schema.reservations.id, schema.chatLeads.reservationId),
    )
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(schema.chatLeads.createdAt))
    .limit(limit);
}

export type InboxRow = Awaited<ReturnType<typeof listInbox>>[number];

/**
 * Ile spraw czeka — liczba na odznace w nagłówku panelu.
 *
 * Liczy NIEPRZECZYTANE, nie „o statusie `new`". To nie jest ta sama rzecz:
 * status opisuje, jak daleko zaszła obsługa sprawy, a `read_at` — czy ktoś
 * ją w ogóle otworzył. Gdyby odznaka liczyła status, operator musiałby
 * przestawiać status tylko po to, żeby zgasić licznik, i statusy przestałyby
 * cokolwiek znaczyć w ciągu tygodnia.
 *
 * Sprawy ZAŁATWIONE są wyłączone nawet gdy nikt ich nie otworzył — zamknięcie
 * jest decyzją mocniejszą niż przeczytanie, a spam nigdy nie był sprawą.
 * Lista tych statusów jest jedna, w `labels`, bo ten sam warunek zadaje
 * licznik, wyszukiwanie duplikatu przy zapisie i domyślny widok listy.
 */
export async function countUnread(): Promise<number> {
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.chatLeads)
    .where(
      and(
        isNull(schema.chatLeads.readAt),
        notInArray(schema.chatLeads.status, [...SETTLED_STATUSES]),
      ),
    );
  return row?.n ?? 0;
}

/**
 * Oznacz jako przeczytane. Idempotentne i JEDNOKIERUNKOWE.
 *
 * Pierwsze otwarcie zapisuje chwilę; kolejne nie przesuwają jej, bo pytanie
 * brzmi „czy ktoś to widział", a nie „kiedy ostatnio zaglądał". Dzięki temu
 * `read_at` mówi, ile sprawa czekała, zanim ktokolwiek na nią spojrzał.
 */
export async function markRead(id: string): Promise<void> {
  await getDb()
    .update(schema.chatLeads)
    .set({ readAt: new Date() })
    .where(and(eq(schema.chatLeads.id, id), isNull(schema.chatLeads.readAt)));
}

/** Rozkład do filtrów — ile jest czego, bez drugiego zapytania na każdy kafel. */
export async function inboxCounts() {
  const rows = await getDb()
    .select({
      source: schema.chatLeads.source,
      status: schema.chatLeads.status,
      reason: schema.chatLeads.reason,
      unread: sql<number>`count(*) filter (where ${schema.chatLeads.readAt} is null)::int`,
      total: sql<number>`count(*)::int`,
    })
    .from(schema.chatLeads)
    .groupBy(
      schema.chatLeads.source,
      schema.chatLeads.status,
      schema.chatLeads.reason,
    );
  return rows;
}

/**
 * Ile REZERWACJI czeka na potwierdzenie — trzecia liczba w nagłówku panelu.
 *
 * Mieszka w tym pliku, mimo że nie dotyczy skrzynki, i to jest celowe: cały
 * powód istnienia tego modułu brzmi „nie mieszać rezerwacji, zapytań i awarii",
 * a rozdzielenie tych trzech liczników jest tą samą decyzją zapisaną raz.
 * Sama liczba nie ma nic wspólnego z `chat_leads` i niczego stamtąd nie czyta.
 *
 * `pending` znaczy: klient złożył zamówienie, a nikt go jeszcze nie potwierdził.
 * Świadomie NIE liczymy `confirmed` — te są załatwione i wiszenie ich w odznace
 * nauczyłoby operatora ignorować odznakę w tydzień.
 */
export async function countPendingReservations(): Promise<number> {
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.reservations)
    .where(eq(schema.reservations.status, "pending"));
  return row?.n ?? 0;
}

/**
 * Pełna rozmowa stojąca za zgłoszeniem — ładowana NA ŻĄDANIE.
 *
 * Nie wchodzi do listy razem z resztą i to jest celowe. Transkrypt potrafi
 * mieć czterdzieści wiadomości; dwieście spraw na liście oznaczałoby osiem
 * tysięcy wierszy pobranych po to, żeby operator otworzył jedną. Panel
 * używany z telefonu przy aucie przestałby się otwierać.
 *
 * Przechodzi przez `chat_leads`, a nie wprost po `conversationId` z adresu:
 * pytanie brzmi „pokaż rozmowę TEGO zgłoszenia", więc identyfikator rozmowy
 * bierzemy z bazy, a nie od tego, kto pyta.
 */
export async function transcriptForLead(leadId: string) {
  const db = getDb();
  const [lead] = await db
    .select({ conversationId: schema.chatLeads.conversationId })
    .from(schema.chatLeads)
    .where(eq(schema.chatLeads.id, leadId))
    .limit(1);

  if (!lead?.conversationId) return [];

  return db
    .select({
      id: schema.chatMessages.id,
      role: schema.chatMessages.role,
      body: schema.chatMessages.body,
      createdAt: schema.chatMessages.createdAt,
    })
    .from(schema.chatMessages)
    .where(eq(schema.chatMessages.conversationId, lead.conversationId))
    .orderBy(schema.chatMessages.createdAt)
    .limit(200);
}
