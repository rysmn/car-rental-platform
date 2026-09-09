import { z } from "zod";

/**
 * Anulowanie rezerwacji i nieodebranie auta — JEDNO miejsce na całą politykę.
 *
 * ## Co tu jest, a czego tu nie ma
 *
 * Tutaj: progi czasowe, kwoty, sufit należności i arytmetyka, która z godziny
 * do odbioru robi kwotę. Nie ma tu ANI JEDNEJ decyzji o tym, czy wolno
 * anulować — to pytanie o status rezerwacji i mieszka w `manage-core`. Nie ma
 * też pobierania pieniędzy: ten plik nalicza NALEŻNOŚĆ, a czy ktoś ją zapłacił,
 * mówi osobny wiersz w `reservation_cancellation_fees`.
 *
 * Formularz rezerwacji, podsumowanie, „moje rezerwacje", panel, asystent, FAQ,
 * cennik i oba maile pytają te same funkcje. Kwoty 200/400/500 nie są wpisane
 * nigdzie indziej — ani w tekście strony, ani w odpowiedziach czatu.
 *
 * ## Dlaczego godziny, a nie doby
 *
 * Progi zamówienia są godzinowe (24 h, 12 h) i liczone do GODZINY ODBIORU,
 * a nie do daty. Rezerwacja na jutro rano i rezerwacja na jutro wieczorem
 * mają dziś wieczorem różne progi, choć data odbioru jest ta sama — i to jest
 * cały powód, dla którego `pickupTime` musi tu wejść, a `startDate` nie
 * wystarcza.
 *
 * ## Sufit
 *
 * Opłata nigdy nie przekracza wartości rezerwacji. Rezerwacja za 300 zł
 * i nieodebranie auta wycenione na 500 zł daje 300 zł, nie 500. Sufit jest
 * liczony TUTAJ, nie w interfejsie, żeby żaden ekran nie mógł pokazać kwoty,
 * której serwer by nie naliczył.
 */

/* ── Polityka ─────────────────────────────────────────────────────────────── */

/**
 * Konfiguracja polityki anulowania.
 *
 * Kwoty w GROSZACH, jak wszystkie pieniądze w tej bazie, i progi w GODZINACH.
 * Zod pilnuje ich sensu przy każdym zapisie, więc administrator nie ustawi
 * progu bezpłatnego niższego niż płatny ani kwoty ujemnej.
 */
export const cancellationSchema = z
  .object({
    /** Powyżej tylu godzin do odbioru anulowanie jest bezpłatne. */
    freeHours: z.number().int().min(0).max(720).default(24),
    /** Drugi próg: między nim a `freeHours` obowiązuje `tier1Grosze`. */
    lateHours: z.number().int().min(0).max(720).default(12),
    /** Opłata w oknie `lateHours` … `freeHours`. */
    tier1Grosze: z.number().int().min(0).max(10_000_00).default(20000),
    /** Opłata poniżej `lateHours`. */
    tier2Grosze: z.number().int().min(0).max(10_000_00).default(40000),
    /** Opłata za nieodebranie auta. */
    noShowGrosze: z.number().int().min(0).max(10_000_00).default(50000),
    /**
     * Ile minut po umówionej godzinie klient ma na spóźnienie, zanim obsługa
     * może uznać rezerwację za nieodebraną.
     *
     * To NIE jest automat. Nic się samo nie naliczy po trzydziestu minutach —
     * ta liczba mówi tylko, od kiedy przycisk w panelu przestaje być
     * przedwczesny. Automatyczne obciążanie klienta bez spojrzenia człowieka
     * jest dokładnie tym, czego zamówienie zabrania.
     */
    noShowGraceMinutes: z.number().int().min(0).max(1440).default(30),
  })
  /*
    Próg płatny nie może leżeć wyżej niż bezpłatny — inaczej powstałaby dziura,
    w której obowiązywałyby jednocześnie dwie reguły, a kolejność sprawdzania
    decydowałaby o cenie. Odrzucamy to przy zapisie, a nie rozstrzygamy po
    cichu w arytmetyce.
  */
  .refine((p) => p.lateHours <= p.freeHours, {
    message: "Drugi próg nie może być wyższy niż próg bezpłatnego anulowania.",
    path: ["lateHours"],
  })
  /*
    Bliżej odbioru nie może być taniej. Odwrotna drabinka to nie konfiguracja,
    tylko literówka, i lepiej ją zatrzymać, niż tłumaczyć klientowi, dlaczego
    anulowanie na godzinę przed jest tańsze niż na dwadzieścia.
  */
  .refine((p) => p.tier2Grosze >= p.tier1Grosze, {
    message: "Opłata bliżej odbioru nie może być niższa niż wcześniejsza.",
    path: ["tier2Grosze"],
  });

export type CancellationPolicy = z.infer<typeof cancellationSchema>;

/** Zasady uzgodnione z właścicielem 01.09.2026 — punkt wyjścia dla panelu. */
export const CANCELLATION_DEFAULT: CancellationPolicy =
  cancellationSchema.parse({});

/* ── Naliczenie ───────────────────────────────────────────────────────────── */

/**
 * Który przedział obowiązuje.
 *
 * `no_show` nie jest przedziałem czasowym i nigdy nie wychodzi z samego
 * zegara — to decyzja obsługi, która widziała, że klient się nie zjawił.
 * Dlatego jest osobnym rodzajem, a nie czwartym progiem.
 */
export type CancellationTier = "free" | "tier1" | "tier2" | "no_show";

export type CancellationKind = "cancellation" | "no_show";

/** Przedział dla danej liczby godzin do odbioru. */
export function tierForHours(
  hoursToPickup: number,
  policy: CancellationPolicy,
): Exclude<CancellationTier, "no_show"> {
  // OSTRO większe niż próg — dokładnie 24:00:00 do odbioru to już nie jest
  // „więcej niż 24 h". Ta sama konwencja, co w `wolnoZarzadzac`.
  if (hoursToPickup > policy.freeHours) return "free";
  if (hoursToPickup > policy.lateHours) return "tier1";
  return "tier2";
}

/** Kwota z cennika dla przedziału, PRZED zastosowaniem sufitu. */
export function tierAmountGrosze(
  tier: CancellationTier,
  policy: CancellationPolicy,
): number {
  switch (tier) {
    case "free":
      return 0;
    case "tier1":
      return policy.tier1Grosze;
    case "tier2":
      return policy.tier2Grosze;
    case "no_show":
      return policy.noShowGrosze;
  }
}

export type CancellationCharge = {
  tier: CancellationTier;
  kind: CancellationKind;
  /** Kwota z cennika, przed sufitem — pokazywana, gdy sufit ją obciął. */
  policyGrosze: number;
  /** Kwota naliczona: `min(policyGrosze, wartość rezerwacji)`. */
  amountGrosze: number;
  /** Czy sufit zadziałał — interfejs ma to powiedzieć, a nie ukryć. */
  cappedByTotal: boolean;
  /** Godziny do odbioru w chwili liczenia; ujemne, gdy odbiór już minął. */
  hoursToPickup: number;
};

/**
 * Ile klient zapłaci za anulowanie albo za nieodebranie auta.
 *
 * JEDYNE miejsce, w którym ta kwota powstaje. Interfejs jej nie liczy i nie
 * ma prawa liczyć — ekran anulowania pyta serwer i pokazuje to, co dostanie.
 */
export function computeCancellationCharge(input: {
  hoursToPickup: number;
  reservationTotalGrosze: number;
  policy: CancellationPolicy;
  kind?: CancellationKind;
}): CancellationCharge {
  const kind = input.kind ?? "cancellation";
  const tier: CancellationTier =
    kind === "no_show" ? "no_show" : tierForHours(input.hoursToPickup, input.policy);
  const policyGrosze = tierAmountGrosze(tier, input.policy);
  /*
    Sufit: nigdy więcej, niż wynosi cała rezerwacja. Ujemna wartość rezerwacji
    nie istnieje, ale `Math.max(0, …)` kosztuje nic i zamyka drogę, którą
    zepsuty wiersz w bazie mógłby zamienić opłatę w wypłatę dla klienta.
  */
  const sufit = Math.max(0, input.reservationTotalGrosze);
  const amountGrosze = Math.min(policyGrosze, sufit);
  return {
    tier,
    kind,
    policyGrosze,
    amountGrosze,
    cappedByTotal: amountGrosze < policyGrosze,
    hoursToPickup: input.hoursToPickup,
  };
}

/* ── Stan należności ──────────────────────────────────────────────────────── */

/**
 * NALICZONO to nie to samo, co ZAPŁACONO — i to rozróżnienie jest tu całą
 * treścią typu.
 *
 *   `not_applicable` — anulowanie bezpłatne, nie ma czego rozliczać,
 *   `due`            — naliczone, pieniądze jeszcze nie wpłynęły,
 *   `paid`           — obsługa potwierdziła wpłatę,
 *   `waived`         — obsługa umorzyła; kwota pierwotna ZOSTAJE w wierszu.
 *
 * Stan jest WYPROWADZANY z wiersza opłaty, nie trzymany jako czwarta kolumna,
 * którą trzeba pamiętać, żeby zmienić — ta sama zasada, co przy kaucji
 * (`reservation_deposit_events`) i przy `reservations.paid_at`.
 */
export type CancellationFeeStatus = "not_applicable" | "due" | "paid" | "waived";

export function feeStatus(row: {
  amountGrosze: number;
  paidAt: Date | string | null;
  waivedAt: Date | string | null;
}): CancellationFeeStatus {
  if (row.waivedAt) return "waived";
  if (row.amountGrosze <= 0) return "not_applicable";
  if (row.paidAt) return "paid";
  return "due";
}

/** Ile klient jest jeszcze winien — po umorzeniu i po zapłacie zawsze zero. */
export function outstandingGrosze(row: {
  amountGrosze: number;
  paidAt: Date | string | null;
  waivedAt: Date | string | null;
}): number {
  const status = feeStatus(row);
  return status === "due" ? row.amountGrosze : 0;
}

/* ── Czas ─────────────────────────────────────────────────────────────────── */

/*
  GODZIN DO ODBIORU TU SIĘ NIE LICZY — i to jest świadome.

  Robi to `godzinyDoOdbioru` z `lib/booking/manage-core`, przez
  `chwilaWarszawska` z `lib/booking/lead-time`, czyli tę samą funkcję, którą
  liczy się minimalny czas do odbioru i okno samoobsługi. Napisanie tutaj
  drugiego przeliczenia strefy czasowej dałoby dwa rachunki, które rozjadą się
  o godzinę dwa razy w roku — akurat w tygodniu, w którym Europa i reszta
  świata zmieniają czas w różnych terminach.

  Ten plik przyjmuje liczbę godzin w argumencie i nie wie, skąd pochodzi.
*/

/**
 * Czy obsługa może już uznać rezerwację za nieodebraną.
 *
 * Dopiero po godzinie odbioru POWIĘKSZONEJ o tolerancję. Wcześniej przycisk
 * w panelu jest po prostu przedwczesny — klient, który stoi w korku
 * dwadzieścia minut, nie jest jeszcze nikim, kto się nie zjawił.
 */
export function noShowMozliwy(
  hoursToPickup: number,
  policy: CancellationPolicy,
): boolean {
  return hoursToPickup <= -(policy.noShowGraceMinutes / 60);
}
