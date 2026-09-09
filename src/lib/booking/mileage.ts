/**
 * Limit kilometrów i opłata za nadprzebieg — JEDNO miejsce na całą regułę.
 *
 * ## Co tu mieszka, a co nie
 *
 * Tutaj: ile kilometrów obejmuje najem danej długości i ile kosztuje każdy
 * kilometr ponad to. Nie ma tu ANI JEDNEJ stawki dla konkretnego auta —
 * stawka jest własnością modelu i stoi w `car_models.extra_mileage_fee_grosze`,
 * obok ceny dobowej i kaucji. Ten plik dostaje ją w argumencie i nigdy nie zna
 * jej z pamięci.
 *
 * To rozróżnienie jest całym sensem tego modułu. Strona auta, formularz
 * rezerwacji, podsumowanie, asystent, panel i rozliczenie zwrotu pytają
 * dokładnie te trzy funkcje, więc nie ma jak powstać druga tabela stawek ani
 * druga interpretacja limitu.
 *
 * ## Skąd reguła 300 / 250 / 3 000
 *
 * Z Regulaminu, §9 — dokumentu, który klienta wiąże. Brzmi tam dosłownie:
 * „limit przebiegu: 300 km na dobę przy najmie od 1 do 6 dni, 250 km na dobę
 * przy najmie od 7 do 29 dni oraz 3 000 km miesięcznie przy najmie od 30 dni,
 * o ile umowa najmu lub indywidualna oferta nie stanowi inaczej". Angielska
 * wersja mówi to samo. Liczby poniżej są więc PRZEPISANE z tekstu prawnego,
 * a nie wymyślone pod kod — i jeżeli kiedyś się rozjadą, to Regulamin ma rację,
 * nie ten plik.
 *
 * ## Dlaczego kolumna `kmPerDayLimit` nadal coś znaczy
 *
 * Bo Regulamin kończy się na „o ile umowa nie stanowi inaczej", a ta kolumna
 * jest właśnie tym miejscem: per-auto, edytowalna w panelu. Dziś każde z
 * dziesięciu aut ma tam 300, czyli dokładnie próg pierwszego przedziału, więc
 * obie drogi dają ten sam wynik. Gdyby administrator wpisał autu 200 km/dobę,
 * dłuższe najmy dostają MNIEJSZĄ z dwóch liczb: własnego limitu auta i progu
 * z Regulaminu. Nigdy większą — inaczej wystarczyłoby wydłużyć najem, żeby
 * dostać więcej kilometrów na dobę niż przy najmie krótkim, co byłoby regułą
 * odwrotną do zamierzonej.
 *
 * `kmPerDayLimit === 0` znaczy „bez limitu" (tak czyta tę kolumnę cała reszta
 * projektu) i wtedy nadprzebieg nie istnieje: nie ma czego przekroczyć.
 */

/** Ile groszy w złotówce — nazwane, bo pojawia się w kilku przeliczeniach. */
const GROSZE_W_ZLOTOWCE = 100;

/** Dni w miesiącu rozliczeniowym — ta sama stała co w cenniku 30+. */
export const DNI_W_MIESIACU = 30;

/**
 * Progi przebiegu z Regulaminu §9, od najkrótszego najmu.
 *
 * `kmNaDobe` dla dwóch pierwszych, `kmNaMiesiac` dla ostatniego — bo tak są
 * zapisane w dokumencie i przeliczanie ich do wspólnej jednostki w danych
 * ukryłoby, że trzeci próg jest miesięczny, a nie dobowy.
 */
export const PROGI_PRZEBIEGU = [
  { odDni: 1, doDni: 6, kmNaDobe: 300 },
  { odDni: 7, doDni: 29, kmNaDobe: 250 },
  { odDni: 30, doDni: null, kmNaMiesiac: 3000 },
] as const;

export type ProgPrzebiegu = (typeof PROGI_PRZEBIEGU)[number];

/** Próg obowiązujący dla najmu o tej długości. */
export function progPrzebiegu(dni: number): ProgPrzebiegu {
  const n = Math.max(1, Math.floor(dni));
  return (
    PROGI_PRZEBIEGU.find((p) => n >= p.odDni && (p.doDni === null || n <= p.doDni)) ??
    PROGI_PRZEBIEGU[PROGI_PRZEBIEGU.length - 1]
  );
}

/**
 * Ile kilometrów obejmuje najem — `null` znaczy BEZ LIMITU, nie „zero".
 *
 * Rozróżnienie jest istotne dla każdego, kto to wywoła: `0` byłoby obietnicą,
 * że klient nie przejedzie ani kilometra bez dopłaty, a `null` mówi, że pytanie
 * o nadprzebieg dla tego auta nie ma sensu.
 */
export function limitKmDlaNajmu(
  dni: number,
  kmNaDobeAuta: number,
): number | null {
  if (kmNaDobeAuta <= 0) return null; // bez limitu
  const n = Math.max(1, Math.floor(dni));
  const prog = progPrzebiegu(n);

  if ("kmNaMiesiac" in prog) {
    // Miesięczny próg rozliczany proporcjonalnie do długości najmu — tak samo,
    // jak cennik proporcjonalnie rozlicza stawkę miesięczną (patrz
    // `rentalChargeGrosze`). Sufit z limitu auta liczony w tej samej jednostce.
    const zRegulaminu = (prog.kmNaMiesiac * n) / DNI_W_MIESIACU;
    return Math.round(Math.min(zRegulaminu, kmNaDobeAuta * n));
  }
  return Math.min(prog.kmNaDobe, kmNaDobeAuta) * n;
}

/**
 * Ile kilometrów na dobę obejmuje najem tej długości — do wyświetlenia.
 *
 * Osobno od `limitKmDlaNajmu`, bo klient czyta „300 km/doba", a nie „900 km
 * na trzy dni". Liczone z tej samej funkcji, więc etykieta nie może powiedzieć
 * czego innego niż rozliczenie.
 */
export function limitKmNaDobe(dni: number, kmNaDobeAuta: number): number | null {
  const laczny = limitKmDlaNajmu(dni, kmNaDobeAuta);
  if (laczny === null) return null;
  return Math.round(laczny / Math.max(1, Math.floor(dni)));
}

/**
 * Ile kilometrów ponad limit — nigdy liczba ujemna.
 *
 * `null` (bez limitu) i przejazd w granicach limitu dają tak samo zero, bo
 * w obu wypadkach nie ma czego naliczyć.
 */
export function nadprzebiegKm(
  przejechaneKm: number,
  limitKm: number | null,
): number {
  if (limitKm === null) return 0;
  return Math.max(0, Math.round(przejechaneKm) - limitKm);
}

/**
 * Opłata za nadprzebieg, w groszach.
 *
 * `stawkaGroszeZaKm === null` to „stawki nie ustawiono" i wynikiem jest `null`,
 * a NIE zero. Zero byłoby zdaniem „nadprzebieg jest darmowy" — a prawdziwa
 * odpowiedź brzmi „nie wiem, bo nikt tego auta nie wycenił". Wywołujący ma
 * wtedy pokazać brak, nie kwotę.
 */
export function oplataNadprzebiegGrosze(
  przejechaneKm: number,
  limitKm: number | null,
  stawkaGroszeZaKm: number | null,
): number | null {
  if (stawkaGroszeZaKm === null || stawkaGroszeZaKm <= 0) return null;
  return nadprzebiegKm(przejechaneKm, limitKm) * stawkaGroszeZaKm;
}

/**
 * Kilometry z separatorem tysięcy: „3 000 km", nie „3000 km".
 *
 * ISTNIEJE, BO `Number.toLocaleString("pl")` NIE DAJE SEPARATORA — potrzebny
 * jest pełny znacznik regionu (`pl-PL`), a w komponentach pod ręką jest samo
 * `locale` z next-intl, czyli „pl" albo „en". Zmierzone na kopii 01.09.2026:
 * limit trzydziestodniowy wychodził jako „3000 km", podczas gdy Regulamin,
 * strona główna i FAQ piszą „3 000 km" — ta sama liczba w dwóch zapisach na
 * jednej stronie.
 */
export function formatKm(km: number, locale: string): string {
  return km.toLocaleString(locale === "en" ? "en-GB" : "pl-PL");
}

/**
 * Stawka jako liczba złotych — WYŁĄCZNIE do formatowania.
 *
 * Grosze zostają jednostką bazową wszędzie indziej; ta funkcja istnieje po to,
 * żeby żaden komponent nie dzielił przez 100 na własną rękę i nie zgubił
 * drugiego miejsca po przecinku przy 4,50.
 */
export function stawkaZl(stawkaGroszeZaKm: number): number {
  return stawkaGroszeZaKm / GROSZE_W_ZLOTOWCE;
}
