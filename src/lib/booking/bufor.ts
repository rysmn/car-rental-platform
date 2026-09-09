import { sql, type SQL } from "drizzle-orm";

/**
 * Bufor między zwrotem auta a kolejnym wydaniem — punkt 18 zamówienia.
 *
 * ## Co było
 *
 * Ograniczenie z `drizzle/0001` pilnowało podwójnego najmu na DNIACH:
 *
 *     EXCLUDE USING gist (car_id WITH =,
 *                         daterange(start_date, end_date, '[]') WITH &&)
 *
 * `'[]'` to przedział domknięty obustronnie — najem kończący się 12-go zajmował
 * cały 12-ty, więc kolejne wydanie było możliwe najwcześniej 13-go. Bufor już
 * istniał i wynosił pełną dobę. Auto zwrócone 12-go o 10:00 stało bezczynnie
 * do rana, mimo że o 13:00 było gotowe.
 *
 * ## Co jest teraz
 *
 * Zajętość liczy funkcja bazodanowa `aa_zajetosc()` (migracja 0045) i to jest
 * JEDYNE miejsce, które o niej rozstrzyga: ta sama funkcja stoi w ograniczeniu
 * EXCLUDE i w każdym zapytaniu o dostępność. Ten plik jest jej jedynym
 * wejściem od strony aplikacji — bo predykat przepisany ośmiokrotnie własnymi
 * słowami rozjeżdża się w dziewiątym miejscu, a rozjeżdża się zawsze ten
 * egzemplarz, na który nikt nie patrzy.
 *
 * ## Godziny, których nie ma
 *
 * `pickup_time` i `return_time` są NULLABLE — rezerwacje sprzed ich
 * wprowadzenia nie mają żadnej. Dla nich zostaje DOKŁADNIE dzisiejsze
 * zachowanie: cała doba zwrotu zajęta, bez bufora. Doliczenie bufora do
 * nieznanej godziny zacieśniłoby regułę wstecz — najem kończący się 12-go
 * zacząłby blokować 13-go do 03:00, choć dziś nie blokuje 13-go wcale.
 * Pierwsza wersja tej funkcji robiła ten błąd i złapał go dopiero prototyp
 * na bazie.
 *
 * ## Dlaczego liczba stoi w dwóch miejscach
 *
 * Funkcja użyta w indeksie GiST musi być IMMUTABLE, więc nie może czytać
 * tabeli ustawień — wartość bufora jest wpisana w definicję ograniczenia.
 * Ta sama liczba stoi tutaj, a `scripts/test-bufor-zwrotu.ts` porównuje jedno
 * z drugim i psuje się, gdy ktoś zmieni tylko jedno.
 *
 * Uwaga na zbieżność liczb: `MIN_WYPRZEDZENIE_H` w `lead-time.ts` też wynosi 3,
 * ale odpowiada na zupełnie inne pytanie — jak długo przed odbiorem wolno
 * ZŁOŻYĆ rezerwację (rozdział 13.5). Te dwie trójki nie mają ze sobą nic
 * wspólnego i wolno je zmieniać niezależnie.
 */
export const BUFOR_ZWROTU_H = 3;

/** Bufor w postaci, w jakiej rozumie go Postgres. */
const BUFOR = sql`interval '${sql.raw(String(BUFOR_ZWROTU_H))} hours'`;

/**
 * Aliasy tabel dopuszczone w zapytaniach.
 *
 * Wchodzą do SQL przez `sql.raw`, więc lista jest zamknięta — nie dlatego, że
 * spodziewamy się tu danych od klienta (to są literały z kodu), ale dlatego,
 * że wolno mi się mylić raz, a nie po cichu.
 */
type Alias = "r" | "a" | "b" | "ab";

function kolumny(alias: Alias): SQL {
  return sql.raw(
    `${alias}.start_date, ${alias}.end_date, ${alias}.pickup_time, ${alias}.return_time`,
  );
}

/**
 * Zajętość auta przez rezerwację o podanym aliasie — łącznie z buforem.
 *
 * Do porównywania z inną zajętością operatorem `&&` (nachodzą na siebie)
 * albo `@>` (zawiera chwilę/przedział).
 */
export function zajetoscRezerwacji(alias: Alias = "r"): SQL {
  return sql`aa_zajetosc(${kolumny(alias)}, ${BUFOR})`;
}

/**
 * Zajętość wynikająca z blokady operatora (serwis, przegląd).
 *
 * Blokady są i zostają DOBOWE — nikt nie wpisuje godziny wyjazdu do warsztatu.
 * Osobna funkcja bazodanowa, żeby porównanie zawsze szło między przedziałami
 * tego samego rodzaju.
 */
export function zajetoscBloku(alias: Alias = "ab"): SQL {
  return sql.raw(`aa_zajetosc_bloku(${alias}.start_date, ${alias}.end_date)`);
}

/**
 * Okres, o który pyta klient — z godzinami, jeżeli są znane.
 *
 * Gdy godzin nie ma (lista floty, kalendarz — klient jeszcze ich nie wybrał),
 * pytamy o CAŁE doby. To jest odpowiedź ostrożniejsza niż reguła, którą
 * zastosuje silnik rezerwacji, i taka ma być: widok wolno, żeby powiedział
 * „nie" tam, gdzie silnik powiedziałby „tak", ale nigdy odwrotnie. Klient,
 * który zobaczył wolny termin i dostał odmowę po wypełnieniu ośmiu pól, to
 * jest ta droga, której ten projekt pilnuje od `createReservation:no-unit-free`.
 */
export function okresPytania(
  startDate: string,
  endDate: string,
  pickupTime?: string | null,
  returnTime?: string | null,
): SQL {
  return sql`aa_zajetosc(${startDate}::date, ${endDate}::date, ${pickupTime ?? null}::time, ${returnTime ?? null}::time, ${BUFOR})`;
}

/** Jedna doba, jako przedział — do pytania „czy auto jest wolne tego dnia". */
export function doba(dzien: SQL): SQL {
  return sql`aa_zajetosc_bloku(${dzien}, ${dzien})`;
}
