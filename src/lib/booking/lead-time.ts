/**
 * Reguła „minimum 3 godziny" — rozdział 13.5.
 *
 * ## Czego dotyczy
 *
 * Rezerwacji nie da się złożyć na termin bliższy niż trzy godziny od chwili
 * jej składania. Chodzi o czas na przygotowanie auta i dojazd człowieka, nie
 * o żaden bufor operacyjny — dlatego jest tu JEDNA liczba, a nie „trzy plus
 * dwa": zamówienie mówi wprost, żeby nie dokładać drugiego bufora bez osobnej
 * zatwierdzonej decyzji.
 *
 * ## Dlaczego strefa czasowa jest wyliczana, a nie brana z serwera
 *
 * Data odbioru to `2026-08-30`, godzina to `14:00` — i jedno, i drugie jest
 * czasem LOKALNYM w Warszawie, bo tam stoi biuro i tam klient odbiera auto.
 * Kontener produkcyjny chodzi natomiast w UTC (sprawdzone 27.08.2026:
 * `date` w kontenerze pokazuje UTC). Gdyby ten plik ufał zegarowi procesu,
 * reguła myliłaby się o godzinę przez pół roku i o dwie przez drugie pół —
 * czyli latem przepuszczałaby rezerwacje na dwie godziny przed odbiorem.
 * Dlatego przesunięcie strefy liczy `Intl`, który zna reguły czasu letniego,
 * a nie odejmowanie stałej.
 *
 * ## Gdzie jest źródło prawdy
 *
 * Na serwerze, w `createReservation`. Formularz pokazuje tę samą regułę
 * z uprzejmości — żeby klient nie wypełniał ośmiu pól po to, by usłyszeć „nie"
 * — ale to nie jest zabezpieczenie i ten plik jest importowany po obu stronach
 * właśnie po to, żeby obie mówiły dokładnie to samo.
 */

/** Minimalne wyprzedzenie w godzinach. */
export const MIN_WYPRZEDZENIE_H = 3;

const STREFA = "Europe/Warsaw";

/** O ile milisekund czas lokalny w Warszawie wyprzedza UTC w danej chwili. */
function przesuniecieWarszawy(chwila: Date): number {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: STREFA,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const cz = Object.fromEntries(
    fmt.formatToParts(chwila).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  // `hour` bywa "24" o północy w niektórych wersjach ICU — normalizujemy.
  const godzina = Number(cz.hour) % 24;
  const jakoUtc = Date.UTC(
    Number(cz.year),
    Number(cz.month) - 1,
    Number(cz.day),
    godzina,
    Number(cz.minute),
    Number(cz.second),
  );
  return jakoUtc - chwila.getTime();
}

/**
 * Chwila (ms UTC) odpowiadająca dacie i godzinie podanej w czasie warszawskim.
 *
 * Dwa przebiegi, nie jeden: pierwszy szacuje przesunięcie w okolicy tej chwili,
 * drugi je poprawia. Ma to znaczenie wyłącznie w dwie noce w roku, kiedy zegar
 * się przestawia — ale to są dokładnie te dwie noce, w które nikt tego nie
 * sprawdzi ręcznie.
 */
export function chwilaWarszawska(dataIso: string, godzinaHhmm: string): number {
  const naiwnie = Date.parse(`${dataIso}T${godzinaHhmm}:00Z`);
  if (Number.isNaN(naiwnie)) return NaN;
  let wynik = naiwnie - przesuniecieWarszawy(new Date(naiwnie));
  wynik = naiwnie - przesuniecieWarszawy(new Date(wynik));
  return wynik;
}

export type WynikWyprzedzenia = {
  ok: boolean;
  /** Ile godzin zostało do odbioru — do komunikatu, zaokrąglone w dół. */
  zostaloH: number;
};

/**
 * Czy odbiór jest dostatecznie daleko.
 *
 * Nieznana data albo nieznana godzina = PRZEPUSZCZAMY. Ta funkcja odpowiada
 * wyłącznie na pytanie o wyprzedzenie; kształt daty pilnuje schemat Zoda, który
 * i tak biegnie wcześniej, a dublowanie tamtej walidacji tutaj kończyłoby się
 * dwoma różnymi komunikatami o tym samym błędzie.
 */
export function sprawdzWyprzedzenie(
  dataOdbioru: string,
  godzinaOdbioru: string,
  teraz: number = Date.now(),
): WynikWyprzedzenia {
  const odbior = chwilaWarszawska(dataOdbioru, godzinaOdbioru);
  if (Number.isNaN(odbior)) return { ok: true, zostaloH: 0 };
  const roznicaH = (odbior - teraz) / 3_600_000;
  return {
    ok: roznicaH >= MIN_WYPRZEDZENIE_H,
    zostaloH: Math.max(0, Math.floor(roznicaH)),
  };
}

/**
 * Najwcześniejszy odbiór, jaki wolno dziś zaproponować — i pierwszy SLOT,
 * który się w nim mieści.
 *
 * ## Po co to istnieje osobno od `sprawdzWyprzedzenie`
 *
 * Tamta funkcja odpowiada na pytanie zamknięte: „czy TA godzina jest
 * dostatecznie daleko". To jest pytanie formularza, w którym klient już coś
 * wybrał. Asystent ma pytanie odwrotne i otwarte — „od kiedy w ogóle można" —
 * a odpowiedzi na nie nie da się wyprowadzić z `true`/`false` bez policzenia
 * tego drugi raz. Policzone drugi raz znaczy: dwie liczby, które kiedyś
 * przestaną się zgadzać.
 *
 * Dlatego obie odpowiedzi wychodzą z tego samego pliku i z tej samej stałej.
 *
 * ## Dlaczego slot, a nie sama chwila
 *
 * Auta wydaje człowiek, w godzinach pracy biura, na siatce półgodzinnej
 * (`handoverSlots`). „Najwcześniej o 15:37" jest prawdziwe i bezużyteczne —
 * o 15:37 nikt nie wyda samochodu. Klient potrzebuje godziny, którą da się
 * wybrać z listy.
 *
 * ZAOKRĄGLANIE IDZIE WYŁĄCZNIE W GÓRĘ. 12:37 + 3 h = 15:37, więc slot 15:30
 * jest ZA WCZESNY i odpada, mimo że różni się o siedem minut. Zamówienie mówi
 * o tym wprost: minimum nie wolno skrócić zaokrągleniem.
 *
 * ## Szuka DALEJ NIŻ DZIŚ, i to jest cała różnica
 *
 * Pierwsza wersja zwracała `null`, gdy próg wypadał po zamknięciu biura.
 * Zgodne z prawdą i bezużyteczne: mówiło „nie dziś", nie mówiąc „więc kiedy",
 * a asystent nie ma z czego wtedy ułożyć zdania. Klient pytający o 18:00
 * dostawał ciszę zamiast „jutro od 08:00".
 *
 * Dlatego funkcja przechodzi kolejne dni aż do pierwszego slotu, który mieści
 * się w progu, i zwraca DATĘ razem z godziną. Dwa dni wystarczają z zapasem:
 * próg to trzy godziny, a biuro pracuje codziennie — trzeci dzień oznaczałby
 * błąd w danych, nie brak terminu, i lepiej wtedy oddać `null` niż szukać
 * w nieskończoność.
 */
export type NajwczesniejszyOdbior = {
  /** Chwila progu w ms UTC — dokładnie `teraz + minimum`, bez zaokrąglania. */
  prog: number;
  /** `HH:MM` progu w czasie warszawskim, do komunikatu „nie wcześniej niż…". */
  progHhmm: string;
  /** Data progu `YYYY-MM-DD` w czasie warszawskim. */
  progData: string;
  /** Pierwszy slot z siatki mieszczący się w progu — `HH:MM`. */
  slot: string | null;
  /** Dzień, którego dotyczy `slot` — bez niego sama godzina jest zagadką. */
  slotData: string | null;
  /** Czy ten slot jest jeszcze DZIŚ (licząc dzień w Warszawie, nie w UTC). */
  slotDzisiaj: boolean;
};

/** `HH:MM` i `YYYY-MM-DD` chwili, w czasie warszawskim. */
function czescWarszawska(chwila: number): { data: string; godzina: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: STREFA,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const cz = Object.fromEntries(
    fmt.formatToParts(new Date(chwila)).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const godzina = String(Number(cz.hour) % 24).padStart(2, "0");
  return {
    data: `${cz.year}-${cz.month}-${cz.day}`,
    godzina: `${godzina}:${cz.minute}`,
  };
}

export function najwczesniejszyOdbior(
  sloty: readonly string[],
  teraz: number = Date.now(),
): NajwczesniejszyOdbior {
  const prog = teraz + MIN_WYPRZEDZENIE_H * 3_600_000;
  const { data: progData, godzina: progHhmm } = czescWarszawska(prog);
  const dzisiaj = czescWarszawska(teraz).data;

  /*
    Slot musi być NIE WCZEŚNIEJSZY niż próg — porównanie na CHWILACH, nie na
    napisach. Napisy wystarczyłyby w obrębie jednego dnia, ale przy progu po
    północy „01:30" < „22:30" jako tekst, a jako chwila jest później. Nocna
    zmiana czasu psuje to samo porównanie po raz drugi.
  */
  for (let krok = 0; krok < 3; krok++) {
    const dzien = przesunDzien(progData, krok);
    for (const s of sloty) {
      const chwila = chwilaWarszawska(dzien, s);
      if (!Number.isNaN(chwila) && chwila >= prog) {
        return {
          prog,
          progHhmm,
          progData,
          slot: s,
          slotData: dzien,
          slotDzisiaj: dzien === dzisiaj,
        };
      }
    }
  }

  return {
    prog,
    progHhmm,
    progData,
    slot: null,
    slotData: null,
    slotDzisiaj: false,
  };
}

/**
 * `YYYY-MM-DD` przesunięte o `ile` dni.
 *
 * Liczone w UTC celowo: to jest arytmetyka na etykiecie kalendarzowej, a nie
 * na chwili. Dodanie doby do chwili w strefie z czasem letnim potrafi dać ten
 * sam dzień albo przeskoczyć dwa — a tutaj chodzi tylko o „następna kartka
 * z kalendarza".
 */
function przesunDzien(iso: string, ile: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + ile);
  return d.toISOString().slice(0, 10);
}
