/**
 * What state a car is in RIGHT NOW — one definition, every surface.
 *
 * ## There is no new status system here, and there must not be one
 *
 * The five states below already existed: the operator has been reading them off
 * the dashboard calendar since it was built. What did not exist was a way for
 * the public site to ask the same question, so the answer got copied. This file
 * is that copy being deleted before it is written.
 *
 * There is deliberately **no `public_status`, no `display_status`, no
 * `card_status`** column and no admin field that sets one. Nothing about a car's
 * state is typed twice. `cars.status` (four values: available / rented /
 * service / damaged) says whether a unit may be rented at all; the reservations
 * and the availability blocks say what is happening to it today; and the
 * precedence in `resolveFleetState` turns those facts into the one word a human
 * reads. Change a reservation and every surface changes with it, because none
 * of them holds an opinion of its own.
 *
 * ## Precedence, and why it is in one function
 *
 * A car in the garage is in the garage even if a reservation exists for it, so
 * `service` wins over everything. Then "out today", then "blocked today", then
 * "goes out soon". Each answers a different question and only the first true one
 * is worth showing. That order was written twice in `lib/admin/dashboard` — once
 * for the status list and once for the calendar — and two copies of a precedence
 * is how a third surface ends up with a fourth opinion.
 *
 * What feeds `reserved` is left to the caller, because the two admin views
 * genuinely ask different questions of it (the list means "goes out within a
 * fortnight", the calendar means "a pending request covers this square"). The
 * ORDER is what must never differ, and the order is here.
 *
 * ## Today's state is NOT availability for a customer's dates
 *
 * Nothing in this file may be used to answer "can I have this car on the 12th".
 * A car that is `available` today can be fully booked next week, and a car that
 * is `rented` today is very likely free next month. That question belongs to the
 * Availability Engine (`lib/booking/availability`) and has exactly one answer
 * there. See `§36–38` of the brief and the comment on `PublicModelState`.
 *
 * No `server-only` here on purpose: the labels and colours are needed inside
 * client components (the saved list, the comparison table), and the precedence
 * is pure arithmetic over booleans that both sides should be able to run.
 */

export type FleetState =
  "available" | "rented" | "reserved" | "blocked" | "service";

/** The five states in the operator's own order, for legends and tests. */
export const FLEET_STATES: readonly FleetState[] = [
  "available",
  "rented",
  "reserved",
  "blocked",
  "service",
] as const;

/** The facts a state is derived from. Every one of them comes from the database. */
export type FleetStateFacts = {
  /** `cars.status` is `service` or `damaged` — the unit is off the road. */
  inGarage: boolean;
  /** A confirmed or completed reservation covers the day in question. */
  rented: boolean;
  /** An internal availability block covers the day in question. */
  blocked: boolean;
  /** Spoken for, but not yet gone — what that means is the caller's decision. */
  reserved: boolean;
};

/** THE precedence. The only place this order is written. */
export function resolveFleetState(f: FleetStateFacts): FleetState {
  if (f.inGarage) return "service";
  if (f.rented) return "rented";
  if (f.blocked) return "blocked";
  if (f.reserved) return "reserved";
  return "available";
}

/**
 * How good a state is for somebody who wants this car, best first.
 *
 * Used to fold several physical units into the one line a model's card shows.
 * A model with four RAV4s where one is free is an available RAV4 — reporting
 * "SERWIS" because a different unit is in the garage would be true of a car the
 * customer was never going to be given and false of the offer in front of them.
 */
const MODEL_RANK: Record<FleetState, number> = {
  available: 0,
  reserved: 1,
  rented: 2,
  blocked: 3,
  service: 4,
};

/**
 * One line for a model, from the states of its units.
 *
 * Returns null for a model with no units at all — the card then shows no status
 * rather than inventing one, which is the same rule as an unpriced car showing
 * a sentence instead of "0 zł".
 */
export function pickModelState(
  units: readonly FleetState[],
): FleetState | null {
  if (units.length === 0) return null;
  return units.reduce((best, s) =>
    MODEL_RANK[s] < MODEL_RANK[best] ? s : best,
  );
}

/**
 * What a model's card shows, and what a card must NOT conclude from it.
 *
 * `state` is today. `freeForDates` is the Availability Engine's answer for the
 * dates the visitor actually typed, and it is `null` when they have not typed
 * any. Where both exist, **the dates win** — a green dot beside "unavailable for
 * your dates" is the one combination that would send somebody into a booking
 * that cannot be accepted.
 */
export type PublicModelState = {
  state: FleetState;
  freeForDates: boolean | null;
};

/* ── Presentation ─────────────────────────────────────────────────────────── */

/**
 * The colour tokens, defined per theme in `globals.css`.
 *
 * One token drives BOTH the dot and the words — §30 asks for the whole label to
 * carry the colour, not just the mark beside it, and two class names for one
 * colour is how the mark and the word end up disagreeing after a redesign.
 *
 * They are themed rather than fixed because no single colour clears 4.5:1
 * against both #000000 and #ffffff: the window of luminance that does is about
 * one percent wide, which is not enough room for five distinguishable hues. The
 * per-theme values are checked against the page background AND the card surface
 * in both themes.
 */
export const FLEET_STATE_TEXT: Record<FleetState, string> = {
  available: "text-status-available",
  rented: "text-status-rented",
  reserved: "text-status-reserved",
  blocked: "text-status-blocked",
  service: "text-status-service",
};

/**
 * Ten sam komplet stanów, w barwach, które NIE zmieniają się z motywem —
 * do napisu leżącego na fotografii. Powód i pomiary: `globals.css`.
 */
export const FLEET_STATE_TEXT_ON_MEDIA: Record<FleetState, string> = {
  available: "text-status-media-available",
  rented: "text-status-media-rented",
  reserved: "text-status-media-reserved",
  blocked: "text-status-media-blocked",
  service: "text-status-media-service",
};

export const FLEET_STATE_DOT_ON_MEDIA: Record<FleetState, string> = {
  available: "bg-status-media-available",
  rented: "bg-status-media-rented",
  reserved: "bg-status-media-reserved",
  blocked: "bg-status-media-blocked",
  service: "bg-status-media-service",
};

export const FLEET_STATE_DOT: Record<FleetState, string> = {
  available: "bg-status-available",
  rented: "bg-status-rented",
  reserved: "bg-status-reserved",
  blocked: "bg-status-blocked",
  service: "bg-status-service",
};

/**
 * What a customer is told, in each language.
 *
 * `blocked` is the one place the two locales are not translations of each other,
 * and that is deliberate: the Polish side of this business says "zablokowany"
 * about a car it has taken out of circulation, while an English-speaking visitor
 * reading "BLOCKED" would reasonably wonder what they had done wrong.
 * "UNAVAILABLE" is the same fact told from the customer's side. Requested
 * verbatim in §30.
 *
 * Held as a plain locale switch rather than next-intl keys for the same reason
 * `priceOnRequestLabel` is: the chat widget and the comparison table have no
 * translation scope, and a status that reads differently in two places is worse
 * than one that is not translated at all.
 */
export function fleetStateLabel(state: FleetState, locale: string): string {
  const en = locale === "en";
  switch (state) {
    case "available":
      return en ? "Available" : "Dostępny";
    case "rented":
      return en ? "Rented" : "Wynajęty";
    case "reserved":
      return en ? "Reserved" : "Zarezerwowany";
    case "blocked":
      return en ? "Unavailable" : "Zablokowany";
    case "service":
      return en ? "Service" : "Serwis";
  }
}

/** "Niedostępny w wybranym terminie" — the dates' answer, which outranks today's. */
export function unavailableForDatesLabel(locale: string): string {
  return locale === "en"
    ? "Unavailable for selected dates"
    : "Niedostępny w wybranym terminie";
}

/** "Dostępny w wybranym terminie" — the same sentence, the other way. */
export function availableForDatesLabel(locale: string): string {
  return locale === "en"
    ? "Available for selected dates"
    : "Dostępny w wybranym terminie";
}

/* ── Słownik sprzedażowy ──────────────────────────────────────────────────── */

/*
  DWA SŁOWNIKI NA JEDEN STAN — i dlaczego to nie jest drugie źródło prawdy.

  `resolveFleetState` zostaje jedyną regułą, która mówi, CO SIĘ DZIEJE
  z samochodem. Nic poniżej jej nie zmienia, nie obchodzi i nie powiela —
  wszystko tutaj tłumaczy jej odpowiedź na zdanie, które ma sens dla klienta.

  Powód jest zmierzony. 04.09.2026 sześć z jedenastu aut na stronie głównej
  pokazywało klientowi „Zablokowany". Słowo opisuje DZISIAJ i jest prawdziwe,
  ale klient czyta je jako „tego auta nie da się wynająć" — a formularz przyjmie
  rezerwację tego samego auta na przyszły tydzień. Etykieta mówiła więc prawdę
  o flocie i nieprawdę o ofercie.

  Operator dalej widzi „Zablokowany", „Wynajęty" i „Zarezerwowany" — panel ma
  własne napisy i nie przechodzi tędy (`fleetStateLabel` zostaje nietknięte
  i nadal opisuje stan techniczny). Rozdzielone są WYŁĄCZNIE dwa opisy tego
  samego faktu, nie dwa źródła faktu.

  CZEGO TU NIE MA I BYĆ NIE MOŻE: liczenia dat. Data w napisie „Dostępny od…"
  pochodzi wyłącznie z `getNextFreeDayByModel`, czyli z tego samego predykatu,
  którym silnik wydaje samochód. Gdy jej nie ma, zdanie jest inne — nigdy
  zmyślone.
*/

/** Co klient ma usłyszeć. Pięć stanów technicznych → cztery zdania. */
export type SalesTone =
  | "available"
  /** Wolny, ale nie dziś — mamy prawdziwą datę z silnika dostępności. */
  | "fromDate"
  /** Dziś zajęty, a najbliższego wolnego dnia nie znamy. */
  | "check"
  /** W oknie wyszukiwania nie ma ani jednego wolnego dnia. */
  | "unavailable"
  /** Serwis zostaje osobnym, rzeczywistym stanem — §ETAP1.1. */
  | "service";

/**
 * Barwa zdania sprzedażowego.
 *
 * Świadomie NIE wprowadza nowych tokenów: pięć istniejących kolorów ma
 * zmierzony kontrast w obu motywach i na fotografii, a szósty trzeba by mierzyć
 * od nowa. Zmienia się przypisanie, nie paleta.
 *
 *   fromDate → `reserved` (pomarańcz)  — „idzie", nie „zepsute"
 *   check    → `rented` (błękit)       — informacja, nie ostrzeżenie
 *   unavail. → `blocked` (szarość)     — spokojne „nie", bez czerwieni
 */
export const SALES_TONE_STATE: Record<SalesTone, FleetState> = {
  available: "available",
  fromDate: "reserved",
  check: "rented",
  unavailable: "blocked",
  service: "service",
};

/** Krótka data na pigułce: „12.09". Nigdy nie liczona — zawsze podana. */
function shortDay(iso: string, locale: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "pl-PL", {
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(y, m - 1, d));
}

export type SalesStatusView = { tone: SalesTone; label: string };

/**
 * Jedno zdanie o dostępności, które klient czyta na karcie auta.
 *
 * @param state        stan na dziś z `resolveFleetState`, albo `null` gdy
 *                     operator wyłączył statusy publiczne
 * @param nextFreeDay  pierwszy wolny dzień z `getNextFreeDayByModel`
 *                     (`YYYY-MM-DD`), albo `null` gdy nieznany lub brak
 * @param today        dzisiejsza data `YYYY-MM-DD` — podawana, a nie liczona
 *                     tutaj, żeby serwer i przeglądarka nie mogły się rozminąć
 *                     o północy ani o strefę czasową
 */
export function salesStatusView(
  state: FleetState | null,
  nextFreeDay: string | null,
  today: string,
  locale: string,
): SalesStatusView | null {
  if (!state) return null;
  const en = locale === "en";

  // Serwis wygrywa ze wszystkim — auto stoi w warsztacie i żadna data tego nie
  // zmienia. To jest ten sam priorytet, co w `resolveFleetState`.
  if (state === "service") {
    return { tone: "service", label: en ? "Service" : "Serwis" };
  }

  // Wolny dziś — najprostszy przypadek i jedyny, który nie potrzebuje daty.
  // `nextFreeDay === today` łapie auto „zarezerwowane" (czyli wyjeżdżające
  // w ciągu dwóch tygodni), które DZIŚ stoi wolne: klient może je wziąć teraz.
  if (state === "available" || (nextFreeDay !== null && nextFreeDay <= today)) {
    return { tone: "available", label: en ? "Available" : "Dostępny" };
  }

  // Zajęty dziś, ale wolny od konkretnego dnia — i tylko wtedy pada data.
  if (nextFreeDay !== null) {
    return {
      tone: "fromDate",
      label: en
        ? `Available from ${shortDay(nextFreeDay, locale)}`
        : `Dostępny od ${shortDay(nextFreeDay, locale)}`,
    };
  }

  // Zajęty dziś i przez całe okno wyszukiwania — mówimy „nie", bez straszenia.
  if (nextFreeDay === null && state === "blocked") {
    return {
      tone: "unavailable",
      label: en ? "Currently unavailable" : "Aktualnie niedostępny",
    };
  }

  // Nie wiemy, kiedy się zwolni (brak danych z silnika albo model bez
  // egzemplarzy). Zdanie prawdziwe zawsze i zapraszające do sprawdzenia.
  return {
    tone: "check",
    label: en ? "Check availability" : "Sprawdź dostępność",
  };
}

/**
 * Kolejność sprzedażowa: najpierw to, co klient może wziąć.
 *
 * Niższa liczba = wyżej na siatce. Nie dotyka danych administratora ani
 * kolejności w panelu — to jest wyłącznie porządek wyświetlania publicznego.
 */
export const SALES_TONE_RANK: Record<SalesTone, number> = {
  available: 0,
  fromDate: 1,
  check: 2,
  unavailable: 3,
  service: 4,
};
