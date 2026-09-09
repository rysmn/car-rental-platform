import type { FeeCatalog, FeeUnit } from "./types";

/**
 * Awaryjny cennik dodatków i punktów odbioru.
 *
 * Prawdą są tabele `fees` i `pickup_locations` — administrator edytuje je
 * w panelu i to ich wartości wygrywają. To poniżej jest tym, co zobaczy
 * strona, gdyby baza nie odpowiedziała, więc od 26.08.2026 nie są to już
 * liczby zastępcze: są to CENY ZATWIERDZONE przez właściciela, te same, które
 * stoją w bazie. Placeholdery, które tu wcześniej siedziały, były źródłem
 * rozjazdu — strona główna pokazywała jedno, formularz liczył drugie.
 */
export const FEE_DEFAULTS: FeeCatalog = {
  // 50 zł za dobę, ale nie więcej niż 400 zł za cały wynajem: 7 dni = 350 zł,
  // 8 dni i każdy kolejny = 400 zł. Granicę nakłada `feeAmount` w silniku cen.
  extraDriver: { amountGrosze: 50_00, unit: "per_day", capGrosze: 400_00 },
  childSeat: { amountGrosze: 40_00, unit: "per_day" },
  protectionPackage: { amountGrosze: 100_00, unit: "per_day" },
  noDeposit: { amountGrosze: 100_00, unit: "per_day" },
  afterHours: { amountGrosze: 150_00, unit: "per_rental" },
};

export type LocationOption = {
  slug: string;
  name: string; // PL
  nameEn: string; // EN
  address: string | null;
  feeGrosze: number;
  sortOrder: number;
  /**
   * Czy można to miejsce wybrać w rezerwacji. Pominięte znaczy „tak" —
   * `getLocations()` i tak oddaje tylko aktywne. Pole jest tu po to, żeby
   * cennik na stronie mógł pokazać punkt zapowiedziany („wkrótce") bez
   * udawania, że da się go dziś wybrać.
   */
  active?: boolean;
};

export const LOCATION_DEFAULTS: LocationOption[] = [
  {
    slug: "office",
    name: "Odbiór w biurze (Warszawa)",
    nameEn: "Office pickup (Warsaw)",
    address: "Warszawa",
    feeGrosze: 0,
    sortOrder: 10,
  },
  {
    slug: "airport",
    name: "Lotnisko Chopina",
    nameEn: "Chopin Airport",
    address: "Warszawa, Lotnisko Chopina",
    feeGrosze: 200_00,
    sortOrder: 20,
  },
  {
    slug: "airport-gdansk",
    name: "Lotnisko Gdańsk",
    nameEn: "Gdańsk Airport",
    address: "Gdańsk, Port Lotniczy im. Lecha Wałęsy",
    feeGrosze: 200_00,
    sortOrder: 25,
    // Gdańsk NIE jest dziś punktem odbioru — decyzja właściciela z 26.08.2026.
    // Wpis zostaje, bo strona ma o nim mówić „wkrótce", a nie milczeć; nie
    // wolno go jednak wybrać w rezerwacji. `getLocations()` oddaje wyłącznie
    // aktywne, więc jedno pole załatwia obie te rzeczy naraz.
    active: false,
  },
  {
    slug: "delivery",
    name: "Dostawa pod wskazany adres",
    nameEn: "Delivery to your address",
    address: null,
    feeGrosze: 99_00,
    sortOrder: 30,
  },
];

/**
 * Publiczny cennik dodatków — JEDNA lista, z której korzysta strona główna,
 * asystent i wszystko, co kiedykolwiek zapyta „ile kosztuje fotelik".
 *
 * ## Dlaczego to istnieje
 *
 * Do 26.08.2026 były dwie listy. Formularz rezerwacji liczył z tabel `fees`
 * i `pickup_locations`, a strona główna drukowała stałą tablicę w
 * `lib/marketing/content` — i te dwie mówiły co innego: dostawa 99 kontra 150,
 * Chopin 149 kontra 200, fotelik 30 kontra 40, a w cenniku wisiał Modlin za
 * 199 zł, chociaż takiego punktu odbioru nigdy w systemie nie było. Klient
 * czytał jedno, płacił drugie.
 *
 * Ta funkcja NIE zna żadnej ceny. Dostaje katalog opłat i listę lokalizacji —
 * czyli dokładnie to, z czego liczy silnik cen — i tylko układa je w kolejność
 * i nazwy. Dopisanie tutaj liczby jest błędem, który ten komentarz ma
 * powstrzymać.
 *
 * Kwoty zostają w GROSZACH i w złotych. Przeliczenie na euro robi `<Money>`
 * po kursie z `lib/currency/rate` — tu nie ma i nie może być drugiej waluty.
 */
export type PublicExtra = {
  key: string;
  label: string;
  amountGrosze: number;
  /** `per_day` drukuje „/ doba"; `per_rental` to kwota za cały wynajem. */
  unit: FeeUnit;
  /** Górna granica naliczenia, gdy istnieje — patrz `Fee`. */
  capGrosze?: number | null;
  /** Punkt zapowiedziany: pokazujemy cenę, ale wybrać go dziś nie można. */
  comingSoon?: boolean;
};

export function publicExtras(
  fees: FeeCatalog,
  /** WSZYSTKIE punkty odbioru, także nieaktywne — patrz `comingSoon`. */
  locations: LocationOption[],
  locale: string,
): PublicExtra[] {
  const pl = locale !== "en";
  const t = (polski: string, angielski: string) => (pl ? polski : angielski);
  const loc = (slug: string) => locations.find((l) => l.slug === slug);

  const out: PublicExtra[] = [];

  const delivery = loc("delivery");
  if (delivery && delivery.feeGrosze > 0) {
    out.push({
      key: "delivery",
      label: t("Dostawa pod adres w Warszawie", "Delivery to an address in Warsaw"),
      amountGrosze: delivery.feeGrosze,
      unit: "per_rental",
    });
  }

  const chopin = loc("airport");
  if (chopin) {
    out.push({
      key: "airport",
      label: t("Lotnisko Chopina", "Chopin Airport"),
      amountGrosze: chopin.feeGrosze,
      unit: "per_rental",
    });
  }

  out.push({
    key: "childSeat",
    label: t("Fotelik dziecięcy", "Child seat"),
    ...fees.childSeat,
  });
  out.push({
    key: "extraDriver",
    label: t("Dodatkowy kierowca", "Additional driver"),
    ...fees.extraDriver,
  });
  out.push({
    key: "afterHours",
    label: t("Zwrot poza standardowymi godzinami", "Out-of-hours return"),
    ...fees.afterHours,
  });
  out.push({
    key: "protectionPackage",
    label: t("Pakiet ochronny", "Protection package"),
    ...fees.protectionPackage,
  });
  out.push({
    key: "noDeposit",
    label: t("Wynajem bez kaucji", "No-deposit option"),
    ...fees.noDeposit,
  });

  // Punkty zapowiedziane na końcu listy: klient ma wiedzieć, że są w planach,
  // i jednocześnie nie może ich dziś wybrać w rezerwacji.
  for (const l of locations) {
    if (l.active === false) {
      out.push({
        key: l.slug,
        label: pl ? l.name : l.nameEn,
        amountGrosze: l.feeGrosze,
        unit: "per_rental",
        comingSoon: true,
      });
    }
  }

  return out;
}

/**
 * When cars change hands.
 *
 * Offered as a fixed list of slots rather than a free time field so nobody can
 * request an 04:00 handover there is no one to staff. The list is generated
 * from these three numbers, and the server validates against the same list —
 * a hand-typed time that is not a slot is rejected.
 *
 * Times are local (Europe/Warsaw); they are handover information only and have
 * no part in the no-double-booking rule.
 */
export const HANDOVER = {
  openMinutes: 8 * 60, // 08:00
  closeMinutes: 20 * 60, // 20:00
  stepMinutes: 30,
  defaultPickup: "09:00",
  defaultReturn: "18:00",
} as const;

/** Every offered handover time, as `HH:MM`, in order. */
export function handoverSlots(): string[] {
  const out: string[] = [];
  for (
    let m = HANDOVER.openMinutes;
    m <= HANDOVER.closeMinutes;
    m += HANDOVER.stepMinutes
  ) {
    out.push(
      `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`,
    );
  }
  return out;
}

/** Booking rules (server-enforced). */
export const BOOKING_RULES = {
  minDays: 1,
  maxDays: 90,
  /** How far ahead a booking may start. */
  maxLeadDays: 365,
  /**
   * `minAge` used to live here, at 21, with a comment saying "adjust per client
   * policy" — a placeholder that had been refusing reservations for months
   * without anyone having approved it. It is now a company rule with three
   * classes of car behind it: Admin → Zasady wynajmu, read through
   * `limitsForClass` and applied by `checkDriverEligibility`.
   *
   * The values left here are not business rules anybody has to approve — how
   * long a rental may run and how far ahead it may start are limits of the
   * system, not policy.
   */
} as const;
