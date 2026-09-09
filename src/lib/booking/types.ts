import type { CancellationPolicy } from "./cancellation";
export type DepositVariant = "with_deposit" | "no_deposit";

/** Optional extras chosen in the calculator. */
export type BookingExtras = {
  extraDriver: boolean;
  childSeat: boolean;
  protectionPackage: boolean;
};

/** Fee catalog (grosze), resolved from the `fees` table or seed defaults. */
export type FeeCatalog = {
  extraDriver: Fee;
  childSeat: Fee;
  protectionPackage: Fee;
  noDeposit: Fee;
  /** Wydanie lub zwrot poza standardowymi godzinami pracy. */
  afterHours: Fee;
};

/**
 * Jedna opłata dodatkowa.
 *
 * `capGrosze` to górna granica NALICZENIA, nie druga cena. Dodatkowy kierowca
 * kosztuje 50 zł za dobę i tak jest liczony — ale od ósmej doby suma przestaje
 * rosnąć i zatrzymuje się na 400 zł. Bez tego pola trzeba by trzymać dwie
 * stawki i pilnować, żeby nie rozjechały się przy pierwszej zmianie cennika;
 * z nim reguła jest jedną liczbą obok drugiej, w tym samym wierszu tabeli.
 *
 * `null` znaczy „bez granicy" i tak zachowuje się każda opłata, która jej nie
 * ma — czyli wszystkie oprócz dodatkowego kierowcy.
 */
export type Fee = {
  amountGrosze: number;
  unit: FeeUnit;
  capGrosze?: number | null;
};

export type FeeUnit = "per_day" | "per_rental";

/** Everything the price engine needs — all server-sourced, never from the client. */
export type QuoteInput = {
  /** Base (1–2 day) rate. Longer stays use the tier fields below. */
  dailyPriceGrosze: number;
  dailyPrice3to6Grosze: number | null;
  dailyPrice7to13Grosze: number | null;
  dailyPrice14to29Grosze: number | null;
  /** Used for rentals of 30 days or more, pro-rated across the stay. */
  monthlyPriceGrosze: number;
  depositGrosze: number;
  /** Dobowy limit kilometrów tego modelu; 0 znaczy bez limitu. */
  kmPerDayLimit: number;
  /** Stawka za kilometr ponad limit, w groszach; `null` gdy nie ustawiono. */
  extraMileageFeeGrosze: number | null;
  /**
   * Polityka anulowania obowiązująca w chwili liczenia tej wyceny.
   *
   * WYMAGANA, nie opcjonalna, i to jest cały mechanizm migawki: `computeQuote`
   * jest jedynym wejściem do `reservations.quote`, więc dopóki to pole jest
   * obowiązkowe, nie da się zapisać rezerwacji bez zapamiętanych zasad. Pole
   * opcjonalne dałoby się pominąć na jednej ścieżce i nikt by tego nie zauważył
   * aż do pierwszego sporu o kwotę.
   */
  cancellationPolicy: CancellationPolicy;
  days: number;
  locationFeeGrosze: number;
  extras: BookingExtras;
  depositVariant: DepositVariant;
  fees: FeeCatalog;
};

export type QuoteLine = { code: string; amountGrosze: number };

export type QuoteBreakdown = {
  days: number;
  /** The rate actually charged per day for this stay, after tiering. */
  dailyPriceGrosze: number;
  /** Base rate before any long-stay discount — lets the UI show the saving. */
  baseDailyPriceGrosze: number;
  rentalGrosze: number;
  lines: QuoteLine[];
  totalGrosze: number;
  /** Refundable deposit held (0 for the no-deposit variant). */
  depositGrosze: number;
  /**
   * NADPRZEBIEG — WARUNEK ZAPISANY, NIE KWOTA POLICZONA.
   *
   * Te dwa pola nie wchodzą do `totalGrosze` i wchodzić nie mogą: w chwili
   * rezerwacji nikt nie wie, ile klient przejedzie, a doliczenie czegokolwiek
   * „na wszelki wypadek" byłoby wystawieniem rachunku za zdarzenie, które się
   * nie odbyło. Są tu, bo `QuoteBreakdown` ląduje w `reservations.quote` jako
   * JSON — czyli jest MIGAWKĄ WARUNKÓW z dnia zawarcia rezerwacji.
   *
   * Dzięki temu podniesienie stawki w panelu za miesiąc nie rusza rezerwacji
   * zawartej dziś: rozliczenie zwrotu czyta stawkę stąd, a nie z bieżącego
   * cennika auta. To jest cały powód, dla którego te pola istnieją.
   *
   * Obie są opcjonalne, bo rezerwacje sprzed 01.09.2026 mają w bazie JSON bez
   * nich. Odczyt musi to widzieć jako „nie zapisano" i tak powiedzieć — nigdy
   * podstawić dzisiejszej stawki pod wczorajszą umowę.
   */
  extraMileageFeeGrosze?: number | null;
  /** Kilometry objęte najmem tej długości; `null` = bez limitu. */
  includedMileageKm?: number | null;
  /**
   * ZASADY ANULOWANIA Z DNIA ZAWARCIA — nie z dzisiejszej konfiguracji.
   *
   * Ta sama zasada i ten sam nośnik co przy nadprzebiegu: właściciel może
   * jutro podnieść opłatę z 200 na 250 zł, a rezerwacja zawarta dziś rozliczy
   * się według 200. Klient płaci to, na co się umówił.
   *
   * Opcjonalna, bo rezerwacje sprzed 01.09.2026 mają w bazie JSON bez tego
   * pola. Brak czyta się jako „ta rezerwacja nie zaakceptowała żadnej polityki
   * opłat" i wtedy anulowanie jest BEZPŁATNE — nowych opłat nie nakłada się
   * wstecz na umowę, która ich nie zawierała.
   */
  cancellationPolicy?: CancellationPolicy;
  /**
   * The rate for this length of stay is 0, meaning the operator prices it by
   * hand. Every number above is then meaningless and must not be shown or
   * charged — the customer is sent to a manager instead. See
   * `isPriceOnRequest`.
   */
  onRequest: boolean;
};
