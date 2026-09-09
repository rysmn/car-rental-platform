import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

/**
 * Katalog dokumentów — odczyt i reguły wersjonowania (punkty 15 i 16).
 *
 * Wszystko, co wie o tym, czym jest „aktualna wersja", stoi tutaj. Panel
 * i strona klienta pytają, ale nie rozstrzygają — inaczej dwa ekrany
 * odpowiadałyby na to samo pytanie inaczej.
 */

// Kategorie mieszkają w `kategorie.ts` (bez `server-only`), bo zna je także
// formularz w przeglądarce. Tu tylko przechodzą dalej, żeby serwer miał jedno
// wejście do katalogu dokumentów.
export { KATEGORIE, ETYKIETY_KATEGORII, type Kategoria } from "./kategorie";
import type { Kategoria } from "./kategorie";

export type WersjaDokumentu = {
  id: string;
  slug: string;
  locale: string;
  version: number;
  category: string;
  title: string;
  description: string | null;
  fileName: string;
  fileSize: number;
  effectiveFrom: string | null;
  active: boolean;
  autoSend: boolean;
  /** Plik zawiera obie wersje językowe, więc obsługuje klienta PL i EN. */
  bilingual: boolean;
  createdAt: Date;
};

const POLA = {
  id: schema.documents.id,
  slug: schema.documents.slug,
  locale: schema.documents.locale,
  version: schema.documents.version,
  category: schema.documents.category,
  title: schema.documents.title,
  description: schema.documents.description,
  fileName: schema.documents.fileName,
  fileSize: schema.documents.fileSize,
  effectiveFrom: schema.documents.effectiveFrom,
  active: schema.documents.active,
  autoSend: schema.documents.autoSend,
  bilingual: schema.documents.bilingual,
  createdAt: schema.documents.createdAt,
};

/** Wszystkie wersje wszystkich dokumentów — widok katalogu w panelu. */
export async function listaWersji(): Promise<WersjaDokumentu[]> {
  return getDb()
    .select(POLA)
    .from(schema.documents)
    .orderBy(
      asc(schema.documents.category),
      asc(schema.documents.slug),
      asc(schema.documents.locale),
      desc(schema.documents.version),
    );
}

/** Historia jednego dokumentu w jednym języku — od najnowszej wersji. */
export async function historia(
  slug: string,
  locale: string,
): Promise<WersjaDokumentu[]> {
  return getDb()
    .select(POLA)
    .from(schema.documents)
    .where(
      and(eq(schema.documents.slug, slug), eq(schema.documents.locale, locale)),
    )
    .orderBy(desc(schema.documents.version));
}

/** Jedna wersja po identyfikatorze — do podglądu i pobrania. */
export async function wersja(id: string): Promise<WersjaDokumentu | null> {
  const [w] = await getDb()
    .select(POLA)
    .from(schema.documents)
    .where(eq(schema.documents.id, id))
    .limit(1);
  return w ?? null;
}

/**
 * Numer, jaki dostanie NASTĘPNA wersja tego dokumentu.
 *
 * Liczony z bazy, nie z długości listy w przeglądarce: dwa okna panelu otwarte
 * naraz dałyby dwie „wersje 3", a częściowy indeks unikalny odrzuciłby drugą
 * dopiero przy zapisie — z komunikatem, którego nikt by nie zrozumiał.
 */
export async function nastepnaWersja(
  slug: string,
  locale: string,
): Promise<number> {
  const [row] = await getDb()
    .select({
      n: sql<number>`coalesce(max(${schema.documents.version}), 0)::int`,
    })
    .from(schema.documents)
    .where(
      and(eq(schema.documents.slug, slug), eq(schema.documents.locale, locale)),
    );
  return (row?.n ?? 0) + 1;
}

/**
 * Dokumenty obowiązujące DZIŚ dla danego języka i kategorii.
 *
 * `active` plus `effective_from` w przeszłości albo puste. Dokument z datą
 * przyszłą jest już wgrany i już zatwierdzony, ale jeszcze nie obowiązuje —
 * i klient nie ma prawa go dostać, bo dostałby warunki, które nie są warunkami
 * jego najmu.
 */
export async function obowiazujace(
  locale: string,
  kategoria?: Kategoria,
): Promise<WersjaDokumentu[]> {
  const warunki = [
    eq(schema.documents.active, true),
    dostepneWJezyku(locale),
    sql`(${schema.documents.effectiveFrom} IS NULL OR ${schema.documents.effectiveFrom} <= CURRENT_DATE)`,
  ];
  if (kategoria) warunki.push(eq(schema.documents.category, kategoria));
  return getDb()
    .select(POLA)
    .from(schema.documents)
    .where(and(...warunki))
    .orderBy(asc(schema.documents.title));
}

/**
 * Czy dokument obsługuje klienta mówiącego w tym języku.
 *
 * Własna wersja językowa ALBO plik dwujęzyczny, który zawiera obie. Trzeciej
 * możliwości tu nie ma i celowo nie ma: brak wersji EN kończy się tym, że
 * klient nie dostaje dokumentu, a nie tym, że dostaje polski. Dokument prawny
 * w języku, którego adresat nie zna, jest gorszy niż jego brak — brak widać.
 */
function dostepneWJezyku(locale: string) {
  return sql`(${schema.documents.locale} = ${locale} OR ${schema.documents.bilingual})`;
}

/**
 * Dokumenty, które mają pójść do klienta po potwierdzeniu rezerwacji.
 *
 * ## Dlaczego to nie jest `obowiazujace(locale, "booking")`
 *
 * Bo tak było do 30.08.2026 i właśnie to nie działało. Kategoria opisuje, O CZYM
 * jest dokument — RODO to `privacy`, ogólne warunki to `terms` — i nigdy nie
 * miała znaczyć „do wysyłki". Użyta jako kryterium wysyłki milcząco odcinała
 * pięć dokumentów, którym właściciel włączył AUTO-SEND: przełącznik był
 * włączony nad mechanizmem, który go nie czytał.
 *
 * Kryterium jest teraz jedno i nazywa się dokładnie tak, jak brzmi decyzja:
 * dokument AKTYWNY, OBOWIĄZUJĄCY dziś, DOSTĘPNY w języku klienta i z włączonym
 * AUTO-SEND. Cztery warunki, wszystkie po stronie danych, wszystkie widoczne
 * w panelu. Żaden nie jest zaszyty w kodzie, więc żaden nie może się rozjechać
 * z tym, co właściciel widzi na ekranie.
 */
export async function doWysylkiPoRezerwacji(
  locale: string,
): Promise<WersjaDokumentu[]> {
  return getDb()
    .select(POLA)
    .from(schema.documents)
    .where(
      and(
        eq(schema.documents.active, true),
        eq(schema.documents.autoSend, true),
        dostepneWJezyku(locale),
        sql`(${schema.documents.effectiveFrom} IS NULL OR ${schema.documents.effectiveFrom} <= CURRENT_DATE)`,
      ),
    )
    .orderBy(asc(schema.documents.title));
}

/** Dokumenty udostępnione konkretnej rezerwacji — z chwilą udostępnienia. */
export async function dokumentyRezerwacji(
  reservationId: string,
): Promise<(WersjaDokumentu & { sharedAt: Date })[]> {
  const rows = await getDb()
    .select({ ...POLA, sharedAt: schema.reservationDocuments.sharedAt })
    .from(schema.reservationDocuments)
    .innerJoin(
      schema.documents,
      eq(schema.documents.id, schema.reservationDocuments.documentId),
    )
    .where(eq(schema.reservationDocuments.reservationId, reservationId))
    .orderBy(asc(schema.documents.title));
  return rows;
}

/**
 * Przypnij rezerwacji komplet dokumentów obowiązujących w TEJ chwili.
 *
 * Wołane raz — przy potwierdzeniu rezerwacji. To jest moment, w którym warunki
 * przestają być ruchome: od tej pory klient ma prawo do wersji, którą wtedy
 * dostał, także wtedy, gdy regulamin zmieni się nazajutrz.
 *
 * `onConflictDoNothing`: powtórne wywołanie (obsługa cofnęła i potwierdziła
 * ponownie) nie ma prawa ani zdublować wpisu, ani PODMIENIĆ już przypiętej
 * wersji na nowszą. Pierwsze przypięcie jest tym, które obowiązuje.
 */
export async function przypnijDokumenty(
  reservationId: string,
  locale: string,
): Promise<number> {
  const komplet = await doWysylkiPoRezerwacji(locale);
  if (komplet.length === 0) return 0;
  await getDb()
    .insert(schema.reservationDocuments)
    .values(komplet.map((d) => ({ reservationId, documentId: d.id })))
    .onConflictDoNothing();
  return komplet.length;
}

/**
 * Dokumenty rezerwacji ze STANEM WYSYŁKI — dla karty rezerwacji w panelu.
 *
 * Osobno od `dokumentyRezerwacji`, bo odpowiada na inne pytanie. Tamta mówi
 * „co klient ma prawo zobaczyć"; ta mówi „co do niego naprawdę poszło".
 * Właściciel zgłosił problem dokładnie dlatego, że tych dwóch rzeczy nie dało
 * się odróżnić: dokument był przypięty, więc wyglądał na wysłany.
 */
export type StanDokumentu = WersjaDokumentu & {
  sharedAt: Date;
  sentAt: Date | null;
  sendError: string | null;
  sendAttempts: number;
  /** Jedno słowo dla panelu — policzone tu, żeby widok nie zgadywał. */
  stan: "sent" | "failed" | "not_sent";
};

export async function stanDokumentowRezerwacji(
  reservationId: string,
): Promise<StanDokumentu[]> {
  const rows = await getDb()
    .select({
      ...POLA,
      sharedAt: schema.reservationDocuments.sharedAt,
      sentAt: schema.reservationDocuments.sentAt,
      sendError: schema.reservationDocuments.sendError,
      sendAttempts: schema.reservationDocuments.sendAttempts,
    })
    .from(schema.reservationDocuments)
    .innerJoin(
      schema.documents,
      eq(schema.documents.id, schema.reservationDocuments.documentId),
    )
    .where(eq(schema.reservationDocuments.reservationId, reservationId))
    .orderBy(asc(schema.documents.title));

  return rows.map((r) => ({
    ...r,
    /*
      SENT znaczy „poczta przyjęła wiadomość", nie „funkcja została zawołana".
      FAILED to próba, która się nie powiodła. NOT_SENT to dokument, którego
      nigdy nie próbowano wysłać — najczęściej dlatego, że ma wyłączony automat.
    */
    stan: r.sentAt ? "sent" : r.sendAttempts > 0 ? "failed" : "not_sent",
  }));
}
