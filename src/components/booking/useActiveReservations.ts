"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSyncExternalStore } from "react";
import { lookupReservations } from "@/lib/booking/lookup";
import {
  getMyReservationRefs,
  getMyReservationRefsOnServer,
  rereadMyReservations,
  subscribeMyReservations,
  UNKNOWN_REFS,
} from "@/lib/booking/my-reservations";

/**
 * Ile spraw klient ma W TOKU — jedno źródło dla paska na telefonie i dla
 * odnośnika w pasku desktopowym.
 *
 * ## Dlaczego to powstało jako osobny moduł
 *
 * Pierwsza wersja liczyła to wewnątrz `MyReservationBadge` i miała trzy wady,
 * które na prawdziwym telefonie kończyły się tak samo — paska nie widać:
 *
 *  1. **Błąd sieci gasił pasek na dobre.** `catch` ustawiał zero, więc jedno
 *     nieudane zapytanie w windzie albo w tunelu chowało pasek aż do zmiany
 *     zbioru numerów. Telefon traci łączność wielokrotnie w ciągu minuty i to
 *     jest normalny stan, a nie awaria.
 *  2. **Nic nie odświeżało liczby.** Zapytanie szło raz, przy zmianie zbioru
 *     numerów. Rezerwacja anulowana przez biuro albo potwierdzona z `pending`
 *     na `confirmed` nie ruszała paska aż do przeładowania strony — a zlecenie
 *     wymaga, żeby licznik się zaktualizował.
 *  3. **Powrót „wstecz" na iPhonie nic nie sprawdzał.** Safari przywraca stronę
 *     z bfcache razem ze stanem Reacta: żaden efekt się nie uruchamia, więc
 *     pasek pokazywał to, co pół godziny wcześniej.
 *
 * ## Zasada: najpierw pokaż, potem uściślij
 *
 * Numery rezerwacji leżą w tej przeglądarce i są znane natychmiast. Serwer jest
 * potrzebny tylko po to, żeby odsiać sprawy zamknięte. Więc dopóki serwer nie
 * odpowie, liczymy z pamięci przeglądarki (`optimistic`) i pasek zapala się
 * w tej samej chwili, w której klient kończy rezerwację — bez czekania na
 * rundę do serwera i bez odświeżania strony. Kiedy odpowiedź przyjdzie,
 * liczba się uściśla, zwykle na tę samą.
 *
 * Cena tej decyzji: przez pierwszą sekundę po wejściu na stronę klient ze
 * starą, zakończoną rezerwacją może zobaczyć pasek, który zaraz zniknie.
 * Odwrotny błąd — brak paska u kogoś, kto ma sprawę w toku — jest gorszy,
 * bo to właśnie on był zgłoszony.
 */

/** Statusy, które znaczą „sprawa w toku". Zamknięte zostają na liście
 *  „Moje rezerwacje", ale nie zapalają paska.
 *
 *  `pending_verification` jest tu celowo: klient, który wysłał formularz i nie
 *  kliknął jeszcze w link z maila, MA sprawę w toku i musi widzieć drogę do
 *  niej — to jest jedyne miejsce, w którym znajdzie przypomnienie, jeżeli mail
 *  wpadł do spamu. */
const AKTYWNE_STATUSY = new Set([
  "pending_verification",
  "pending",
  "confirmed",
]);

/** Odstęp między samoczynnymi sprawdzeniami, gdy karta jest widoczna.
 *  Sześćdziesiąt sekund: dość rzadko, żeby nie budzić radia telefonu bez
 *  powodu, dość często, żeby anulowanie zauważyć w trakcie jednej wizyty. */
const ODSTEP_MS = 60_000;

export type AktywneRezerwacje = {
  /** `null` = jeszcze nie wiadomo (render serwera i pierwsza chwila hydratacji). */
  liczba: number | null;
  /** Czy to jeszcze szacunek z przeglądarki, czy już odpowiedź serwera. */
  szacunek: boolean;
  /** Numer jedynej aktywnej sprawy — pozwala prowadzić prosto do niej. */
  jedynyNumer: string | null;
};

export function useActiveReservations(): AktywneRezerwacje {
  const refs = useSyncExternalStore(
    subscribeMyReservations,
    getMyReservationRefs,
    getMyReservationRefsOnServer,
  );

  /*
    Odpowiedź serwera. Trzymamy DWA zbiory, nie jeden: o co pytaliśmy i co
    wróciło jako sprawa w toku. Bez „o co pytaliśmy" numer dopisany sekundę po
    ostatniej odpowiedzi wyglądałby jak numer odrzucony przez serwer i licznik
    cofałby się na moment tuż po rezerwacji — czyli w jedynej chwili, w której
    ten pasek naprawdę musi być na ekranie.
  */
  const [zSerwera, setZSerwera] = useState<{
    pytane: string[];
    aktywne: string[];
  } | null>(null);
  const trwa = useRef(false);

  const nieznane = refs === UNKNOWN_REFS;
  const key = refs.join(",");

  const sprawdz = useCallback(async () => {
    if (typeof window === "undefined") return;
    // Pytanie z pustym zbiorem numerów jest bezcelowe — serwer i tak zwróci
    // pustą listę, a na telefonie to jest niepotrzebne wybudzenie radia.
    const teraz = getMyReservationRefs();
    // Pusty zbiór numerów rozstrzygamy BEZ pytania i bez ustawiania stanu:
    // filtr na dole i tak da zero, a wybudzanie radia telefonu po odpowiedź,
    // którą znamy z góry, jest czystą stratą.
    if (teraz.length === 0) return;
    if (trwa.current) return;
    trwa.current = true;
    try {
      const rows = await lookupReservations(teraz);
      setZSerwera({
        pytane: teraz,
        aktywne: rows
          .filter((r) => AKTYWNE_STATUSY.has(r.status))
          .map((r) => r.reference),
      });
    } catch {
      /*
        Świadomie NIC. Poprzednia znana odpowiedź zostaje, a przy jej braku
        pasek dalej stoi na szacunku z przeglądarki. Zgaszenie paska przy
        błędzie sieci było oryginalną usterką — telefon rozłącza się sam
        z siebie i to nie znaczy, że klient stracił rezerwację.
      */
    } finally {
      trwa.current = false;
    }
  }, []);

  /*
    Zmiana zbioru numerów — nowa rezerwacja albo usunięcie z listy.

    Zapytanie jest tu rozpisane łańcuchem, a nie wywołaniem `sprawdz()`, i to
    jest celowe: `sprawdz` ustawia stan, a reguła `react-hooks/set-state-in-
    effect` słusznie zabrania wołać takiej funkcji wprost z ciała efektu.
    Łańcuch `then` ustawia stan dopiero po odpowiedzi serwera, czyli nigdy
    w tym samym przebiegu renderowania. Obsługa zdarzeń niżej może wołać
    `sprawdz` bez tej ostrożności — tam nie ma żadnego przebiegu renderowania,
    w który dałoby się wejść.
  */
  useEffect(() => {
    if (nieznane) return;
    const teraz = getMyReservationRefs();
    if (teraz.length === 0) return;
    let porzucone = false;
    lookupReservations(teraz)
      .then((rows) => {
        if (porzucone) return;
        setZSerwera({
          pytane: teraz,
          aktywne: rows
            .filter((r) => AKTYWNE_STATUSY.has(r.status))
            .map((r) => r.reference),
        });
      })
      .catch(() => {
        /* patrz `sprawdz`: błąd sieci nie gasi paska */
      });
    return () => {
      porzucone = true;
    };
    // `key` zastępuje tożsamość tablicy — `refs` jest nową tablicą tylko przy
    // zmianie magazynu, ale tak intencja jest widoczna.
  }, [key, nieznane]);

  /*
    Sprawdzenie przy każdym powrocie do strony. Trzy zdarzenia, bo trzy różne
    drogi powrotu i żadna nie pokrywa pozostałych:

      • `pageshow` z `persisted` — Safari na iPhonie przywraca stronę z bfcache
        po geście „wstecz". Nie ma wtedy ani nowego montowania, ani `focus`.
      • `visibilitychange` — przełączenie kart albo powrót z tła po odblokowaniu
        telefonu. To jest najczęstsza droga na urządzeniu mobilnym.
      • `focus` — powrót z innego okna na komputerze.

    Przy okazji `pageshow` czytamy magazyn od nowa: strona z bfcache mogła
    zostać zamrożona, zanim inna karta dopisała tam rezerwację.
  */
  useEffect(() => {
    const przyPokazaniu = (e: PageTransitionEvent) => {
      if (e.persisted) rereadMyReservations();
      void sprawdz();
    };
    const przyWidocznosci = () => {
      if (document.visibilityState === "visible") void sprawdz();
    };
    window.addEventListener("pageshow", przyPokazaniu);
    document.addEventListener("visibilitychange", przyWidocznosci);
    window.addEventListener("focus", przyWidocznosci);
    return () => {
      window.removeEventListener("pageshow", przyPokazaniu);
      document.removeEventListener("visibilitychange", przyWidocznosci);
      window.removeEventListener("focus", przyWidocznosci);
    };
  }, [sprawdz]);

  // Powolne odpytywanie, wyłącznie gdy karta jest na wierzchu. W tle
  // przeglądarki i tak dławią czasomierze, a na telefonie kosztuje to baterię.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void sprawdz();
    }, ODSTEP_MS);
    return () => clearInterval(id);
  }, [sprawdz]);

  if (nieznane) return { liczba: null, szacunek: true, jedynyNumer: null };

  // Serwer jest źródłem prawdy, ale tylko o numerach, które zna. Numer
  // dopisany przed chwilą, a jeszcze nie sprawdzony, liczy się jako w toku —
  // inaczej pasek gasłby na moment tuż po rezerwacji, czyli dokładnie wtedy,
  // kiedy jest najbardziej potrzebny.
  if (zSerwera === null) {
    return {
      liczba: refs.length,
      szacunek: true,
      jedynyNumer: refs.length === 1 ? refs[0] : null,
    };
  }

  const pytane = new Set(zSerwera.pytane);
  const potwierdzone = new Set(zSerwera.aktywne);
  const aktywne = refs.filter(
    (r) => potwierdzone.has(r) || !pytane.has(r), // niepytany = jeszcze niesprawdzony
  );
  return {
    liczba: aktywne.length,
    szacunek: aktywne.some((r) => !pytane.has(r)),
    jedynyNumer: aktywne.length === 1 ? aktywne[0] : null,
  };
}
