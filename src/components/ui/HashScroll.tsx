"use client";

import { useEffect } from "react";

/**
 * Dowozi klienta do kotwicy, kiedy przeglądarka sama tego nie dowozi.
 *
 * ## Co dokładnie się psuło
 *
 * Zmierzone 04.09.2026 na kopii, Chromium 1280 × 900, przejście
 * `/fleet` → „ZAREZERWUJ" → `/fleet/tesla-model-s#rezerwacja`:
 *
 * ```
 *  t=1443 ms   przeglądarka przewija na y=1255, wysokość dokumentu 4561,
 *              #rezerwacja NIE ISTNIEJE jeszcze w drzewie
 *  t=1859 ms   dokument osiada na 4186 (−375 px), #rezerwacja pojawia się
 *              na pozycji 898 — czyli 357 px NAD krawędzią ekranu
 * ```
 *
 * Skok do kotwicy przy przejściu po stronie przeglądarki wypada więc ZANIM
 * element istnieje, a druga próba już nie następuje. Klient klikał
 * „ZAREZERWUJ" i lądował w środku strony, z górą formularza uciętą nad
 * ekranem. Wejście z zewnątrz (pełne wczytanie tego samego adresu z `#`)
 * działało poprawnie od zawsze — dlatego usterka nie rzucała się w oczy
 * przy ręcznym sprawdzaniu.
 *
 * ## Dlaczego pętla po klatkach, a nie jedno `scrollIntoView`
 *
 * Jedno przewinięcie po zamontowaniu trafiłoby w ten sam moment, co
 * przeglądarka — element bywa wtedy dopiero na chwilę przed pojawieniem się,
 * a zdjęcia galerii układają stronę jeszcze przez kilkaset milisekund.
 * Dlatego komponent SPRAWDZA, czy element stoi tam, gdzie powinien, i poprawia
 * dopóki strona się rusza — najwyżej przez `LIMIT_MS`, po czym milknie
 * na dobre.
 *
 * ## Czego nie robi
 *
 * Nie walczy z użytkownikiem. Pierwszy ruch kółkiem, palcem albo klawiszem
 * przerywa pętlę natychmiast — strona, która „ucieka" spod palca, jest gorsza
 * od strony, która wylądowała o 357 px za nisko.
 *
 * Nie zmienia adresu, nie dotyka historii i nie działa, gdy w adresie nie ma
 * kotwicy. Bez `#` w adresie nie robi absolutnie nic.
 *
 * ## `data-mobile-start` — ta sama kotwica, inny początek na telefonie
 *
 * Dodane 05.09.2026. Karta auta na `/fleet`, `/saved`, porównywarka i odnośniki
 * asystenta prowadzą pod `#rezerwacja`, bo ich adres powstaje NA SERWERZE,
 * który nie wie, jak szeroki jest ekran. Na komputerze to jest dobre miejsce:
 * formularz stoi przyklejony w prawej kolumnie obok cennika. Na telefonie —
 * już nie: strona jest jedną kolumną, więc skok pod formularz przeskakuje
 * cennik i kalendarz, czyli dokładnie to, na podstawie czego klient wybiera
 * termin.
 *
 * Element docelowy może więc powiedzieć, gdzie ta sama ścieżka zaczyna się
 * w układzie jednokolumnowym: `data-mobile-start="cennik"`.
 *
 * O tym, KTÓRY układ jest w mocy, nie decyduje tu żadna liczba pikseli
 * przepisana z arkusza — decyduje sam element. Formularz ma `lg:sticky`,
 * więc na komputerze jego `position` to `sticky`, a na telefonie `static`.
 * To NIE jest sprytna sztuczka zamiast `matchMedia`: przyklejenie panelu jest
 * właśnie tym powodem, dla którego na komputerze skok pod formularz jest
 * poprawny. Warunek pyta wprost o przyczynę, a nie o skorelowaną z nią
 * szerokość — i nie rozjedzie się, gdy ktoś zmieni próg `lg`.
 */

/** Ile najdłużej pilnujemy pozycji. Strona osiada w ~400 ms; sekunda to zapas. */
const LIMIT_MS = 2500;

/** Poniżej tylu pikseli różnicy nie ruszamy — to już jest „na miejscu". */
const TOLERANCJA_PX = 4;

export function HashScroll() {
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;

    /**
     * Element, do którego naprawdę dowozimy — patrz `data-mobile-start` wyżej.
     *
     * Liczony w każdej klatce, a nie raz: kotwica bywa montowana później niż
     * ten efekt, a `position` ustala się dopiero po zastosowaniu arkusza.
     */
    const celSkoku = (): HTMLElement | null => {
      const el = document.getElementById(hash);
      if (!el) return null;
      const start = el.dataset.mobileStart;
      if (!start) return el;
      // Panel przyklejony = układ dwukolumnowy = skok pod formularz jest dobry.
      if (getComputedStyle(el).position === "sticky") return el;
      return document.getElementById(start) ?? el;
    };

    /*
      `scroll-margin-top` z arkusza, a nie liczba wpisana tutaj.

      Kotwice w tym projekcie mają `scroll-mt-24` (96 px) dokładnie po to, żeby
      nie schować się pod przyklejoną belką. Odczyt ze stylu wyliczonego
      sprawia, że zmiana tej klasy w JSX-ie nie wymaga pamiętania o drugim
      miejscu — a przy okazji obsługuje kotwice z innym marginesem.
    */
    const marginesGorny = (el: Element) => {
      const v = parseFloat(getComputedStyle(el).scrollMarginTop);
      return Number.isFinite(v) ? v : 0;
    };

    let przerwane = false;
    const koniec = () => {
      przerwane = true;
    };

    // Ruch użytkownika wygrywa ze wszystkim.
    const zdarzenia = [
      "wheel",
      "touchstart",
      "keydown",
      "pointerdown",
    ] as const;
    for (const z of zdarzenia) {
      window.addEventListener(z, koniec, { passive: true, once: true });
    }

    const start = performance.now();
    let klatka = 0;

    const krok = () => {
      if (przerwane) return;
      if (performance.now() - start > LIMIT_MS) return;

      const el = celSkoku();
      if (el) {
        const gora = el.getBoundingClientRect().top;
        const cel = marginesGorny(el);
        if (Math.abs(gora - cel) > TOLERANCJA_PX) {
          /*
            `behavior: "auto"`, nie „smooth": to nie jest przewijanie, którego
            klient sobie zażyczył, tylko doprowadzenie strony tam, gdzie miała
            być od początku. Płynna animacja pokazywałaby mu, że coś poszło
            nie tak.
          */
          window.scrollTo({
            top: window.scrollY + gora - cel,
            behavior: "auto",
          });
        }
      }
      klatka = requestAnimationFrame(krok);
    };

    klatka = requestAnimationFrame(krok);

    return () => {
      przerwane = true;
      cancelAnimationFrame(klatka);
      for (const z of zdarzenia) window.removeEventListener(z, koniec);
    };
  }, []);

  return null;
}
