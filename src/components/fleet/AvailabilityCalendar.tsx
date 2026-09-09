"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useLocale } from "next-intl";
import { isoOf, mondayIndex, weekdayInitials } from "@/lib/dates";
import { cn } from "@/lib/utils";
import {
  getWybranyTermin,
  getWybranyTerminNaSerwerze,
  subscribeWybranyTermin,
  ustawWybranyTermin,
} from "@/lib/booking/wybrany-termin";

/**
 * Month-at-a-time availability grid for one car model — WYBIERALNA.
 *
 * Reads the same free-unit map the booking form validates against, so a green
 * square is a promise the form will keep. One month with arrows rather than a
 * scrolling strip: a sideways scroll on a phone hides half the calendar behind
 * a gesture people do not know to make.
 *
 * Weeks start on Monday — Poland's convention, and the site's primary market.
 * Month and weekday names come from `Intl`, so they follow the active locale
 * without a translation key per month.
 *
 * ## Od 30.08.2026: klient wybiera tu termin
 *
 * Kalendarz był siatką do oglądania — pokazywał, co wolne, i nie dało się w to
 * kliknąć. Teraz pierwsze dotknięcie ustawia dzień odbioru, drugie dzień
 * zwrotu, a wybór jedzie do formularza rezerwacji przez wspólny magazyn
 * (`lib/booking/wybrany-termin`). W drugą stronę tak samo: zmiana daty
 * w formularzu przesuwa zaznaczenie tutaj.
 *
 * Nie powstał drugi kalendarz ani drugi silnik dostępności. Ten sam komponent,
 * ta sama mapa wolnych dni, ta sama walidacja po stronie serwera.
 *
 * ## Czerwony znaczy dwie rzeczy — i trzeba je odróżnić
 *
 * Zajęte dni były czerwone od początku. Właściciel poprosił, żeby WYBRANY
 * termin też był czerwony. Gdyby oba wyglądały tak samo, klient nie
 * odróżniłby „nie mogę" od „wybrałem".
 *
 * Rozstrzygnięte tak:
 *   ZAJĘTY   — wygaszona czerwień, przekreślenie, kursor „niedozwolone".
 *              Wygląda na wyłączony, bo jest wyłączony.
 *   WYBRANY  — pełna czerwień marki na całej komórce, biały tekst, ramka.
 *              Wygląda na naciśnięty, bo klient go nacisnął.
 *
 * Różnica nie jest wyłącznie kolorem: zajęty ma przekreślenie i `aria-disabled`,
 * wybrany ma `aria-selected` i pogrubienie. Legenda niżej wymienia oba stany.
 */

const DAY_MS = 86_400_000;

export function AvailabilityCalendar({
  freeByDay,
  monthsAhead,
  labels,
}: {
  /** `YYYY-MM-DD` → free units. A day missing from the map is treated as free. */
  freeByDay: Record<string, number>;
  /** How far forward the arrows may travel — the booking lead-time limit. */
  monthsAhead: number;
  labels: {
    title: string;
    free: string;
    taken: string;
    prev: string;
    next: string;
    /** „Twój termin" — trzeci stan w legendzie, od 30.08.2026. */
    selected: string;
    /** Podpowiedź nad siatką: jak wybrać. */
    hint: string;
  };
}) {
  const locale = useLocale();
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const [offset, setOffset] = useState(0);

  /*
    Wybór klienta czytany z magazynu wspólnego z formularzem rezerwacji.
    `useSyncExternalStore` zamiast własnego `useState`, bo ten sam wybór ma
    dwa widoki i żaden nie jest właścicielem — patrz `lib/booking/wybrany-termin`.
  */
  const wybor = useSyncExternalStore(
    subscribeWybranyTermin,
    getWybranyTermin,
    getWybranyTerminNaSerwerze,
  );

  /**
   * Dotknięcie dnia.
   *
   * Pierwsze ustawia odbiór, drugie zwrot. Dotknięcie dnia WCZEŚNIEJSZEGO niż
   * już wybrany odbiór zaczyna wybór od nowa, zamiast tworzyć zakres wstecz —
   * tak samo jak `DateRangePicker`, żeby dwa miejsca w serwisie nie zachowywały
   * się inaczej pod tym samym palcem. Trzecie dotknięcie przy pełnym zakresie
   * też zaczyna od nowa: klient poprawia termin bez odświeżania strony.
   */
  const dotknij = useCallback((dzien: string) => {
    const { from, to } = getWybranyTermin();
    if (!from || (from && to)) {
      ustawWybranyTermin(dzien, null);
      return;
    }
    if (dzien < from) {
      ustawWybranyTermin(dzien, null);
      return;
    }
    ustawWybranyTermin(from, dzien);
  }, []);

  // Year and month as plain numbers rather than a Date: a fresh Date every
  // render is a new identity, which would make every memo below recompute.
  const { year, month } = useMemo(() => {
    const c = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    return { year: c.getFullYear(), month: c.getMonth() };
  }, [today, offset]);

  const monthName = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        month: "long",
        year: "numeric",
      }).format(new Date(year, month, 1)),
    [locale, year, month],
  );

  // Weekday initials, Monday first. Built from a known Monday so the labels are
  // always in the order the grid renders, whatever the locale's own first day.
  const weekdays = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: "short" });
    const monday = new Date(2024, 0, 1); // a Monday
    return Array.from({ length: 7 }, (_, i) =>
      fmt.format(new Date(monday.getTime() + i * DAY_MS)),
    );
  }, [locale]);

  /*
    Widoczny skrót bierzemy z jednej tablicy w `lib/dates`, a nie z ucięcia
    powyższej pełnej nazwy do dwóch znaków: po polsku dawało to „po … ni"
    zamiast „Pn … Nd". Pełna nazwa zostaje i dalej jedzie do `aria-label`.
  */
  const skrotyDni = weekdayInitials(locale);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leading = mondayIndex(new Date(year, month, 1));

  /**
   * Pełna data słowami — „12 września 2026", „12 September 2026".
   *
   * Etykieta dnia mówiła do 02.09.2026 tylko „12". Czytnik ekranu podawał
   * więc liczbę bez miesiąca, bez roku i bez stanu; klient niewidomy słyszał
   * trzydzieści liczb i nie wiedział, która jest wolna.
   */
  const pelnaData = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    [locale],
  );

  /**
   * Stan dnia słowami — jedyne miejsce, w którym te cztery słowa istnieją.
   *
   * Trzymane tu, a nie w `labels`, z tego samego powodu co `fleetStateLabel`:
   * `labels` niesie napisy legendy, którą czyta się oczami, a to są zdania
   * dla czytnika ekranu i muszą brzmieć jak zdania, nie jak podpis pod
   * kwadracikiem.
   */
  const slowo = useMemo(() => {
    const en = locale === "en";
    return {
      past: en ? "past date" : "termin miniony",
      taken: en ? "booked" : "zajęty",
      free: en ? "available" : "dostępny",
      selected: en ? "selected" : "wybrany",
    };
  }, [locale]);

  /**
   * Miesiąc rozbity na dni, a dni na tygodnie.
   *
   * Liczone raz, nie w trakcie rysowania: ten sam zestaw faktów potrzebny jest
   * teraz w trzech miejscach — do etykiety, do klas i do nawigacji strzałkami.
   */
  const dni = useMemo(() => {
    return Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const date = new Date(year, month, day);
      const key = isoOf(date);
      const past = date < today;
      // A day the window never covered is not evidence of a booking, so it
      // reads as free rather than inventing a red square.
      const zajety = (freeByDay[key] ?? 1) <= 0;
      const zablokowany = past || zajety;

      const start = wybor.from === key;
      const koniec = wybor.to === key;
      const pomiedzy =
        wybor.from !== null &&
        wybor.to !== null &&
        key > wybor.from &&
        key < wybor.to;
      const wybrany = start || koniec || pomiedzy;

      const stan = past ? slowo.past : zajety ? slowo.taken : slowo.free;
      const etykieta = [pelnaData.format(date), stan]
        .concat(wybrany ? [slowo.selected] : [])
        .join(" — ");

      return {
        key,
        day,
        past,
        zajety,
        zablokowany,
        wybrany,
        kraniec: start || koniec,
        etykieta,
      };
    });
  }, [daysInMonth, year, month, today, freeByDay, wybor, pelnaData, slowo]);

  /** Siedmiodniowe wiersze z pustymi polami na krańcach — patrz `role="row"`. */
  const tygodnie = useMemo(() => {
    type Pole = (typeof dni)[number] | null;
    const pola: Pole[] = [
      ...Array.from<Pole>({ length: leading }).fill(null),
      ...dni,
    ];
    while (pola.length % 7 !== 0) pola.push(null);
    const out: Pole[][] = [];
    for (let i = 0; i < pola.length; i += 7) out.push(pola.slice(i, i + 7));
    return out;
  }, [dni, leading]);

  /*
    NAWIGACJA KLAWIATURĄ — strzałki, Home i End w obrębie tygodnia.

    Wzorzec siatki mówi wprost: Tab wprowadza do siatki, strzałki poruszają się
    w niej. Bez tego przejście przez wrzesień kosztowało trzydzieści naciśnięć
    Taba, a klient korzystający wyłącznie z klawiatury po prostu omijał
    kalendarz.

    Ruch jest CIĘTY DO MIESIĄCA, świadomie: przeskok strzałką na sąsiedni
    miesiąc przestawiałby widok pod palcem i mieszał się z jawnymi strzałkami
    „←" i „→" nad siatką, które robią dokładnie to i są opisane. Wybór terminu
    nie zmienia się ani o krok — Enter i spacja działają tak, jak działały.
  */
  const komorki = useRef(new Map<string, HTMLButtonElement>());
  const [fokus, setFokus] = useState<string | null>(null);
  const biezacyFokus =
    fokus ?? dni.find((d) => !d.zablokowany)?.key ?? dni[0]?.key ?? null;

  const klawisz = useCallback(
    (e: ReactKeyboardEvent<HTMLButtonElement>, key: string) => {
      const przesun: Record<string, number> = {
        ArrowLeft: -1,
        ArrowRight: 1,
        ArrowUp: -7,
        ArrowDown: 7,
      };
      const i = dni.findIndex((d) => d.key === key);
      if (i < 0) return;

      let cel: number | null = null;
      if (e.key in przesun) cel = i + przesun[e.key];
      else if (e.key === "Home")
        cel = i - (mondayIndex(new Date(dni[i].key)) % 7);
      else if (e.key === "End")
        cel = i + (6 - (mondayIndex(new Date(dni[i].key)) % 7));
      if (cel === null) return;

      e.preventDefault();
      const docelowy = dni[Math.min(Math.max(cel, 0), dni.length - 1)];
      if (!docelowy) return;
      setFokus(docelowy.key);
      komorki.current.get(docelowy.key)?.focus();
    },
    [dni],
  );

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="label-tight text-ink-faint text-[10px]">
          {labels.title}
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setOffset((o) => Math.max(0, o - 1))}
            disabled={offset === 0}
            aria-label={labels.prev}
            className="border-line hover:border-line-strong text-ink-muted hover:text-ink flex h-8 w-8 items-center justify-center border text-xs transition-colors disabled:opacity-30 disabled:hover:border-current"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => setOffset((o) => Math.min(monthsAhead, o + 1))}
            disabled={offset >= monthsAhead}
            aria-label={labels.next}
            className="border-line hover:border-line-strong text-ink-muted hover:text-ink flex h-8 w-8 items-center justify-center border text-xs transition-colors disabled:opacity-30 disabled:hover:border-current"
          >
            →
          </button>
        </div>
      </div>

      <p
        className="font-heading text-ink mt-3 text-sm font-bold first-letter:uppercase"
        aria-live="polite"
      >
        {monthName}
      </p>

      <p className="text-ink-muted mt-2 text-xs leading-relaxed">
        {labels.hint}
      </p>

      {/*
        SIATKA WEDŁUG WZORCA ARIA (audyt 02.09.2026, P4).

        Do tego dnia `role="grid"` zawierał `gridcell` bez pośredniego wiersza,
        nazwy dni tygodnia były `aria-hidden`, dzień przeszły miał etykietę
        „1" bez słowa o tym, dlaczego jest wyszarzony, a przejście przez
        miesiąc kosztowało trzydzieści naciśnięć Taba.

        Wiersze mają `display: contents` (`className="contents"`), więc układ
        rysuje nadal jedna siatka CSS o siedmiu kolumnach — struktura jest dla
        czytnika ekranu, nie dla oka, i nie przestawia ani jednego piksela.
      */}
      <div
        className="mt-3 grid grid-cols-7 gap-1"
        role="grid"
        aria-label={`${labels.title} — ${monthName}`}
      >
        <div role="row" className="contents">
          {weekdays.map((w, i) => (
            /*
              Widoczny skrót, pełna nazwa dla czytnika. `aria-hidden` na
              nagłówkach kolumn kasowało informację, którą widzący czytają
              z ekranu w ułamku sekundy.
            */
            <span
              key={i}
              role="columnheader"
              aria-label={w}
              className="label-tight text-ink-faint pb-1 text-center text-[9px]"
            >
              {skrotyDni[i]}
            </span>
          ))}
        </div>

        {tygodnie.map((tydzien, wiersz) => (
          <div role="row" className="contents" key={wiersz}>
            {tydzien.map((d, kolumna) =>
              d === null ? (
                /*
                  Puste pole przed pierwszym i po ostatnim dniu miesiąca.
                  Zostaje komórką, bo wiersz siatki musi mieć siedem kolumn;
                  czytnik przeczyta je jako pustą. Bez `aria-hidden` —
                  ukrywanie części komórek wiersza zostawiłoby wiersz, który
                  deklaruje siedem kolumn, a udostępnia trzy.
                */
                <span key={`pad-${wiersz}-${kolumna}`} role="gridcell" />
              ) : (
                <button
                  key={d.key}
                  ref={(el) => {
                    if (el) komorki.current.set(d.key, el);
                    else komorki.current.delete(d.key);
                  }}
                  type="button"
                  role="gridcell"
                  /*
                    `aria-disabled` ZAMIAST atrybutu `disabled`, i to nie jest
                    drobiazg: dzień z `disabled` jest dla czytnika ekranu
                    niewidoczny, więc klient niewidomy nie mógł się dowiedzieć,
                    że dwunasty jest zajęty — po prostu go nie było. Teraz jest,
                    da się na nim zatrzymać i usłyszeć dlaczego, a kliknięcie
                    nadal nic nie robi.
                  */
                  aria-disabled={d.zablokowany || undefined}
                  aria-selected={d.wybrany || undefined}
                  aria-label={d.etykieta}
                  /*
                    ROVING TABINDEX: dokładnie jedna komórka jest przystankiem
                    Taba, resztę obsługują strzałki. Przedtem miesiąc kosztował
                    trzydzieści naciśnięć.
                  */
                  tabIndex={d.key === biezacyFokus ? 0 : -1}
                  onFocus={() => setFokus(d.key)}
                  onKeyDown={(e) => klawisz(e, d.key)}
                  onClick={d.zablokowany ? undefined : () => dotknij(d.key)}
                  className={cn(
                    "flex aspect-square items-center justify-center border text-xs tabular-nums transition-colors",
                    // Cel dotknięcia: kwadrat w siatce siedmiu kolumn i tak jest
                    // większy niż 44 px na każdym telefonie z listy, ale podłoga
                    // trzyma go takim także przy 320 px.
                    "min-h-[2.25rem] touch-manipulation",
                    d.zablokowany
                      ? "cursor-not-allowed"
                      : "cursor-pointer hover:brightness-110",
                    /*
                      WYBRANY wygrywa z każdym innym stanem: pełna czerwień marki,
                      biały napis, ramka. Dzień pomiędzy krańcami jest jaśniejszy,
                      żeby było widać, gdzie zakres się zaczyna i kończy.
                    */
                    d.wybrany
                      ? d.kraniec
                        ? "border-red bg-red font-semibold text-white"
                        : "border-red/50 bg-red/25 text-ink font-medium"
                      : d.past
                        ? // PRZESZŁY: wyszarzony i pochylony — trzeci kształt,
                          // żeby nie mylił się z zajętym ani z wolnym u kogoś,
                          // kto nie rozróżnia czerwieni od zieleni.
                          "border-line/50 text-ink-faint/40 italic"
                        : d.zajety
                          ? // ZAJĘTY: wygaszona czerwień i PRZEKREŚLENIE — różnica
                            // od wybranego nie jest wyłącznie kolorem.
                            "border-red/30 bg-red/5 text-red/50 line-through"
                          : "border-emerald-600/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                  )}
                >
                  {d.day}
                </button>
              ),
            )}
          </div>
        ))}
      </div>

      <p className="text-ink-faint mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 border border-emerald-600/40 bg-emerald-500/10" />
          {labels.free}
        </span>
        <span className="flex items-center gap-2">
          <span className="border-red/30 bg-red/5 h-3 w-3 border" />
          <span className="line-through">{labels.taken}</span>
        </span>
        {/* Trzeci stan w legendzie — bez niego dwie czerwienie obok siebie
            byłyby zagadką. */}
        <span className="flex items-center gap-2">
          <span className="border-red bg-red h-3 w-3 border" />
          {labels.selected}
        </span>
      </p>
    </div>
  );
}
