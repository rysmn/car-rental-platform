import "server-only";
import {
  normalize,
  parse,
  unservedLocationSlug,
  type Intent,
  type Locale,
  type Parsed,
} from "./nlu";
import { matchFaq } from "./faq";
import { detectDemand, isInFleet, type Demand } from "./demand";
import { mergeSlots, budgetAxes, hasBudget, statedBudget } from "./slots";
import {
  findAlternatives,
  findCars,
  findNearestToBudget,
  getCar,
  driverClassFor,
  getContact,
  getServiceHours,
  getExtras,
  getFaqEntries,
  getLocationOptions,
  getRentalRules,
  getVocabulary,
  locationSlugById,
  priceForDays,
  quoteFor,
} from "./data";
import {
  type ChatBlock,
  type ChatCar,
  type ChatProvider,
  type ChatReply,
  type ChatRequest,
  type ChatSlots,
} from "./types";
import { feeAmount } from "@/lib/booking/pricing";
import {
  limitKmDlaNajmu,
  limitKmNaDobe,
  nadprzebiegKm,
  oplataNadprzebiegGrosze,
} from "@/lib/booking/mileage";
import {
  tierAmountGrosze,
  tierForHours,
} from "@/lib/booking/cancellation";
import { formatPln, formatPlnDokladnie } from "@/lib/format";
import { getFleet } from "@/lib/fleet/repo";
import { getFeeCatalog } from "@/lib/booking/repo";
import { handoverSlots } from "@/lib/booking/fees";
import { getSetting } from "@/lib/admin/settings";
import {
  MIN_WYPRZEDZENIE_H,
  najwczesniejszyOdbior,
} from "@/lib/booking/lead-time";
import {
  ABROAD_RULE,
  documentsStatements,
  driverAgeSentence,
  driverClassesDiffer,
  driverLimitsSentence,
  effectiveDriverLimits,
} from "@/lib/admin/rental-rules";

/**
 * The assistant, implemented as rules over the existing data.
 *
 * Three commitments hold everywhere in this file, and they are the reason it is
 * safe to put in front of customers without a language model:
 *
 * 1. **It never states a number it did not read.** Every price, deposit,
 *    mileage limit and availability answer comes from `lib/chat/data`, which
 *    calls the same functions the booking form calls.
 *
 * 2. **When it is not sure, it asks.** The parser returns a confidence, and
 *    anything short of `confident` becomes a clarifying question. Slot-filling
 *    works the same way: no dates means "na jaki termin?", never a guess at the
 *    weekend.
 *
 * 3. **It cannot do what it must not do.** There is no code path from here to a
 *    write, to a customer record or to another reservation — not because a
 *    prompt forbids it, but because the data layer exposes no such function.
 *    `OUT_OF_SCOPE` is therefore a courtesy message, not the security control.
 */

/**
 * Which intent this turn is really about, when a question of ours is still open.
 *
 * ## The problem this replaces
 *
 * The rule used to be: while `awaiting` is set, anything short of a *confident*
 * parse is the answer to the parked question. That is right for the case it was
 * written for — "5" after "ilu pasażerów?" must be five people, not five days —
 * and wrong for everything else. A visitor who was asked about passengers and
 * instead typed "Ile kosztuje kaucja?" got "Ilu pasażerów będzie podróżować?"
 * back, because that sentence parses as `GET_DEPOSIT` with confidence `unsure`.
 * The same swallowed "Jakie dokumenty są potrzebne?" (`DOCUMENTS`) and "Czy mogę
 * pojechać do Niemiec?" (`ABROAD`) — the two approved rules the assistant most
 * needs to be able to state.
 *
 * ## Why the fix is not a confidence or score threshold
 *
 * Measured on the live vocabulary before choosing this rule:
 *
 *     "5 osób"                    FIND_CAR      score  8   confident
 *     "na lotnisku Chopina"       AIRPORT       score 14   confident
 *     "Can I drive to Germany?"   ABROAD        score  8   confident
 *     "How much is the deposit?"  GET_DEPOSIT   score  6   unsure
 *
 * The answers score as high as the interruptions, and higher. No threshold on
 * strength separates them, because strength is not what differs.
 *
 * ## What actually differs
 *
 * An answer CARRIES THE INFORMATION WE ASKED FOR. "5 osób" yields a seat count,
 * "jutro" a date, "Volvo XC60" a car, "na lotnisku Chopina" a pickup point. A
 * new question yields none of them — it names a topic instead.
 *
 * So: a message that contributes any concrete search slot continues the parked
 * flow. A message that contributes nothing, but does resolve to a real intent,
 * interrupts it. A message that contributes nothing and resolves to nothing —
 * a bare "5", a bare "tak" — cannot interrupt, and falls back to the parked
 * intent exactly as before.
 *
 * The interruption keeps the conversation's slots: `mergeSlots` clears only
 * `awaiting`, so the earlier search survives and the assistant does not re-ask
 * the parked question on its own. There is no loop to fall into.
 */
function resolveIntent(
  previous: ChatRequest["slots"],
  parsed: Parsed,
): Parsed["intent"] {
  if (!previous.awaiting) return parsed.intent;

  const e = parsed.entities;
  /** Did the visitor hand us a fact the flow was collecting? */
  const continuesFlow =
    e.seats !== null ||
    e.dateFrom !== null ||
    e.dateTo !== null ||
    e.days !== null ||
    e.carModelIds.length > 0 ||
    e.locationId !== null;

  if (continuesFlow) return previous.pendingIntent ?? parsed.intent;

  // Nothing for the flow. A recognised intent is therefore a new subject and
  // takes over; `UNKNOWN` is not a subject and leaves the parked one standing.
  if (parsed.intent !== "UNKNOWN") return parsed.intent;

  return previous.pendingIntent ?? parsed.intent;
}

/** Tiny locale helper — the panel is two languages, not a translation system. */
const t = (locale: Locale, pl: string, en: string) =>
  locale === "en" ? en : pl;

const money = (grosze: number, locale: Locale) =>
  formatPln(grosze, locale === "en" ? "en" : "pl");

/**
 * Kwota Z GROSZAMI — dla stawki za kilometr i tylko dla niej.
 *
 * `money` zaokrągla, bo zaokrągla `formatPln`, i dla całego cennika jest to
 * właściwe. Przy stawce za kilometr było błędem widocznym gołym okiem:
 * zmierzone na kopii 01.09.2026 asystent odpowiadał „BMW 740d xDrive: (…)
 * każdy kilometr ponad limit: 5 zł/km. Przy 1000 km to 100 km ponad limit,
 * czyli 450 zł dopłaty" — czyli w jednym zdaniu podawał stawkę, która nie
 * mnoży się do własnego wyniku. Panamera (5,00) i BMW (4,50) wyglądały przy
 * tym identycznie.
 */
const stawkaZaKm = (grosze: number, locale: Locale) =>
  formatPlnDokladnie(grosze, locale === "en" ? "en" : "pl");

const text = (s: string): ChatBlock => ({ kind: "text", text: s });

/**
 * How many cars an answer may show when the customer asked to SEE cars.
 *
 * Deliberately above the size of the fleet. The old value was three, chosen
 * when the assistant was expected to recommend rather than to list, and it was
 * behind two separate complaints: "Zobacz flotę" showing a third of the fleet,
 * and a search for an SUV showing three of them as though there were no more.
 * A limit that the fleet cannot reach still bounds the reply — the fleet does
 * — while never being the reason a car is missing from it.
 */
const FULL_OFFER_LIMIT = 50;

/** "1 auto", "2 auta", "5 aut" — Polish counts cars in three shapes. */
function carsWordPl(n: number): string {
  const last = n % 10;
  const teen = n % 100 >= 12 && n % 100 <= 14;
  if (n === 1) return "auto";
  return !teen && last >= 2 && last <= 4 ? "auta" : "aut";
}

/**
 * "Minimalny wiek…" → "minimalny wiek…", for sentences pasted after a car name.
 * Only the first character, and only when it is a letter — a sentence starting
 * with a number ("21 lat…") must not be touched.
 */
const lowerFirst = (s: string): string =>
  s.charAt(0).toLocaleLowerCase("pl-PL") + s.slice(1);

/** The quick actions shown on the greeting and after a dead end. */
function mainMenu(locale: Locale): ChatBlock {
  return {
    kind: "quick",
    options: [
      {
        label: t(locale, "🚘 Znajdź samochód", "🚘 Find a car"),
        value: t(locale, "znajdź samochód", "find a car"),
      },
      {
        label: t(locale, "📅 Sprawdź dostępność", "📅 Check availability"),
        value: t(locale, "sprawdź dostępność", "check availability"),
      },
      {
        label: t(locale, "💰 Sprawdź cenę", "💰 Check price"),
        value: t(locale, "sprawdź cenę", "check price"),
      },
      {
        label: t(locale, "🚗 Zobacz flotę", "🚗 See the fleet"),
        value: t(locale, "pokaż flotę", "show the fleet"),
      },
      {
        label: t(locale, "✈️ Lotnisko", "✈️ Airport"),
        value: t(locale, "wynajem na lotnisku", "airport rental"),
      },
      {
        label: t(locale, "🏢 Dla firm", "🏢 For business"),
        value: t(locale, "wynajem dla firmy", "business rental"),
      },
      {
        label: t(locale, "💬 Pracownik", "💬 Talk to a person"),
        value: t(locale, "porozmawiaj z pracownikiem", "talk to a person"),
      },
    ],
  };
}

/**
 * Labels for the facets a card lists — body, shelf and the two derived ones.
 *
 * One map for all of them because a card shows them in one row; they are still
 * separate axes everywhere it matters, and `lib/fleet/segments` is what keeps
 * them separate.
 */
const SEGMENT_LABEL: Record<string, { pl: string; en: string }> = {
  suv: { pl: "SUV", en: "SUV" },
  mini: { pl: "Mini", en: "Mini" },
  economy: { pl: "Ekonomiczny", en: "Economy" },
  compact: { pl: "Kompakt", en: "Compact" },
  intermediate: { pl: "Średni", en: "Intermediate" },
  estate: { pl: "Kombi", en: "Estate" },
  convertible: { pl: "Kabriolet", en: "Convertible" },
  van: { pl: "Bus / Van", en: "Van" },
  business: { pl: "Business", en: "Business" },
  executive: { pl: "Executive", en: "Executive" },
  luxury: { pl: "Luxury", en: "Luxury" },
  "premium-suv": { pl: "SUV premium", en: "Premium SUV" },
  electric: { pl: "Elektryczne", en: "Electric" },
};

const FUEL_LABEL: Record<string, { pl: string; en: string }> = {
  petrol: { pl: "benzyna", en: "petrol" },
  diesel: { pl: "diesel", en: "diesel" },
  hybrid: { pl: "hybryda", en: "hybrid" },
  electric: { pl: "elektryczny", en: "electric" },
};

const GEARBOX_LABEL: Record<string, { pl: string; en: string }> = {
  automatic: { pl: "automat", en: "automatic" },
  manual: { pl: "manualna", en: "manual" },
};

const label = (
  map: Record<string, { pl: string; en: string }>,
  key: string,
  locale: Locale,
) => map[key]?.[locale === "en" ? "en" : "pl"] ?? key;

/* ── Small builders ───────────────────────────────────────────────────────── */

/**
 * The date picker, as a block — the single mechanism every path uses.
 *
 * Two states, one kind. Without a range it is the invitation: shortcut chips
 * and a button that opens the calendar. With one it is the receipt — the dates
 * the assistant is working with, and a way to change them. Handlers never build
 * this by hand, so "offer a calendar" cannot drift into six slightly different
 * offers.
 */
/**
 * Zdanie o minimum trzech godzinach — TYLKO gdy rozmowa dotyczy dzisiaj.
 *
 * ## Dlaczego asystent w ogóle musi to mówić
 *
 * Klient piszący „potrzebuję auta za godzinę" dostawał odpowiedź o dostępności
 * i cenie, jakby termin był możliwy. Reguła trzech godzin działała w formularzu
 * i na serwerze, więc rezerwacja i tak by nie przeszła — ale klient dowiadywał
 * się o tym dopiero po wypełnieniu ośmiu pól. To jest ta sama krzywda co
 * przycisk prowadzący donikąd, tylko dłuższa.
 *
 * ## Skąd bierze liczbę
 *
 * Z `lib/booking/lead-time.ts`, przez `najwczesniejszyOdbior` — tej samej
 * funkcji używa formularz. Asystent NIE MA własnej kopii reguły i nie wolno mu
 * jej dać: dwie liczby trzy w dwóch plikach to jedna liczba, która kiedyś
 * zostanie zmieniona, i druga, która zostanie.
 *
 * ## Kiedy milczy
 *
 * Gdy termin jest inny niż dzisiejszy — bo wtedy reguła nie ma nic do
 * powiedzenia, a zdanie o minimum przy rezerwacji na przyszły tydzień brzmi
 * jak przeszkoda tam, gdzie jej nie ma. Zamówienie mówi o tym wprost:
 * „za 4 godziny" ma NIE być blokowane, więc i nie ma być komentowane.
 */
function notatkaOMinimum(
  locale: Locale,
  dateFrom: string | null,
  teraz: number = Date.now(),
): ChatBlock | null {
  if (!dateFrom) return null;
  const najw = najwczesniejszyOdbior(handoverSlots(), teraz);
  // Rozmowa o innym dniu niż dzisiejszy — reguła nie ma tu zastosowania.
  if (dateFrom !== czescDniaWarszawska(teraz)) return null;

  const godzina = najw.slot;
  if (!godzina) {
    return {
      kind: "text",
      text: t(
        locale,
        `Samochód można odebrać najwcześniej ${MIN_WYPRZEDZENIE_H} godziny od chwili rezerwacji, a dziś nie ma już takiej godziny w naszych godzinach wydań. Najbliższy możliwy odbiór jest jutro.`,
        `A car can be collected no sooner than ${MIN_WYPRZEDZENIE_H} hours from booking, and there is no such slot left today within our handover hours. The earliest pickup is tomorrow.`,
      ),
    };
  }
  const dzis = najw.slotDzisiaj;
  return {
    kind: "text",
    text: t(
      locale,
      `Najwcześniejszy możliwy odbiór samochodu jest za ${MIN_WYPRZEDZENIE_H} godziny — ${dzis ? `dziś od ${godzina}` : `jutro od ${godzina}`}. Wcześniejszej godziny nie da się wybrać.`,
      `The earliest vehicle pickup is ${MIN_WYPRZEDZENIE_H} hours from now — ${dzis ? `today from ${godzina}` : `tomorrow from ${godzina}`}. An earlier time cannot be selected.`,
    ),
  };
}

/** `YYYY-MM-DD` chwili w czasie warszawskim — ta sama strefa, co reguła. */
function czescDniaWarszawska(chwila: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(chwila));
}

function datesBlock(
  locale: Locale,
  from: string | null,
  to: string | null,
  openLabel?: string,
): ChatBlock {
  const known = Boolean(from && to);
  return {
    kind: "dates",
    from: known ? from : null,
    to: known ? to : null,
    openLabel:
      openLabel ??
      (known
        ? t(locale, "📅 Zmień termin", "📅 Change dates")
        : t(locale, "📅 Wybierz daty", "📅 Choose dates")),
    // Named, not dated: the widget resolves them against the visitor's own
    // clock. Suppressed once a range is known — there is nothing to shortcut.
    shortcuts: known ? [] : ["today", "tomorrow", "weekend", "next_weekend"],
  };
}

/** Remember what to redo if the customer changes the dates. */
function withDateIntent(slots: ChatSlots, intent: Intent): ChatSlots {
  return { ...slots, dateIntent: intent };
}

function askDates(locale: Locale, slots: ChatSlots): ChatReply {
  const intent = slots.pendingIntent ?? "FIND_CAR";
  return {
    blocks: [
      text(
        t(
          locale,
          "Na jaki termin potrzebujesz samochodu? Wybierz daty w kalendarzu — albo po prostu je napisz, na przykład „20–25 sierpnia”.",
          "What dates do you need the car for? Pick them in the calendar — or simply type them, for example “20–25 August”.",
        ),
      ),
      datesBlock(locale, null, null),
    ],
    slots: { ...withDateIntent(slots, intent), awaiting: "dates" },
    locale,
    intent,
    unanswered: false,
    handoff: false,
  };
}

function askSeats(locale: Locale, slots: ChatSlots): ChatReply {
  return {
    blocks: [
      text(
        t(
          locale,
          "Chętnie pomogę. Ilu pasażerów będzie podróżować?",
          "Happy to help. How many passengers will be travelling?",
        ),
      ),
      {
        kind: "quick",
        options: ["2", "4", "5", "7", "9"].map((n) => ({
          label: t(locale, `${n} osób`, `${n} people`),
          value: t(locale, `${n} osób`, `${n} people`),
        })),
      },
    ],
    slots: { ...slots, awaiting: "seats" },
    locale,
    intent: "FIND_CAR",
    unanswered: false,
    handoff: false,
  };
}

async function askWhichCar(
  locale: Locale,
  slots: ChatSlots,
  intent: Intent,
): Promise<ChatReply> {
  const cars = await findCars({ limit: 6 }, locale);
  return {
    blocks: [
      text(t(locale, "O który samochód chodzi?", "Which car do you mean?")),
      {
        kind: "quick",
        options: cars.map((c) => ({ label: c.name, value: c.name })),
      },
    ],
    slots: { ...slots, awaiting: "which_car", pendingIntent: intent },
    locale,
    intent,
    unanswered: false,
    handoff: false,
  };
}

/**
 * The hour the customer named, in minutes past midnight, or `null`.
 *
 * Two shapes, both of which people type: a clock ("23:30", "o 2:00") and a
 * spoken hour with a part of the day ("o 2 w nocy", "at 2 at night"). The
 * second needs the part of the day to be read too — "o 2" alone is as likely to
 * be a date or a headcount as an hour, and guessing there would answer a
 * question nobody asked.
 */
function statedHour(raw: string, normalized: string): number | null {
  // The clock comes off the raw text — `normalize` turns "23:30" into "23 30".
  const clock = raw.toLowerCase().match(/\b([01]?\d|2[0-4])[:.]([0-5]\d)\b/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);

  // "at 2 am" / "11 pm" — same question, other language.
  const ampm = normalized.match(/\b(\d{1,2})\s?(am|pm)\b/);
  if (ampm) {
    const h = Number(ampm[1]) % 12;
    return (ampm[2] === "pm" ? h + 12 : h) * 60;
  }

  const spoken = normalized.match(
    /\bo (\d{1,2}) (w nocy|nad ranem|rano|wieczorem|po poludniu)\b/,
  );
  if (spoken) {
    const h = Number(spoken[1]);
    const part = spoken[2];
    if (part === "w nocy" || part === "nad ranem") return (h % 12) * 60;
    if (part === "rano") return h * 60;
    // Afternoon and evening: 8 wieczorem is 20:00, 12 w południe stays 12.
    return ((h % 12) + 12) * 60;
  }
  return null;
}

/**
 * Is that hour inside the telephone window?
 *
 * Read back out of the copy rather than passed separately, so there is exactly
 * one place the window is defined. `24:00` is midnight at the END of the day —
 * 1440 minutes — which is why this counts in minutes rather than comparing
 * strings.
 */
function withinPhoneWindow(minutes: number, hours: { phone: string }): boolean {
  const [from, to] = hours.phone.split("–");
  const toMinutes = (v: string) => {
    const [h, m] = v.split(":").map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
  };
  const open = toMinutes(from ?? "");
  const close = toMinutes(to ?? "");
  if (open === null || close === null) return true;
  return open <= close
    ? minutes >= open && minutes < close
    : minutes >= open || minutes < close;
}

/** The line under a car list that tells the truth about what was checked. */
/**
 * "Tell me what you're after" — asked once, and only after a dead end.
 *
 * The instruction this implements is a negative one: the assistant must not
 * become a questionnaire. So this is never called on a path that is going well.
 * It fires where the conversation has already failed to produce a car — a model
 * A&A does not own, no match for the criteria, nothing free for the dates — and
 * where the realistic alternative is the visitor closing the panel. Once per
 * conversation, enforced by `slots.nudged`, because the second time it is asked
 * it stops being help and starts being an obstacle.
 */
function askWhatTheyWant(locale: Locale): ChatBlock[] {
  return [
    text(
      t(
        locale,
        "Nie widzisz odpowiedniego samochodu? Napisz, jakiego auta szukasz — model, segment albo liczbę miejsc. Postaram się znaleźć najlepszą alternatywę.",
        "Not seeing the right car? Tell me what you are looking for — a model, a class, or how many seats. I will find the closest alternative.",
      ),
    ),
  ];
}

/** The locale a reply was written in. */
function locale(reply: ChatReply): Locale {
  return reply.locale;
}

/**
 * Where "the most expensive car you have" may be answered from the price list.
 *
 * Wider than `isCarSeeking` by exactly one intent: the question is shaped like
 * a general enquiry and scores `FAQ`, which is how it came to be refused with
 * "nie mam pewnej informacji" — about our own cars and our own published rates.
 * Everything narrower than this stays out: a superlative inside an emergency,
 * a refusal or a rule question is not a request for a car.
 */
function isPriceableIntent(intent: Intent): boolean {
  return isCarSeeking(intent) || intent === "FAQ";
}

/** Is this a message about choosing a car at all? */
function isCarSeeking(intent: Intent): boolean {
  return (
    intent === "FIND_CAR" ||
    intent === "CHECK_AVAILABILITY" ||
    intent === "GET_PRICE" ||
    intent === "COMPARE_CARS" ||
    intent === "START_BOOKING" ||
    intent === "BROWSE_FLEET" ||
    intent === "UNKNOWN"
  );
}

function availabilityNote(locale: Locale, checked: boolean): string {
  return checked
    ? t(
        locale,
        "Powyższe auta są wolne w podanym terminie — sprawdzone przed chwilą w systemie rezerwacji.",
        "These cars are free for your dates — checked just now against the reservation system.",
      )
    : t(
        locale,
        "Ceny „od” dotyczą najdłuższego wynajmu. Podaj termin, a sprawdzę dostępność i policzę dokładną cenę.",
        "“From” prices apply to the longest rentals. Give me dates and I will check availability and calculate the exact price.",
      );
}

/* ── The provider ─────────────────────────────────────────────────────────── */

/**
 * What the operator has switched on in the admin panel.
 *
 * These used to be six checkboxes that saved and did nothing — the worst kind
 * of setting, because it teaches an operator that the panel lies. They now
 * gate the router below.
 *
 * What they deliberately CANNOT do is turn off a safety rule. There is no flag
 * for "may quote a made-up price" or "may skip the refusal check", because a
 * checkbox that can be ticked at two in the morning is not where a limit
 * belongs.
 */
export type ChatCapabilities = {
  faq: boolean;
  offer: boolean;
  availability: boolean;
  prices: boolean;
  startBooking: boolean;
  handoff: boolean;
};

export const ALL_CAPABILITIES: ChatCapabilities = {
  faq: true,
  offer: true,
  availability: true,
  prices: true,
  startBooking: true,
  handoff: true,
};

/** Which switch governs which intent. Absent = always allowed. */
const INTENT_CAPABILITY: Partial<Record<Intent, keyof ChatCapabilities>> = {
  FAQ: "faq",
  FIND_CAR: "offer",
  COMPARE_CARS: "offer",
  AIRPORT: "offer",
  LONG_TERM: "offer",
  B2B: "offer",
  CHECK_AVAILABILITY: "availability",
  GET_PRICE: "prices",
  GET_DEPOSIT: "prices",
  GET_MILEAGE_LIMIT: "faq",
  OPENING_HOURS: "faq",
  START_BOOKING: "startBooking",
  CONTACT_HUMAN: "handoff",
};

/**
 * Nazwy miejsc, których nie obsługujemy, w obu językach.
 *
 * Trzymane tutaj, a nie w `nlu.ts`: tam mieszka rozpoznawanie, tutaj mówienie
 * do klienta. Slug bez wpisu w tej tabeli nie wywoła żadnego dopisku — lepiej
 * milczeć niż nazwać miejsce po slugu.
 */
const UNSERVED_PLACE_LABEL: Record<
  string,
  { pl: string; en: string; soon?: boolean }
> = {
  "airport-modlin": { pl: "Lotnisko Modlin", en: "Warsaw Modlin Airport" },
  /*
   * Gdańsk, decyzja właściciela z 26.08.2026: punkt ZAPOWIEDZIANY, nie
   * obsługiwany. Wiersz w `pickup_locations` zostaje, ale ma `active = false`,
   * więc nie da się go wybrać w rezerwacji — a asystent ma o nim mówić
   * „wkrótce", a nie udawać, że takiego miasta nie ma.
   *
   * Modlin i Gdańsk to DWIE różne odpowiedzi, dlatego jest tu `soon`:
   * Modlinu nie planujemy, Gdańsk jest w planach. Zdanie „nie jest naszym
   * punktem odbioru" jest prawdziwe o obu, ale o Gdańsku jest niepełne.
   */
  "airport-gdansk": { pl: "Lotnisko Gdańsk", en: "Gdańsk Airport", soon: true },
};

/**
 * Jedno zdanie o miejscu, którego nie obsługujemy — w JEDNYM miejscu.
 *
 * Powód, dla którego to jest funkcja, a nie tekst wpisany tam, gdzie potrzebny:
 * przez chwilę na produkcji istniały dwa niezależne mechanizmy na to samo
 * pytanie — ręczna lista miast w `airport()` (od `ab8d988`) i dopisek etapu
 * 44A po `LOCATION_ALIASES`. Pokrywały się dokładnie na Modlinie i klient
 * dostawał dwa komunikaty, które sobie PRZECZYŁY: „również pod Lotnisko
 * Modlin" tuż nad „nie dowozimy tam aut".
 *
 * 31.08.2026 właściciel rozstrzygnął to w drugą stronę: pod Modlin NIE
 * dowozimy. Zdanie proponuje więc odbiór na Chopina albo dostawę pod adres,
 * ale już nie wskazuje tego lotniska jako celu dostawy.
 *
 * Zwracamy `null` dla slugu bez etykiety: lepiej milczeć niż nazwać miejsce
 * po slugu.
 */
function unservedPlaceSentence(slug: string, locale: Locale): string | null {
  const label = UNSERVED_PLACE_LABEL[slug];
  if (!label) return null;
  if (label.soon) {
    return locale === "pl"
      ? `${label.pl} będzie dostępne wkrótce — dziś nie da się go jeszcze wybrać przy rezerwacji. Mogę zaproponować odbiór na Lotnisku Chopina albo dostawę pod wskazany adres; dostawa jest płatna według cennika.`
      : `${label.en} is coming soon — it cannot be selected when booking yet. I can offer pickup at Warsaw Chopin Airport, or delivery to an address you choose; delivery is charged per the price list.`;
  }
  return locale === "pl"
    ? `${label.pl} nie jest naszym punktem odbioru i nie podstawiamy tam aut. Mogę zaproponować odbiór na Lotnisku Chopina albo dostawę pod wskazany adres; dostawa jest płatna według cennika.`
    : `${label.en} is not one of our pickup points and we do not deliver cars there. I can offer pickup at Warsaw Chopin Airport, or delivery to an address you choose; delivery is charged per the price list.`;
}

export class DeterministicProvider implements ChatProvider {
  readonly id = "deterministic" as const;

  constructor(private readonly can: ChatCapabilities = ALL_CAPABILITIES) {}

  async respond(request: ChatRequest): Promise<ChatReply> {
    const vocab = await getVocabulary();
    const today = new Date();
    const parsed = parse(request.message, vocab, today, request.locale);
    return this.respondWith(request, parsed);
  }

  /**
   * Answer using a reading of the message that somebody else produced.
   *
   * This is the seam the AI layer plugs into: a language model is just another
   * implementation of `parse()`, and everything downstream — slot merging,
   * routing, and every handler that fetches a real price or a real
   * availability — is the same code either way. That is what keeps the promise
   * that AI cannot become a source of business data: it never gets to answer,
   * only to say what the customer meant.
   */
  async respondWith(request: ChatRequest, parsed: Parsed): Promise<ChatReply> {
    const reply = await this.respondCore(request, parsed);
    return this.dopiszMinimum(await this.noteUnservedPlace(parsed, reply));
  }

  /**
   * Dopisek o miejscu, którego nie obsługujemy.
   *
   * Siedzi w opakowaniu `respondWith`, a nie w którymś z kilkunastu handlerów,
   * bo pytanie „czy klient nazwał miejsce, którego nie mamy" jest niezależne od
   * tego, o co pytał — a każdy handler z osobna zapomniałby o nim inaczej.
   * Opakowanie łapie też ścieżkę AI, która wchodzi tym samym wejściem.
   *
   * Dopisek IDZIE NA POCZĄTEK odpowiedzi. Klient prosił o zmianę miejsca; jeśli
   * sprostowanie wyląduje pod listą aut, przeczyta je co dziesiąty.
   *
   * Nie zgadujemy, co zrobić zamiast — proponujemy dostawę pod adres, bo to
   * jedyna opcja, która realnie dowozi auto tam, gdzie klient chce, i jest
   * w cenniku. Czy A&A ma otworzyć Modlin jako osobny punkt z własną opłatą,
   * to decyzja właściciela, nie asystenta.
   */
  /**
   * Dopisz zdanie o minimum trzech godzinach, gdy rozmowa dotyczy DZISIAJ.
   *
   * ## Dlaczego w opakowaniu, a nie w handlerach
   *
   * `datesBlock` woła osiemnaście miejsc w tym pliku. Dopisanie notatki
   * w każdym z nich znaczyłoby osiemnaście okazji do pominięcia jednego —
   * i pominięty byłby zawsze ten, którego nikt nie testuje. Tutaj jest jedno
   * miejsce, przez które przechodzi KAŻDA odpowiedź, i ta sama metoda, którą
   * projekt zastosował już dla nieobsługiwanych miejscowości tuż niżej.
   *
   * ## Kiedy milczy
   *
   * Gdy w rozmowie nie ma daty, gdy data jest inna niż dzisiejsza, i gdy
   * odpowiedź takiej notatki już nie potrzebuje, bo nie dotyczy terminu.
   * „Za cztery godziny" ma NIE być blokowane — więc i nie jest komentowane.
   *
   * Nie zmienia ani jednego bloku, który już powstał: dokłada zdanie na końcu.
   * Odpowiedź, która by się przez to zdublowała, jest odsiewana porównaniem
   * treści — asystent nie ma powtarzać tego samego dwa razy w jednej turze.
   */
  private dopiszMinimum(reply: ChatReply): ChatReply {
    const dzien = reply.slots?.dateFrom ?? null;
    const notatka = notatkaOMinimum(reply.locale ?? "pl", dzien);
    if (!notatka) return reply;
    const juzJest = reply.blocks.some(
      (b) => b.kind === "text" && b.text === (notatka as { text: string }).text,
    );
    if (juzJest) return reply;
    return { ...reply, blocks: [...reply.blocks, notatka] };
  }

  private async noteUnservedPlace(
    parsed: Parsed,
    reply: ChatReply,
  ): Promise<ChatReply> {
    // Handler, który sam już to powiedział, nie dostaje drugiego zdania o tym
    // samym. Bez tego Modlin wracał dwa razy, za drugim razem inaczej.
    if (reply.unservedPlaceSaid) return reply;

    const slug = unservedLocationSlug(parsed.normalized, await getVocabulary());
    if (!slug) return reply;

    const text = unservedPlaceSentence(slug, parsed.locale);
    if (!text) return reply;

    return {
      ...reply,
      blocks: [{ kind: "text", text }, ...reply.blocks],
      unservedPlaceSaid: true,
    };
  }

  private async respondCore(
    request: ChatRequest,
    parsed: Parsed,
  ): Promise<ChatReply> {
    const vocab = await getVocabulary();
    const locale = parsed.locale;

    /**
     * Slots arrive from the browser, so every id in them is checked against the
     * live fleet before it is used or stored.
     *
     * Not a theoretical concern: an id that does not exist reaches the
     * conversation table's foreign key and turns a chat message into a 500.
     * Dropping unknown ids here means a forged slot degrades to "no car
     * selected" — the assistant asks which car, which is what it would do for
     * anyone who had not named one.
     */
    const knownCars = new Set(vocab.cars.map((c) => c.modelId));
    const knownLocations = new Set(vocab.locations.map((l) => l.id));
    const incoming: ChatSlots = {
      ...request.slots,
      carModelIds: request.slots.carModelIds.filter((id) => knownCars.has(id)),
      locationId:
        request.slots.locationId && knownLocations.has(request.slots.locationId)
          ? request.slots.locationId
          : null,
    };

    // An answer to a question we asked is read as that answer first, so "5"
    // after "ilu pasażerów?" is five people, not five days.
    const slots = mergeSlots(incoming, parsed);
    const intent = resolveIntent(request.slots, parsed);

    /**
     * The capability gate.
     *
     * Placed AFTER the refusal case below in importance but before every
     * handler: `OUT_OF_SCOPE` is checked first in the switch, so an operator
     * cannot switch off the thing that says no to "zmień cenę BMW na 1 zł".
     */
    const needed = INTENT_CAPABILITY[intent];
    if (needed && !this.can[needed] && intent !== "OUT_OF_SCOPE") {
      return this.capabilityOff(locale, slots, intent);
    }

    /**
     * What the customer described, read separately from what we can offer.
     *
     * `parse()` matches against the fleet, so a car A&A does not own comes back
     * as no car at all. `detectDemand` reads the same sentence asking a
     * different question — see `lib/chat/demand`. It never contributes to an
     * answer about price or availability; it decides one thing here (whether to
     * say "we don't have that one" instead of "I don't understand") and is
     * otherwise passed through to be written down.
     */
    const demand = detectDemand(
      request.message,
      parsed,
      vocab,
      slots.lastDemand,
    );
    const demandInFleet = demand ? isInFleet(demand, vocab) : false;

    /**
     * A named car that is not ours.
     *
     * Only for a car the customer NAMED — `kind: "model"` — and only when the
     * fleet has nothing of that name. "Macie jakieś BMW" is not this case: BMW
     * is in the fleet and the normal search answers it far better. Nor is a
     * described need: "luksusowy SUV" has an answer among real cars, and
     * replying "we don't have that" to it would be both wrong and a lost sale.
     */
    /*
     * Brand-only counts too, but only when we have nothing of that marque.
     *
     * "Macie Range Rovera?" produces brand demand, not model demand — there is
     * no model word after it — and the `kind === "model"` test alone dropped it
     * on the floor: the customer got "nie mam pewnej informacji na ten temat"
     * about a car we simply do not rent. `isInFleet` already answers the only
     * question that matters here, and for a brand we do stock ("macie jakieś
     * BMW") it answers true, so the normal search still handles that case.
     */
    if (
      demand &&
      (demand.kind === "model" || demand.kind === "brand") &&
      !demandInFleet &&
      isCarSeeking(intent) &&
      this.can.offer
    ) {
      return this.outOfFleet(locale, slots, demand, intent);
    }

    /**
     * "Czy Trafic ma automatyczną skrzynię?" — a question about one car's spec.
     *
     * The gearbox was in the database, was honoured by every filter and was
     * printed on the card; the one thing missing was a sentence answering the
     * question that was asked. The visitor got a car card and a note about
     * availability, and had to read the specification strip to find the "nie".
     *
     * Answered from `car.gearbox` and nothing else, so it cannot drift from
     * what the filters do. It sits above the reaction handlers because those
     * read the sentence as a rejection of the car, and this one is a question
     * about it.
     */
    if (
      parsed.entities.asksGearbox &&
      slots.carModelIds.length > 0 &&
      isCarSeeking(intent)
    ) {
      const answer = await this.gearboxAnswer(locale, slots);
      if (answer) return answer;
    }

    /**
     * Three things a customer says ABOUT an offer we have just made.
     *
     * They arrive under whatever intent the sentence happened to score — "za
     * drogie, coś tańszego?" scores `GET_PRICE`, "co macie podobnego?" scores
     * `FIND_CAR` — and under that intent each one was answered as a fresh
     * search that had lost the point of the message. Routing on the reaction
     * rather than on the intent is what makes them behave the same wherever
     * they turn up in a conversation.
     *
     * Order matters: a superlative is a question about the fleet and needs no
     * previous car, while the other two are rejections of a specific car and
     * mean nothing without one — so they stay inert until there is a car to
     * reject, rather than guessing which one was meant.
     */
    if (this.can.offer) {
      const rejected = slots.carModelIds[0] ?? null;
      /*
       * "Który jest tańszy?" after two cars have been put side by side.
       *
       * Ahead of the rejection rules below, and gated on there being two cars,
       * because the same sentence means two different things depending on how
       * many are on the table. With one car pinned it is a rejection — "this
       * one is too dear, show me cheaper" — and `cheaperThan` is right. With
       * two it is a question about those two, and answering it with a fresh
       * search was how "który jest tańszy?" came back with five cars the
       * customer had never mentioned.
       */
      /*
       * "Ile kosztuje dodatkowy kierowca?"
       *
       * An add-on is priced in `fees`, per rental or per day, and has nothing
       * to do with which car is chosen — so asking "o który samochód chodzi?",
       * which is what a price question normally earns, was a question with no
       * answer. Ahead of everything else in this block because naming an
       * add-on is the most specific thing the sentence does.
       */
      if (parsed.entities.extraTopic !== null) {
        return this.extraFee(
          locale,
          slots,
          parsed.entities.extraTopic,
          parsed.entities.days,
        );
      }
      if (
        slots.carModelIds.length >= 2 &&
        parsed.entities.comparisonAspect !== null
      ) {
        return this.compareAspect(
          locale,
          slots,
          parsed.entities.comparisonAspect,
        );
      }
      if (parsed.entities.superlative && isPriceableIntent(intent)) {
        return this.priceSuperlative(
          locale,
          slots,
          parsed.entities.superlative,
        );
      }
      if (rejected && isCarSeeking(intent)) {
        // "Za drogie" first: "coś tańszego" is also "something else", and the
        // cheaper reading is the more specific one.
        if (parsed.entities.wantsCheaper) {
          return this.cheaperThan(locale, slots, rejected);
        }
        // Its mirror, and it has to sit here rather than in the switch below
        // for the same reason: "pokaż coś droższego" carries no criteria of its
        // own, so a generic search reads it as a request for the car already
        // pinned — which is how it used to answer with that very car.
        if (parsed.entities.wantsPricier) {
          return this.pricierThan(locale, slots, rejected);
        }
        if (parsed.entities.wantsSimilar) {
          return this.similarCars(locale, slots, rejected);
        }
      }
    }

    switch (intent) {
      case "OUT_OF_SCOPE":
        return this.refuse(locale, slots);
      /**
       * Both of these deliberately sit outside `INTENT_CAPABILITY`, so no
       * admin switch can turn them off. A crash must always reach a person,
       * and "we have not decided that yet" must never degrade into a guess.
       */
      case "EMERGENCY":
        return this.emergency(locale, slots);
      case "NEEDS_STAFF_CONFIRMATION":
        return this.needsStaffConfirmation(locale, slots, request.message);
      case "ABROAD":
        return this.abroad(locale, slots);
      case "DOCUMENTS":
        return this.documents(locale, slots);
      case "DRIVER_AGE":
        return this.driverAge(locale, slots, parsed);
      case "CONTACT_HUMAN":
        return this.contact(locale, slots);
      case "GREETING":
        return this.greeting(locale, slots);
      case "FIND_CAR":
        return this.findCar(locale, slots, parsed);
      case "CHECK_AVAILABILITY":
        return this.availability(locale, slots);
      case "GET_PRICE":
        return this.price(locale, slots, parsed);
      case "GET_DEPOSIT":
        return this.deposit(locale, slots);
      case "GET_MILEAGE_LIMIT":
        return this.mileage(locale, slots, parsed);
      case "OPENING_HOURS":
        return this.hours(locale, slots, request.message);
      case "COMPARE_CARS":
        return this.compare(locale, slots);
      case "AIRPORT":
        return this.airport(locale, slots, parsed);
      case "PICKUP_POINT":
        return this.pickupPoints(locale, slots);
      case "LONG_TERM":
        return this.longTerm(locale, slots, parsed);
      case "B2B":
        return this.business(locale, slots);
      case "PARTNERSHIP":
        return this.partnership(locale, slots);
      case "HOW_TO_RENT":
        return this.howToRent(locale, slots);
      case "BROWSE_FLEET":
        return this.browseFleet(locale, slots);
      case "MANAGE_BOOKING":
        return this.manageBooking(locale, slots, request.message);
      case "START_BOOKING":
        return this.startBooking(locale, slots);
      case "FAQ":
        return this.faq(locale, slots, request.message, parsed);
      default:
        // An unsure reading is treated exactly like an unknown one: ask.
        return this.faq(locale, slots, request.message, parsed);
    }
  }

  /**
   * `respondWith` with the demand reading attached to whatever came back.
   *
   * A wrapper rather than a change to every handler: thirteen handlers each
   * carrying two extra fields is thirteen chances to forget one, and the answer
   * a customer reads must not depend on bookkeeping the analytics wanted.
   */
  async respondTracked(
    request: ChatRequest,
    parsed: Parsed,
  ): Promise<ChatReply> {
    const vocab = await getVocabulary();
    const reply = await this.respondWith(request, parsed);
    const demand =
      reply.demand !== undefined
        ? reply.demand
        : detectDemand(
            request.message,
            parsed,
            vocab,
            request.slots.lastDemand,
          );

    /**
     * The last trigger from the spec: a conversation that has gone on and is
     * not converging on a car.
     *
     * Deliberately hard to satisfy. Six messages in, still no car chosen, none
     * offered in this reply, never asked before, and not on the way to a
     * booking or a person — at that point the visitor is circling, and one
     * question is likelier to help than more of the same. Anybody who knows
     * what they want has a car in their slots long before the sixth message and
     * never sees this.
     */
    const drifting =
      !reply.slots.nudged &&
      reply.slots.turns >= 6 &&
      reply.slots.carModelIds.length === 0 &&
      !reply.blocks.some((b) => b.kind === "cars" || b.kind === "quote") &&
      reply.intent !== "START_BOOKING" &&
      reply.intent !== "CONTACT_HUMAN" &&
      reply.intent !== "OUT_OF_SCOPE" &&
      !reply.handoff;

    return {
      ...reply,
      blocks: drifting
        ? [...reply.blocks, ...askWhatTheyWant(locale(reply))]
        : reply.blocks,
      slots: {
        ...reply.slots,
        ...(drifting ? { nudged: true } : {}),
        // Remembered for the next message; silence never erases it, so a
        // question about the deposit between two questions about the Cayenne
        // does not lose the Cayenne.
        lastDemand: demand ? demand.label : reply.slots.lastDemand,
      },
      demand,
      demandInFleet:
        reply.demandInFleet ?? (demand ? isInFleet(demand, vocab) : false),
    };
  }

  /**
   * "We do not have that car" — said as a person would say it, with somewhere
   * to go next.
   *
   * The spec's own example, and the reason it is an example: ending on "nie
   * mamy" wastes a customer who told us exactly what they wanted. They get the
   * truth, two real routes forward, and their request goes into the demand
   * table where nineteen of them become an argument for buying one.
   */
  private outOfFleet(
    locale: Locale,
    slots: ChatSlots,
    demand: Demand,
    intent: Intent,
  ): ChatReply {
    // Asked again about the same car. Repeating the full paragraph word for
    // word reads like a machine that did not hear the first time.
    const again = slots.lastDemand === demand.label;
    const blocks: ChatBlock[] = [
      text(
        again
          ? t(
              locale,
              `Potwierdzam — ${demand.label} nie ma w naszej flocie, w żadnej wersji. Zapisałem Twoje zainteresowanie tym modelem.`,
              `Confirming — we have no ${demand.label} in the fleet, in any version. I have noted your interest in this model.`,
            )
          : t(
              locale,
              `Obecnie nie mamy ${demand.label} w naszej flocie. Mogę pokazać podobne samochody albo zapisać Twoje zainteresowanie tym modelem.`,
              `We do not currently have the ${demand.label} in our fleet. I can show you similar cars, or note your interest in this model.`,
            ),
      ),
    ];

    const options = [
      {
        label: t(locale, "🚗 Pokaż podobne auta", "🚗 Show similar cars"),
        value: t(locale, "pokaz podobne auta", "show similar cars"),
      },
    ];
    if (this.can.handoff) {
      options.push({
        label: t(
          locale,
          "💬 Skontaktuj mnie z pracownikiem",
          "💬 Talk to a person",
        ),
        value: t(locale, "porozmawiaj z pracownikiem", "talk to a person"),
      });
    }
    blocks.push({ kind: "quick", options });

    const nudge = !slots.nudged && !again;
    if (nudge) blocks.push(...askWhatTheyWant(locale));

    return {
      blocks,
      // The car was never ours, so nothing is pinned to a model id — the next
      // message is read with a clean slate rather than against a car that does
      // not exist.
      slots: { ...slots, nudged: slots.nudged || nudge },
      locale,
      intent,
      // Not "unanswered": the question was understood and answered truthfully.
      // Filing it as a failure would bury the assistant's real gaps under every
      // customer who asked for a car A&A never claimed to have.
      unanswered: false,
      handoff: false,
      demand,
      demandInFleet: false,
    };
  }

  /* ── Handlers ───────────────────────────────────────────────────────── */

  /**
   * A capability the operator has switched off.
   *
   * Says so plainly instead of pretending not to understand, and offers the
   * one thing that is always worth offering — a person — when handoff is on.
   * `unanswered: true` puts it in the admin's unanswered list, which is how an
   * operator finds out that a switch is costing them enquiries.
   */
  private capabilityOff(
    locale: Locale,
    slots: ChatSlots,
    intent: Intent,
  ): ChatReply {
    const blocks: ChatBlock[] = [
      text(
        t(
          locale,
          "Tej sprawy nie obsłużę tutaj. Zespół A&A odpowie na nią od ręki.",
          "I cannot help with that here. The A&A team can answer it right away.",
        ),
      ),
    ];
    if (this.can.handoff) {
      blocks.push({
        kind: "quick",
        options: [
          {
            label: t(
              locale,
              "💬 Kontakt z pracownikiem",
              "💬 Talk to a person",
            ),
            value: t(locale, "porozmawiaj z pracownikiem", "talk to a person"),
          },
        ],
      });
    }
    return {
      blocks,
      slots,
      locale,
      intent,
      unanswered: true,
      handoff: false,
    };
  }

  private greeting(locale: Locale, slots: ChatSlots): ChatReply {
    return {
      blocks: [
        text(
          t(
            locale,
            "Dzień dobry 👋 Jestem Asystentem A&A. Pomogę Ci znaleźć samochód, sprawdzić dostępność i cenę. W czym mogę pomóc?",
            "Hello 👋 I'm the A&A Assistant. I can help you find a car, check availability and prices. How can I help?",
          ),
        ),
        mainMenu(locale),
      ],
      slots,
      locale,
      intent: "GREETING",
      unanswered: false,
      handoff: false,
    };
  }

  /**
   * The refusal.
   *
   * Short, not preachy, and it offers the thing a person actually wants next.
   * Note what it does NOT do: it does not explain what it is forbidden from
   * doing in detail, because that reads as an invitation to try the next thing
   * on the list.
   */
  private refuse(locale: Locale, slots: ChatSlots): ChatReply {
    return {
      blocks: [
        text(
          t(
            locale,
            "Tego nie mogę zrobić. Ceny, rabaty i zmiany w rezerwacjach ustala wyłącznie zespół A&A — mogę połączyć Cię z pracownikiem albo pokazać aktualną ofertę.",
            "I can't do that. Prices, discounts and changes to reservations are set by the A&A team only — I can put you in touch with someone, or show you the current offer.",
          ),
        ),
        {
          kind: "quick",
          options: [
            {
              label: t(locale, "💬 Pracownik", "💬 Talk to a person"),
              value: t(
                locale,
                "porozmawiaj z pracownikiem",
                "talk to a person",
              ),
            },
            {
              label: t(locale, "🚗 Zobacz flotę", "🚗 See the fleet"),
              value: t(locale, "pokaż flotę", "show the fleet"),
            },
          ],
        },
      ],
      slots,
      locale,
      intent: "OUT_OF_SCOPE",
      unanswered: false,
      handoff: false,
    };
  }

  /**
   * The price list holds a 0 for this length of stay, which means a manager
   * quotes it by hand.
   *
   * The assistant says so and stops. It does not offer the daily rate as a
   * substitute, does not pro-rate a neighbouring tier, and does not round
   * anything: an invented number is exactly the failure this whole design
   * exists to prevent, and it would be quoted in a chat transcript the customer
   * keeps.
   *
   * The route out is the handoff that already exists — the same contact block
   * and the same lead form the "Kontakt z pracownikiem" button produces, so
   * there is one contact path in the product, not two. `handoff: true` marks
   * the conversation for the operator exactly as a direct request would.
   */
  private async priceOnRequest(
    locale: Locale,
    slots: ChatSlots,
    intent: Intent,
  ): Promise<ChatReply> {
    const contact = await getContact(locale);
    return {
      blocks: [
        text(
          t(
            locale,
            "Cena dla tego okresu jest ustalana indywidualnie. Skontaktuj się z managerem A&A, aby otrzymać ofertę.",
            "The price for this period is set individually. Contact the A&A manager for an offer.",
          ),
        ),
        { kind: "contact", ...contact },
        {
          kind: "quick",
          options: [
            {
              label: t(
                locale,
                "💬 Skontaktuj się z managerem",
                "💬 Contact our manager",
              ),
              value: t(
                locale,
                "porozmawiaj z pracownikiem",
                "talk to a person",
              ),
            },
          ],
        },
        {
          kind: "lead",
          notice: t(
            locale,
            "Zostaw numer lub e-mail, a manager wróci do Ciebie z wyceną. Dane wykorzystamy wyłącznie do kontaktu w tej sprawie.",
            "Leave a phone number or e-mail and a manager will come back to you with a quote. We will use it solely to contact you about this enquiry.",
          ),
        },
      ],
      slots: { ...slots, awaiting: "lead_contact" },
      locale,
      intent,
      unanswered: false,
      handoff: true,
    };
  }

  private async contact(locale: Locale, slots: ChatSlots): Promise<ChatReply> {
    const contact = await getContact(locale);
    return {
      blocks: [
        text(
          t(
            locale,
            "Jasne. Jak wolisz się z nami skontaktować?",
            "Of course. How would you like to reach us?",
          ),
        ),
        { kind: "contact", ...contact },
        text(
          t(
            locale,
            "Mogę też poprosić opiekuna o kontakt — zostaw numer albo e-mail.",
            "I can also ask a member of the team to contact you — leave a phone number or e-mail.",
          ),
        ),
        {
          kind: "lead",
          notice: t(
            locale,
            "Podany numer lub e-mail wykorzystamy wyłącznie do kontaktu w sprawie tego zapytania. Szczegóły w Polityce prywatności.",
            "We will use the phone number or e-mail solely to contact you about this enquiry. See our Privacy Policy for details.",
          ),
        },
      ],
      slots: { ...slots, awaiting: "lead_contact" },
      locale,
      intent: "CONTACT_HUMAN",
      unanswered: false,
      handoff: true,
    };
  }

  /**
   * A car that has crashed, broken down or will not start.
   *
   * What this handler must NOT do is as important as what it does. A&A has not
   * yet given us a roadside-assistance number or a written procedure — see
   * "WYMAGA DECYZJI WŁAŚCICIELA" in `docs/RAPORT-CHATBOT-AUDYT.md` — and the
   * one thing worse than no instruction here is an invented one. A made-up
   * number costs somebody the minutes they needed.
   *
   * So it says plainly that this needs A&A now, shows the real contact details
   * from the admin settings, and offers a callback. When the owner supplies the
   * number and the steps, they go in ABOVE the contact block and nothing else
   * about this handler changes.
   */
  private async emergency(
    locale: Locale,
    slots: ChatSlots,
  ): Promise<ChatReply> {
    const contact = await getContact(locale);
    return {
      blocks: [
        text(
          t(
            locale,
            "To sprawa pilna — skontaktuj się z A&A od razu, telefonicznie.",
            "This is urgent — please contact A&A straight away, by phone.",
          ),
        ),
        { kind: "contact", ...contact },
        text(
          t(
            locale,
            "Jeśli ktoś jest ranny albo auto blokuje drogę, najpierw zadzwoń pod 112. Numer pomocy drogowej i dalsze kroki znajdziesz w swojej umowie najmu — nie podam ich z pamięci, żeby nie wskazać złego numeru.",
            "If anyone is hurt, or the car is blocking the road, call 112 first. The roadside assistance number and the steps to follow are in your rental agreement — I will not quote them from memory and risk giving you the wrong one.",
          ),
        ),
        {
          kind: "lead",
          notice: t(
            locale,
            "Zostaw numer, a opiekun A&A oddzwoni. Dane wykorzystamy wyłącznie do kontaktu w tej sprawie.",
            "Leave a number and someone from A&A will call you back. We will use it solely to contact you about this.",
          ),
        },
      ],
      slots: { ...slots, awaiting: "lead_contact" },
      locale,
      intent: "EMERGENCY",
      // Logged for the admin: every emergency is a question we could not answer
      // properly until the procedure exists.
      unanswered: true,
      handoff: true,
    };
  }

  /**
   * A question about a rule the company has not written down.
   *
   * Neither confirms nor denies — that is the whole contract. The audit found
   * twenty-six answers that did the opposite, and because fourteen of the FAQ
   * entries open with "Tak", the customer read them as approvals: "Czy mogę
   * zapłacić gotówką?" was answered "Tak, akceptujemy płatność przelewem".
   *
   * The question is recorded so the owner can see what is being asked and
   * decide in what order to write the answers.
   */
  private async needsStaffConfirmation(
    locale: Locale,
    slots: ChatSlots,
    _message: string,
  ): Promise<ChatReply> {
    const contact = await getContact(locale);
    return {
      blocks: [
        text(
          t(
            locale,
            "Tego nie mam potwierdzonego, więc nie chcę zgadywać — to warunek wynajmu i musi go potwierdzić pracownik A&A.",
            "I do not have that confirmed, and I would rather not guess — it is a rental condition, so someone from A&A has to confirm it.",
          ),
        ),
        { kind: "contact", ...contact },
        {
          kind: "lead",
          notice: t(
            locale,
            "Zostaw numer lub e-mail, a opiekun A&A odpowie na to pytanie. Dane wykorzystamy wyłącznie do kontaktu w tej sprawie.",
            "Leave a phone number or e-mail and someone from A&A will answer this. We will use it solely to contact you about this enquiry.",
          ),
        },
      ],
      slots: { ...slots, awaiting: "lead_contact" },
      locale,
      intent: "NEEDS_STAFF_CONFIRMATION",
      // The point of the whole exercise: these land in the admin's list, so the
      // owner can see which of the twenty-one rules customers actually ask for.
      unanswered: true,
      handoff: true,
    };
  }

  /**
   * Driving the car out of Poland.
   *
   * The company rule, approved by the owner on 2026-08-20 and recorded in
   * `docs/ZASADY-BIZNESOWE.md`: taking an A&A car abroad is forbidden without
   * A&A's prior consent, and consent comes from a person — never from this
   * assistant, and never by implication.
   *
   * Three things this handler must not do, all of them things the old answer
   * did. It must not open with "Tak", which read as permission. It must not
   * name a country as allowed, so no country list exists anywhere in the code
   * to be quoted. And it must not let silence pass for approval, which is why
   * the last sentence says so outright — a customer who writes "jadę do
   * Niemiec w piątek" and gets no reply has not been given consent.
   *
   * Note it deliberately answers the SAME way whether the customer names
   * Germany or Ukraine. The moment the reply varies by destination, it becomes
   * a permission list, which is exactly what was ruled out.
   */
  private async abroad(locale: Locale, slots: ChatSlots): Promise<ChatReply> {
    const contact = await getContact(locale);
    return {
      blocks: [
        // One wording, imported rather than repeated — the panel, the FAQ page
        // and this handler all quote the same constant, so rule Z-1 cannot say
        // three slightly different things in three places.
        text(ABROAD_RULE[locale].short),
        text(ABROAD_RULE[locale].noConsent),
        { kind: "contact", ...contact },
        text(ABROAD_RULE[locale].silence),
        {
          kind: "lead",
          notice: t(
            locale,
            "Zostaw numer lub e-mail, a opiekun A&A skontaktuje się w sprawie zgody na wyjazd. Dane wykorzystamy wyłącznie do kontaktu w tej sprawie.",
            "Leave a phone number or e-mail and someone from A&A will contact you about consent for the trip. We will use it solely to contact you about this.",
          ),
        },
      ],
      slots: { ...slots, awaiting: "lead_contact" },
      locale,
      intent: "ABROAD",
      // Answered by an approved rule, so not a gap in the FAQ — but it always
      // ends with a person, because only a person can actually say yes.
      unanswered: false,
      handoff: true,
    };
  }

  /**
   * Which documents the driver needs.
   *
   * Reads Admin → Zasady wynajmu and says exactly what has been approved there:
   * the base rule always, plus a sentence for each switch the owner turned on.
   * A switch that is off contributes nothing — not a denial, not a hedge — and
   * the closing sentence sends anything the list did not cover to a person.
   *
   * That last part is the difference between this and the answer the audit
   * found. Asked "Czy wystarczy paszport?", the assistant used to reply "Tak.
   * Fotelik kosztuje 30 zł za dzień". Now it states what it knows, and is
   * explicit that the rest needs confirming.
   */
  private async documents(
    locale: Locale,
    slots: ChatSlots,
  ): Promise<ChatReply> {
    const [rules, contact] = await Promise.all([
      getRentalRules(),
      getContact(locale),
    ]);

    return {
      blocks: [
        ...documentsStatements(rules, locale).map((line) => text(line)),
        text(
          t(
            locale,
            "Pozostałe warunki — w tym akceptowane formy dokumentów w Twoim przypadku — potwierdza pracownik A&A. Nie chcę tu zgadywać.",
            "Any further conditions — including which forms of document apply in your case — are confirmed by A&A staff. I would rather not guess here.",
          ),
        ),
        { kind: "contact", ...contact },
        {
          kind: "lead",
          notice: t(
            locale,
            "Zostaw numer lub e-mail, a opiekun A&A potwierdzi szczegóły. Dane wykorzystamy wyłącznie do kontaktu w tej sprawie.",
            "Leave a phone number or e-mail and someone from A&A will confirm the details. We will use it solely to contact you about this enquiry.",
          ),
        },
      ],
      slots: { ...slots, awaiting: "lead_contact" },
      locale,
      intent: "DOCUMENTS",
      // The base rule is a real answer, so this is not an unanswered question —
      // but it still ends with a person, because the detail lives with them.
      unanswered: false,
      handoff: true,
    };
  }

  /**
   * How old the driver has to be, and how long they must have held a licence.
   *
   * The order matters and is the whole point of the intent: work out WHICH CAR
   * is being asked about, take its class, and only then read the numbers. A
   * customer asking about a Panamera gets the Premium threshold, not the
   * lowest one in the fleet — which is what a single FAQ entry would have
   * given them.
   *
   * Every number comes from Admin → Zasady wynajmu, through the same function
   * the booking form refuses on, so the assistant cannot quote a threshold the
   * form does not apply. There is always a number to quote — the floor of 21
   * is a rule, not an absence — so unlike the documents handler this one never
   * hands off for want of an answer.
   */
  private async driverAge(
    locale: Locale,
    slots: ChatSlots,
    parsed: Parsed,
  ): Promise<ChatReply> {
    const rules = await getRentalRules();

    // One car in the conversation means one class. Two or more (a comparison)
    // is not a class, so the answer covers the whole fleet instead.
    const carId = slots.carModelIds.length === 1 ? slots.carModelIds[0] : null;
    const car = carId ? await getCar(carId, locale) : null;
    const cls = carId ? await driverClassFor(carId) : null;

    const limits = effectiveDriverLimits(rules, cls);
    // A named car is answered from ITS limits — including a car nobody has
    // classified, which sits at the floor and must not be quoted the numbers
    // of a class it does not belong to.
    const sentence = car
      ? driverLimitsSentence(limits, locale)
      : driverAgeSentence(rules, locale, "all");

    const blocks: ChatBlock[] = [];

    blocks.push(
      text(
        car
          ? t(
              locale,
              `${car.name}: ${lowerFirst(sentence)}`,
              `${car.name}: ${lowerFirst(sentence)}`,
            )
          : sentence,
      ),
    );

    // Said only when the answer was general AND the classes actually differ —
    // otherwise it invites a question whose answer would be the same sentence.
    if (!car && driverClassesDiffer(rules)) {
      blocks.push(
        text(
          t(
            locale,
            "Napisz, które auto Cię interesuje, a podam wymagania dokładnie dla niego.",
            "Tell me which car you have in mind and I will give you the requirements for that one.",
          ),
        ),
      );
    }

    // Unreachable while `LICENCE_TENURE_ENFORCEABLE` is false, and deliberately
    // kept: the day the booking form collects a licence issue date, a tenure
    // rule must arrive with the sentence that says who checks it, rather than
    // being announced and quietly verified by nobody.
    if (limits.minLicenceYears !== null) {
      blocks.push(
        text(
          t(
            locale,
            "Wiek i staż potwierdzamy przy odbiorze auta na podstawie dokumentów.",
            "Age and licence tenure are verified from your documents when you collect the car.",
          ),
        ),
      );
    }

    /*
     * "Mam 23 lata, czy mogę wynająć Panamerę?"
     *
     * The threshold alone was a true answer to a question nobody asked. The
     * customer gave us the one number the comparison needs, so the comparison
     * is ours to make — and when the answer is no, the next sentence has to be
     * what they CAN take, not an apology.
     *
     * Compared against `effectiveDriverLimits`, the same reader the booking
     * form validates with, so the assistant cannot promise what the form will
     * refuse or refuse what the form would accept.
     */
    const age = parsed.entities.statedAge;
    if (age !== null) {
      const qualifies = age >= limits.minAge;
      blocks.unshift(
        text(
          qualifies
            ? car
              ? t(
                  locale,
                  `Tak — przy ${age} latach możesz wynająć ${car.name}.`,
                  `Yes — at ${age} you can rent the ${car.name}.`,
                )
              : t(
                  locale,
                  `Tak — ${age} lat spełnia nasz wymóg wieku.`,
                  `Yes — ${age} meets our age requirement.`,
                )
            : car
              ? t(
                  locale,
                  `Nie — do ${car.name} wymagamy ukończonych ${limits.minAge} lat.`,
                  `No — the ${car.name} requires a driver of at least ${limits.minAge}.`,
                )
              : t(
                  locale,
                  `Przy ${age} latach nie każde auto z naszej floty jest dostępne.`,
                  `At ${age} not every car in our fleet is available to you.`,
                ),
        ),
      );

      if (!qualifies) {
        // What they can actually take — read from the fleet and its classes,
        // never a guess. An empty list is possible and is said plainly rather
        // than papered over with an offer that does not exist.
        const fleet = await getFleet();
        const allowed: string[] = [];
        for (const c of fleet) {
          const limit = effectiveDriverLimits(
            rules,
            await driverClassFor(c.id),
          );
          if (age >= limit.minAge) allowed.push(`${c.brand} ${c.model}`);
        }
        blocks.push(
          text(
            allowed.length > 0
              ? t(
                  locale,
                  `Przy ${age} latach możesz wynająć: ${allowed.join(", ")}.`,
                  `At ${age} you can rent: ${allowed.join(", ")}.`,
                )
              : t(
                  locale,
                  "W tej chwili żadne auto z naszej floty nie jest dostępne przy tym wieku — pracownik A&A powie, czy da się coś ustalić.",
                  "No car in our fleet is available at that age right now — someone from A&A can say whether anything can be arranged.",
                ),
          ),
        );
      }
    }

    /*
     * "Prawo jazdy mam od roku, co mogę wynająć?"
     *
     * The honest answer is that A&A does not apply a licence-tenure rule it
     * cannot verify — the booking form collects no issue date, so no such rule
     * reaches anything (`LICENCE_TENURE_ENFORCEABLE`). What it does apply is
     * the age requirement, which is stated. Anything more specific would be
     * inventing a policy out of a switch that is off, which is exactly what the
     * rules centre exists to prevent.
     */
    if (parsed.entities.asksLicenceTenure && limits.minLicenceYears === null) {
      blocks.push(
        text(
          t(
            locale,
            "Osobnego wymogu stażu prawa jazdy nie stosujemy — liczy się wiek podany wyżej i ważne prawo jazdy odpowiedniej kategorii. Jeśli Twój przypadek jest nietypowy, potwierdzi to pracownik A&A.",
            "We do not apply a separate licence-tenure requirement — what counts is the age above and a valid licence of the right category. If your case is unusual, someone from A&A will confirm.",
          ),
        ),
      );
    }

    if (car) blocks.push({ kind: "cars", cars: [car] });

    return {
      blocks,
      slots,
      locale,
      intent: "DRIVER_AGE",
      unanswered: false,
      handoff: false,
    };
  }

  private async findCar(
    locale: Locale,
    slots: ChatSlots,
    parsed: Parsed,
  ): Promise<ChatReply> {
    /**
     * Cars the customer named, in this message or earlier — `mergeSlots` has
     * already folded the parser's find into the slots and dropped any id that
     * is not in the live fleet.
     *
     * This used to be parsed and then thrown away: "Pokaż Toyotę RAV4" came
     * back as three cars sorted by price with the RAV4 buried among them. The
     * parser was right all along; the query below never asked for what it had.
     */
    /**
     * …but a car pinned two messages ago does not outrank a requirement stated
     * now.
     *
     * "Czy Volvo XC60 jest wolne?" pins the XC60. "Potrzebuję auta dla 7 osób"
     * a moment later is a new search, and the rule above — a named car decides
     * the result on its own — was answering it with the five-seat Volvo. The
     * customer asked for seven seats and got five, which is the one substitution
     * a car rental must never make.
     *
     * So: a criterion the customer states in THIS message beats a car carried
     * over from an earlier one, and the car is released rather than quietly
     * kept, or the next message would re-pin it.
     */
    const namedNow = parsed.entities.carModelIds.length > 0;
    const newCriteria =
      parsed.entities.seats !== null ||
      parsed.entities.segment !== null ||
      // A body word is a criterion exactly as much as a shelf word is. Left out
      // of this test, "Szukam SUV-a" one message after "Czy Volvo jest wolne?"
      // kept the Volvo pinned and answered with it alone.
      parsed.entities.bodyType !== null ||
      parsed.entities.driverClass !== null ||
      parsed.entities.budgetGrosze !== null ||
      parsed.entities.budgetMinGrosze !== null ||
      parsed.entities.familyHint ||
      parsed.entities.fuel !== null ||
      parsed.entities.gearbox !== null;
    const releaseCar = !namedNow && newCriteria && slots.carModelIds.length > 0;
    if (releaseCar) slots = { ...slots, carModelIds: [] };

    const named = slots.carModelIds;

    /**
     * "Duże auto dla rodziny" is exactly the case the spec calls out: vague,
     * and the honest move is to ask rather than to decide what "big" means.
     *
     * But only when we have nothing at all to go on. A customer who has already
     * given dates — "I need a car from September 3 to September 9" — has told
     * us the one thing that actually narrows the fleet, and answering that with
     * "how many passengers?" is the questionnaire the whole design is meant to
     * avoid: they get interrogated instead of shown the cars that are free.
     * With a range in hand we show what is free and let them narrow it if they
     * want to.
     */
    const haveDates = Boolean(slots.dateFrom && slots.dateTo);
    /*
     * Gearbox and fuel are criteria too.
     *
     * They were read by the parser, passed to the query below, and then not
     * counted here — so "Szukam diesla" and "Szukam auta na automacie" were
     * treated as though the customer had said nothing at all and were answered
     * with "ilu pasażerów?". The filter worked; only this test did not know
     * about it.
     */
    /*
     * A stated price preference is a criterion too.
     *
     * Owner's decision of 21.08.2026: with no budget given, "szukam taniego
     * auta" is answered with the matching cars sorted cheapest first. It was
     * being answered with "ilu pasażerów?" instead, because the test below
     * counted every axis except this one and concluded the customer had said
     * nothing. They had — they said the only thing they cared about.
     */
    const haveSpec =
      parsed.entities.gearbox !== null ||
      parsed.entities.fuel !== null ||
      parsed.entities.wantsCheapest;
    if (
      !slots.seats &&
      !slots.segment &&
      !slots.bodyType &&
      !slots.driverClass &&
      !hasBudget(slots) &&
      !parsed.entities.familyHint &&
      named.length === 0 &&
      !haveDates &&
      !haveSpec
    ) {
      return askSeats(locale, { ...slots, pendingIntent: "FIND_CAR" });
    }

    const locationSlug = slots.locationId
      ? await locationSlugById(slots.locationId)
      : null;

    /**
     * "Auto rodzinne" as the only technical criterion the data supports.
     *
     * There is no approved definition of a family car, so none is invented: the
     * words assert a group larger than a couple and nothing more, and that maps
     * onto the one column that can answer it honestly — seats. Five is the
     * floor because four is a couple with two children in every brochure ever
     * printed, and because the fleet's own five-seaters are what the question
     * is about.
     *
     * An explicit count always wins: "auto rodzinne dla siedmiu osób" is seven.
     *
     * **Approved by the owner on 21.08.2026**, with the instruction that it stay
     * exactly this: no body-type condition and no boot-size condition, because
     * the database holds neither unambiguously and the assistant must not guess
     * at what it cannot read.
     */
    const FAMILY_MIN_SEATS = 5;
    const seatsWanted =
      slots.seats ?? (parsed.entities.familyHint ? FAMILY_MIN_SEATS : null);

    const carQuery = {
      modelIds: named,
      bodyType: slots.bodyType,
      segment: slots.segment,
      driverClass: slots.driverClass,
      /*
       * A budget filters only when the customer gave a number.
       *
       * Owner's decision, 21.08.2026: no invented threshold. "Tani SUV" with
       * no figure attached sorts by price and shows the whole matching set;
       * "SUV do 400 zł" excludes everything above 400. The two behaviours
       * come from the same sentence structure and differ only in whether a
       * number was said, which is the only thing we actually know.
       */
      ...budgetAxes(slots),
      seats: seatsWanted,
      /*
       * A gearbox QUESTION must not become a gearbox FILTER.
       *
       * "Czy Trafic ma automatyczną skrzynię?" sets `gearbox: automatic`,
       * which would filter the manual Trafic out of its own answer. Only
       * when a car is NAMED, though: "czy macie auto z automatem?" is a
       * question too, and there the gearbox is exactly the filter wanted.
       */
      gearbox:
        parsed.entities.asksGearbox && named.length > 0
          ? null
          : parsed.entities.gearbox,
      fuel: parsed.entities.fuel,
      dateFrom: slots.dateFrom,
      dateTo: slots.dateTo,
      locationSlug,
      // A price word sorts; so does a budget, because somebody who named a
      // ceiling is reading the list from the bottom up.
      cheapestFirst: parsed.entities.wantsCheapest || hasBudget(slots),
      /*
       * The full matching set, not a sample of it.
       *
       * A customer who states a requirement ("SUV", "siedem miejsc") is
       * asking what we HAVE that fits, and three of nine matches reads as
       * "that is all there is". See `FULL_OFFER_LIMIT`.
       */
      limit: FULL_OFFER_LIMIT,
    };

    const cars = await findCars(carQuery, locale);

    const checked = Boolean(slots.dateFrom && slots.dateTo);

    if (cars.length === 0) {
      /*
       * Nothing matched — but "nothing matched" is not the end of the answer.
       *
       * `CHECK_AVAILABILITY` has always followed a taken car with real
       * substitutes; this branch did not, so the identical situation gave two
       * different answers depending on whether the customer said it in one
       * sentence or two. "Chcę Volvo XC60" then "od 4 do 8 września" ended with
       * a shrug, while "Czy Volvo XC60 jest wolne 4–8 września?" ended with two
       * free cars. Same fleet, same dates, same customer.
       *
       * So the fallback is the same fallback, sourced the same way: if a car
       * was named, cars genuinely similar to it and genuinely free; if only
       * criteria were given, whatever is actually free for those dates with at
       * least the seats asked for. Every candidate comes from the availability
       * query, so nothing offered here can be unbookable.
       *
       * Presented as "these are free", never as "these match" — the criteria
       * are exactly what they do not meet.
       */
      const freeInstead =
        checked && slots.dateFrom && slots.dateTo
          ? named.length > 0
            ? await findAlternatives(
                named[0],
                { from: slots.dateFrom, to: slots.dateTo },
                locale,
                slots.seats,
                statedBudget(slots),
              )
            : await findCars(
                {
                  seats: seatsWanted,
                  dateFrom: slots.dateFrom,
                  dateTo: slots.dateTo,
                  locationSlug,
                  cheapestFirst: hasBudget(slots),
                  limit: 3,
                },
                locale,
              )
          : [];

      // A dead end is exactly where the one permitted question earns its place:
      // the visitor wanted something, we have nothing to show, and the choice is
      // between asking what would work and letting them leave.
      // With substitutes on screen the dead end is no longer dead, so the
      // question is held back for the case that still is one.
      /*
       * A budget that matched nothing gets an answer with a number in it.
       *
       * "Nie mam nic w tym budżecie" is true and useless: the customer cannot
       * tell from it whether they missed by twenty złoty or by four hundred,
       * and the only way to find out is to guess again. So the same search runs
       * once more with the price lifted and NOTHING else changed, and the reply
       * names what came closest and by how much. Widening the price answers the
       * question they asked; widening the seats or the dates would answer a
       * different one.
       *
       * Only when the budget is what emptied the result — if there was nothing
       * free at all, the sentence about money would be beside the point.
       */
      const budget = statedBudget(slots);
      const nearest =
        budget && freeInstead.length === 0
          ? await findNearestToBudget(carQuery, budget, locale)
          : null;

      /*
       * A number, even when substitutes are on screen.
       *
       * The list above says what is free; it does not say what it costs
       * relative to what the customer can spend, and that is the one thing
       * they need in order to decide. „Wolne są za to: …" beside a stated
       * ceiling of 100 zł leaves them to work out the gap themselves, which is
       * exactly the arithmetic they came here to avoid.
       *
       * Measured against the cheapest card actually offered — the cards are
       * ordered cheapest-first whenever a budget was named, so the first one IS
       * the closest. Only for a per-day ceiling: a card carries its advertised
       * daily rate and nothing else, and inventing a total from it would be the
       * multiplication this whole stage exists to stop.
       */
      const overBy =
        budget?.maxGrosze != null &&
        budget.kind === "day" &&
        freeInstead.length > 0 &&
        freeInstead[0].fromDailyGrosze > budget.maxGrosze
          ? freeInstead[0].fromDailyGrosze - budget.maxGrosze
          : null;

      const nudge = !slots.nudged && freeInstead.length === 0 && !nearest;
      return {
        blocks: [
          text(
            checked
              ? t(
                  locale,
                  "W tym terminie nie mam wolnego auta spełniającego te warunki. Mogę sprawdzić inny termin albo poszerzyć kryteria.",
                  "I have no car free for those dates matching those criteria. I can check other dates or widen the search.",
                )
              : t(
                  locale,
                  "Nie mam w tej chwili auta spełniającego te warunki. Mogę pokazać całą flotę albo połączyć Cię z pracownikiem.",
                  "I don't currently have a car matching those criteria. I can show you the whole fleet or put you in touch with someone.",
                ),
          ),
          ...(freeInstead.length > 0
            ? [
                text(
                  overBy === null
                    ? t(
                        locale,
                        "Wolne w tym terminie są za to:",
                        "These are free for those dates:",
                      )
                    : t(
                        locale,
                        `Wolne w tym terminie są za to — najtańsze o ${money(overBy, locale)} za dobę powyżej Twojego budżetu:`,
                        `These are free for those dates — the cheapest is ${money(overBy, locale)} per day above your budget:`,
                      ),
                ),
                { kind: "cars" as const, cars: freeInstead },
              ]
            : []),
          ...(nearest
            ? [
                text(
                  nearest.gapGrosze > 0
                    ? t(
                        locale,
                        `Najbliżej Twojego budżetu jest ${
                          budget?.kind === "total"
                            ? `${money(nearest.gapGrosze, locale)} więcej za cały wynajem`
                            : `${money(nearest.gapGrosze, locale)} więcej za dobę`
                        }:`,
                        `The closest to your budget is ${money(
                          nearest.gapGrosze,
                          locale,
                        )} ${
                          budget?.kind === "total"
                            ? "more for the whole rental"
                            : "more per day"
                        }:`,
                      )
                    : t(
                        locale,
                        "Najbliżej Twojego budżetu jest:",
                        "The closest to your budget:",
                      ),
                ),
                { kind: "cars" as const, cars: nearest.cars },
              ]
            : []),
          ...(nudge ? askWhatTheyWant(locale) : []),
          /*
           * "Mogę sprawdzić inny termin" has to come with the means to do it.
           *
           * This branch says there is nothing free in the range asked about —
           * which makes it one of the two places a customer is most likely to
           * want a different term, and the sentence above offers exactly that.
           * Offering it in words and then leaving them to type a date was the
           * gap a browser run found on the live site.
           */
          ...(checked
            ? [
                datesBlock(
                  locale,
                  null,
                  null,
                  t(locale, "📅 Wybierz inny termin", "📅 Choose other dates"),
                ),
              ]
            : []),
          mainMenu(locale),
        ],
        slots: {
          ...withDateIntent(slots, "FIND_CAR"),
          nudged: slots.nudged || nudge,
        },
        locale,
        intent: "FIND_CAR",
        unanswered: false,
        handoff: false,
      };
    }

    /**
     * Nothing here can actually be rented.
     *
     * `bookableUnits === 0` means the model owns no unit a customer could take
     * — sold, in the workshop, withdrawn — and no date changes that. The audit
     * caught this answering "samochód dla 7 osób" with a Renault Trafic whose
     * only van was in service and blocked until the end of the year, wrapped in
     * "Oto co mogę zaproponować" and followed by a calendar.
     *
     * Two things follow, and both matter. The assistant must not call it an
     * offer, and it must not hand over a calendar — offering to look at another
     * date implies a date exists that would work.
     */
    const rentable = cars.filter((c) => c.bookableUnits > 0);
    if (rentable.length === 0) {
      return {
        blocks: [
          text(
            t(
              locale,
              "Znalazłem pasujące auta, ale żadnego z nich nie mogę w tej chwili wynająć — nie mamy wolnego egzemplarza. Zmiana terminu tu nie pomoże.",
              "I found cars that match, but none of them can be rented right now — we have no unit available. A different date will not help here.",
            ),
          ),
          { kind: "cars", cars },
          text(
            t(
              locale,
              "Mogę zapytać o dostępność i dać znać, gdy auto wróci do floty — albo poszukać czegoś innego.",
              "I can ask about availability and let you know when it is back — or look for something else.",
            ),
          ),
          {
            kind: "quick",
            options: [
              {
                label: t(
                  locale,
                  "🔔 Zapytaj o dostępność / powiadom mnie",
                  "🔔 Ask about availability / notify me",
                ),
                value: t(
                  locale,
                  "zapytaj o dostępność",
                  "ask about availability",
                ),
              },
              {
                label: t(locale, "🚗 Pokaż inne auta", "🚗 Show other cars"),
                value: t(locale, "znajdź samochód", "find a car"),
              },
              {
                label: t(locale, "💬 Pracownik", "💬 Talk to a person"),
                value: t(
                  locale,
                  "porozmawiaj z pracownikiem",
                  "talk to a person",
                ),
              },
            ],
          },
        ],
        // No `datesBlock` — deliberately. See above.
        slots: withDateIntent(slots, "FIND_CAR"),
        locale,
        intent: "FIND_CAR",
        // The demand is real even though the answer is a refusal, and the
        // owner should see it: this is a car people ask for and we cannot let.
        unanswered: false,
        handoff: false,
      };
    }

    const blocks: ChatBlock[] = [
      text(
        slots.seats
          ? t(
              locale,
              `Oto co mogę zaproponować dla ${slots.seats} osób:`,
              `Here is what I can offer for ${slots.seats} people:`,
            )
          : t(locale, "Oto co mogę zaproponować:", "Here is what I can offer:"),
      ),
      { kind: "cars", cars },
      text(availabilityNote(locale, checked)),
    ];

    // Either way the customer gets the calendar: to fill the gap, or to change
    // what was already given. What they must not get is a question about dates
    // they have already provided.
    blocks.push(datesBlock(locale, slots.dateFrom, slots.dateTo));

    return {
      blocks,
      slots: checked
        ? withDateIntent(slots, "FIND_CAR")
        : {
            ...withDateIntent(slots, "FIND_CAR"),
            awaiting: "dates",
            pendingIntent: "FIND_CAR",
          },
      locale,
      intent: "FIND_CAR",
      unanswered: false,
      handoff: false,
    };
  }

  private async availability(
    locale: Locale,
    slots: ChatSlots,
  ): Promise<ChatReply> {
    if (slots.carModelIds.length === 0) {
      return askWhichCar(locale, slots, "CHECK_AVAILABILITY");
    }
    if (!slots.dateFrom || !slots.dateTo) {
      return askDates(locale, {
        ...slots,
        pendingIntent: "CHECK_AVAILABILITY",
      });
    }

    const locationSlug = slots.locationId
      ? await locationSlugById(slots.locationId)
      : null;
    const car = await getCar(
      slots.carModelIds[0],
      locale,
      { from: slots.dateFrom, to: slots.dateTo },
      locationSlug,
    );
    if (!car) return askWhichCar(locale, slots, "CHECK_AVAILABILITY");

    if ((car.freeUnits ?? 0) > 0) {
      return {
        blocks: [
          text(
            t(
              locale,
              `Tak, ${car.name} jest dostępne w wybranym terminie.`,
              `Yes, the ${car.name} is available for your dates.`,
            ),
          ),
          { kind: "cars", cars: [car] },
          datesBlock(locale, slots.dateFrom, slots.dateTo),
        ],
        slots: withDateIntent(slots, "CHECK_AVAILABILITY"),
        locale,
        intent: "CHECK_AVAILABILITY",
        unanswered: false,
        handoff: false,
      };
    }

    const alternatives = await findAlternatives(
      car.modelId,
      { from: slots.dateFrom, to: slots.dateTo },
      locale,
      slots.seats,
      statedBudget(slots),
    );

    /**
     * Two different kinds of "no", and they need two different answers.
     *
     * `bookableUnits === 0` means the model has no rentable car at all right
     * now — every unit is out of service or withdrawn. No date fixes that, so
     * offering a calendar would send the customer to try Tuesday, then
     * Wednesday, then give up. A car that is merely taken for these dates is
     * the opposite case: the calendar is exactly the right offer.
     */
    const withdrawn = car.bookableUnits === 0;

    // Three ways out, in the order they are worth taking: a car that is free
    // now, the same car on other dates, a person. Ending on "niedostępne" was
    // the whole complaint — it is a true sentence that closes a sale.
    const ways = [
      ...(alternatives.length > 0
        ? [
            {
              label: t(locale, "🚗 Pokaż podobne", "🚗 Show similar"),
              value: t(locale, "pokaz podobne auta", "show similar cars"),
            },
          ]
        : []),
      ...(this.can.handoff
        ? [
            {
              label: t(locale, "💬 Skontaktuj się", "💬 Get in touch"),
              value: t(
                locale,
                "porozmawiaj z pracownikiem",
                "talk to a person",
              ),
            },
          ]
        : []),
    ];

    const nudge = alternatives.length === 0 && !slots.nudged;

    return {
      blocks: [
        text(
          withdrawn
            ? t(
                locale,
                `${car.name} jest w naszej flocie, ale w tej chwili nie jest wynajmowane — żadna sztuka nie jest dostępna do wynajmu. Mogę pokazać podobne samochody albo połączyć Cię z pracownikiem.`,
                `The ${car.name} is in our fleet, but it is not being rented at the moment — no unit is available for hire. I can show you similar cars or put you in touch with someone.`,
              )
            : t(
                locale,
                `${car.name} nie jest dostępne w wybranym terminie. Mogę znaleźć podobne dostępne samochody albo sprawdzić inny termin.`,
                `The ${car.name} is not available for those dates. I can find similar cars that are free, or check other dates.`,
              ),
        ),
        ...(alternatives.length > 0
          ? ([
              text(
                t(
                  locale,
                  "Te auta są wolne w tym terminie:",
                  "These cars are free for those dates:",
                ),
              ),
              { kind: "cars", cars: alternatives },
            ] as ChatBlock[])
          : [
              text(
                withdrawn
                  ? t(
                      locale,
                      "Nie mam w tej chwili innego auta spełniającego te kryteria. Zostawię Cię z kontaktem do opiekuna.",
                      "I have no other car matching those criteria right now. Let me give you a contact instead.",
                    )
                  : t(
                      locale,
                      "W tym terminie nie mam też innego wolnego auta. Mogę sprawdzić inny termin.",
                      "I have no other car free for those dates either. I can check different dates.",
                    ),
              ),
            ]),
        ...(nudge ? askWhatTheyWant(locale) : []),
        /*
         * "Inny termin" is the calendar itself, not a phrase to send back.
         *
         * It used to be a quick-reply reading "inny termin", which the parser
         * had no rule for: the button the assistant offered came back as "nie
         * rozumiem". Now the same button opens the picker in place, so the
         * dead end that this whole branch exists to rescue ends in a date
         * grid rather than a question.
         */
        ...(withdrawn
          ? []
          : [
              datesBlock(
                locale,
                null,
                null,
                t(locale, "📅 Wybierz inny termin", "📅 Choose other dates"),
              ),
            ]),
        // Can be empty now that "inny termin" is a picker rather than a
        // phrase: with no alternatives and the handoff switched off there is
        // nothing left to put in it, and an empty row of buttons is a bug.
        ...(ways.length > 0
          ? ([{ kind: "quick", options: ways }] as ChatBlock[])
          : []),
      ],
      slots: {
        ...withDateIntent(slots, "CHECK_AVAILABILITY"),
        nudged: slots.nudged || nudge,
      },
      locale,
      intent: "CHECK_AVAILABILITY",
      // The car is ours and it was taken — the one fact that separates "buy a
      // car like this" from "buy another of the car we already have".
      unavailable: true,
      alternativesShown: alternatives.length > 0,
      unanswered: false,
      handoff: false,
    };
  }

  private async price(
    locale: Locale,
    slots: ChatSlots,
    parsed: Parsed,
  ): Promise<ChatReply> {
    if (slots.carModelIds.length === 0) {
      return askWhichCar(locale, slots, "GET_PRICE");
    }
    const modelId = slots.carModelIds[0];

    // Dates known → the full, checkable answer.
    if (slots.dateFrom && slots.dateTo) {
      const locationSlug = slots.locationId
        ? await locationSlugById(slots.locationId)
        : null;
      const quote = await quoteFor(
        modelId,
        slots.dateFrom,
        slots.dateTo,
        locationSlug,
        locale,
      );
      if (!quote) return askWhichCar(locale, slots, "GET_PRICE");
      if (quote.onRequest) {
        return this.priceOnRequest(locale, slots, "GET_PRICE");
      }

      /**
       * A real price for a car that is taken — answered, then followed up.
       *
       * The quote itself stays: the customer asked what it costs and the honest
       * answer is the number, which the widget already marks in red as not
       * available and refuses to put a booking button under. What was missing
       * was everything after it. The conversation ended on a price nobody could
       * act on, with no similar car, no other date and no person offered — the
       * same dead end `availability` was rebuilt to remove, still open on the
       * route most customers actually take, because they ask what it costs
       * before they ask whether it is free.
       */
      if (!quote.available) {
        const alternatives = await findAlternatives(
          modelId,
          { from: slots.dateFrom, to: slots.dateTo },
          locale,
          slots.seats,
          statedBudget(slots),
        );
        // No rentable unit at all is not "taken this week": no date helps, so
        // the calendar is not offered for it. Same distinction as `availability`.
        const withdrawn = quote.car.bookableUnits === 0;
        return {
          blocks: [
            { kind: "quote", quote },
            text(
              withdrawn
                ? t(
                    locale,
                    `${quote.car.name} nie jest w tej chwili wynajmowane — to cena orientacyjna. Mogę pokazać auta, które są wolne, albo połączyć Cię z pracownikiem.`,
                    `The ${quote.car.name} is not currently being rented out — that price is indicative. I can show you cars that are free, or put you in touch with someone.`,
                  )
                : t(
                    locale,
                    `To cena dla ${quote.car.name} w tym terminie, ale w tych dniach auto jest już zajęte. Mogę pokazać podobne wolne auta albo policzyć to samo auto na inny termin.`,
                    `That is the price for the ${quote.car.name} for those dates, but it is already taken then. I can show you similar cars that are free, or price the same car for other dates.`,
                  ),
            ),
            ...(alternatives.length > 0
              ? [
                  text(
                    t(
                      locale,
                      "Te auta są wolne w tym terminie:",
                      "These cars are free for those dates:",
                    ),
                  ),
                  { kind: "cars" as const, cars: alternatives },
                ]
              : []),
            ...(withdrawn
              ? []
              : [
                  datesBlock(
                    locale,
                    null,
                    null,
                    t(
                      locale,
                      "📅 Wybierz inny termin",
                      "📅 Choose other dates",
                    ),
                  ),
                ]),
            ...(this.can.handoff
              ? [
                  {
                    kind: "quick" as const,
                    options: [
                      {
                        label: t(
                          locale,
                          "💬 Skontaktuj się",
                          "💬 Get in touch",
                        ),
                        value: t(
                          locale,
                          "porozmawiaj z pracownikiem",
                          "talk to a person",
                        ),
                      },
                    ],
                  },
                ]
              : []),
          ],
          slots: withDateIntent(slots, "GET_PRICE"),
          locale,
          intent: "GET_PRICE",
          unanswered: false,
          handoff: false,
        };
      }

      return {
        blocks: [
          { kind: "quote", quote },
          datesBlock(locale, slots.dateFrom, slots.dateTo),
        ],
        slots: withDateIntent(slots, "GET_PRICE"),
        locale,
        intent: "GET_PRICE",
        unanswered: false,
        handoff: false,
      };
    }

    // Only a length was stated ("na tydzień") → price it, and say plainly that
    // availability has not been checked.
    const days = parsed.entities.days;
    if (days) {
      const price = await priceForDays(modelId, days);
      const car = await getCar(modelId, locale);
      if (!price || !car) return askWhichCar(locale, slots, "GET_PRICE");
      if (price.onRequest) {
        return this.priceOnRequest(locale, slots, "GET_PRICE");
      }
      return {
        blocks: [
          text(
            t(
              locale,
              `${car.name} na ${price.days} dni: ${money(price.rentalGrosze, locale)} (${money(price.dailyGrosze, locale)} za dobę). Kaucja ${money(car.depositGrosze, locale)}.`,
              `${car.name} for ${price.days} days: ${money(price.rentalGrosze, locale)} (${money(price.dailyGrosze, locale)} per day). Deposit ${money(car.depositGrosze, locale)}.`,
            ),
          ),
          text(
            t(
              locale,
              "To cena samego wynajmu — bez dopłaty za miejsce odbioru i usług dodatkowych. Wybierz konkretny termin, a sprawdzę dostępność i policzę całość.",
              "That is the rental charge alone — pickup fees and extras are not included. Choose exact dates and I will check availability and calculate the full price.",
            ),
          ),
          datesBlock(locale, null, null),
        ],
        slots: {
          ...withDateIntent(slots, "GET_PRICE"),
          awaiting: "dates",
          pendingIntent: "GET_PRICE",
        },
        locale,
        intent: "GET_PRICE",
        unanswered: false,
        handoff: false,
      };
    }

    return askDates(locale, { ...slots, pendingIntent: "GET_PRICE" });
  }

  /**
   * When we work — four facts, and the one the customer actually asked about.
   *
   * The office takes reservations 08:00–23:00, the phone is answered
   * 07:00–24:00, after midnight there is e-mail, and a car changes hands at any
   * hour if it was arranged. Answering all four every time is how a customer
   * stops reading, so the sentence in front of them is picked from what they
   * asked, and the rest is added only when nothing narrows it down.
   *
   * Every number comes from the admin settings through
   * `lib/company/service-hours` — the same call the contact page makes. The
   * assistant has no hours of its own to get wrong.
   */
  private async hours(
    locale: Locale,
    slots: ChatSlots,
    message: string,
  ): Promise<ChatReply> {
    const h = await getServiceHours(locale);
    const q = normalize(message);

    const aboutHandover =
      /\bodbi|\bodebra|\bodbior|\bzwrot|\boddac|\bwydani|\bcollect|\bpick up|\bpickup|\breturn|\bhand over|\bhandover/.test(
        q,
      );
    const aboutPhone =
      /\bzadzwon|\bdzwoni|\btelefon|\bcall|\bphone|\bring/.test(q);
    const aboutOffice =
      /\bbiur|\bczynn|\botwart|\brezerwacj|\boffice|\bopen|\bbooking desk/.test(
        q,
      );

    // A time in the message is answered against the phone window, because that
    // is the window the customer is asking about when they name an hour.
    const stated = statedHour(message, q);
    const outsidePhone = stated !== null && !withinPhoneWindow(stated, h);

    const blocks: ChatBlock[] = [];

    if (aboutHandover) {
      blocks.push(
        text(
          t(
            locale,
            `Odbiór i zwrot samochodu są możliwe ${h.lines[2].value} — również w nocy, także przy nocnych i opóźnionych lotach.`,
            `Cars are collected and returned ${h.lines[2].value} — at night too, delayed and night flights included.`,
          ),
        ),
      );
      if (outsidePhone) {
        blocks.push(text(h.note));
      }
    } else if (outsidePhone) {
      // "Jest 00:30, jak mogę się skontaktować?" — the honest answer is e-mail,
      // plus the one thing that does still happen at that hour.
      blocks.push(
        text(
          t(
            locale,
            `Telefonicznie jesteśmy dostępni codziennie w godzinach ${h.phone}. ${h.note}`,
            `We answer the phone every day between ${h.phone}. ${h.note}`,
          ),
        ),
      );
    } else if (aboutPhone) {
      blocks.push(
        text(
          t(
            locale,
            `Telefonicznie jesteśmy dostępni codziennie w godzinach ${h.phone}.`,
            `We answer the phone every day between ${h.phone}.`,
          ),
        ),
      );
    } else if (aboutOffice) {
      blocks.push(
        text(
          t(
            locale,
            `Biuro i obsługa rezerwacji A&A Corporation są dostępne w godzinach ${h.office}.`,
            `The A&A Corporation office and reservations desk are open ${h.office}.`,
          ),
        ),
      );
    } else {
      blocks.push(
        text(
          h.lines.map((l) => `${l.label}: ${l.value}`).join("\n") +
            `\n\n${h.note}`,
        ),
      );
    }

    // The one thing none of the four facts says, and the one the customer most
    // needs to hear at 00:30: the site does not close.
    blocks.push(
      text(
        t(
          locale,
          "Rezerwacja online działa całą dobę — możesz sprawdzić dostępność i zarezerwować auto o dowolnej porze.",
          "Booking online works around the clock — you can check availability and reserve a car at any hour.",
        ),
      ),
    );

    if (!aboutHandover && (outsidePhone || (!aboutPhone && !aboutOffice))) {
      const contact = await getContact(locale);
      blocks.push({
        kind: "contact",
        phones: contact.phones,
        email: contact.email,
        hours: contact.hours,
      });
    }

    return {
      blocks,
      slots,
      locale,
      intent: "OPENING_HOURS",
      unanswered: false,
      handoff: false,
    };
  }

  private async deposit(locale: Locale, slots: ChatSlots): Promise<ChatReply> {
    if (slots.carModelIds.length === 0) {
      return askWhichCar(locale, slots, "GET_DEPOSIT");
    }
    const car = await getCar(slots.carModelIds[0], locale);
    if (!car) return askWhichCar(locale, slots, "GET_DEPOSIT");

    const extras = await getExtras(locale);
    const noDeposit = extras.find(
      (e) => e.label.includes("kaucji") || e.label.includes("deposit"),
    );

    return {
      blocks: [
        text(
          t(
            locale,
            `Kaucja za ${car.name} wynosi ${money(car.depositGrosze, locale)}. Jest zwrotna — pobieramy ją na czas wynajmu i zwracamy po oddaniu auta bez uszkodzeń.`,
            `The deposit for the ${car.name} is ${money(car.depositGrosze, locale)}. It is refundable — held for the rental and returned when the car comes back undamaged.`,
          ),
        ),
        ...(noDeposit
          ? [
              text(
                t(
                  locale,
                  `Możesz też wynająć bez kaucji za dopłatą ${money(noDeposit.amountGrosze, locale)}${noDeposit.unit === "per_day" ? " za dobę" : ""}.`,
                  `You can also rent with no deposit for ${money(noDeposit.amountGrosze, locale)}${noDeposit.unit === "per_day" ? " per day" : ""}.`,
                ),
              ),
            ]
          : []),
        { kind: "cars", cars: [car] },
      ],
      slots,
      locale,
      intent: "GET_DEPOSIT",
      unanswered: false,
      handoff: false,
    };
  }

  /**
   * Limit kilometrów, stawka za nadprzebieg i — gdy klient podał liczby —
   * gotowe wyliczenie dopłaty.
   *
   * ŻADNEJ WŁASNEJ TABELI STAWEK. `car.extraMileageFeeGrosze` przychodzi
   * z `car_models`, czyli z tego samego wiersza, który czyta karta auta,
   * formularz rezerwacji i rozliczenie zwrotu. Reguła limitu pochodzi
   * z `lib/booking/mileage`, czyli z Regulaminu §9. Asystent nie zna tu ani
   * jednej liczby z pamięci — i to jest cały warunek, żeby jego odpowiedź nie
   * rozjechała się z ceną po pierwszej zmianie w panelu.
   *
   * TRZY POZIOMY ODPOWIEDZI, zależnie od tego, ile klient powiedział:
   *   1. samo auto              → limit + stawka,
   *   2. auto + kilometry       → jak wyżej, plus dopłata dla najmu, o którym
   *                               mowa (domyślnie dobowego),
   *   3. auto + dni + kilometry → pełny rachunek: limit dla tych dni, ile
   *                               ponad, ile to kosztuje.
   */
  private async mileage(
    locale: Locale,
    slots: ChatSlots,
    parsed?: Parsed,
  ): Promise<ChatReply> {
    if (slots.carModelIds.length === 0) {
      return askWhichCar(locale, slots, "GET_MILEAGE_LIMIT");
    }
    const car = await getCar(slots.carModelIds[0], locale);
    if (!car) return askWhichCar(locale, slots, "GET_MILEAGE_LIMIT");

    const zdania: string[] = [];

    if (car.kmPerDayLimit <= 0) {
      // Bez limitu nie ma nadprzebiegu — i nie ma o czym liczyć.
      zdania.push(
        t(
          locale,
          `${car.name}: bez limitu kilometrów.`,
          `${car.name}: unlimited mileage.`,
        ),
      );
      return {
        blocks: [text(zdania.join(" ")), { kind: "cars", cars: [car] }],
        slots,
        locale,
        intent: "GET_MILEAGE_LIMIT",
        unanswered: false,
        handoff: false,
      };
    }

    /*
      Długość najmu z pytania, gdy padła („na 3 dni"). Bez niej mówimy o progu
      dobowym — pierwszym przedziale Regulaminu — a nie zgadujemy, że klient
      ma na myśli tydzień.
    */
    const dni = parsed?.entities.days ?? null;
    const dniDoLimitu = dni ?? 1;
    const limitNaDobe = limitKmNaDobe(dniDoLimitu, car.kmPerDayLimit);
    const limitLaczny = limitKmDlaNajmu(dniDoLimitu, car.kmPerDayLimit);

    zdania.push(
      dni && limitLaczny != null
        ? t(
            locale,
            `${car.name} na ${dni} dni: limit ${limitLaczny.toLocaleString("pl-PL")} km (${limitNaDobe?.toLocaleString("pl-PL")} km na dobę).`,
            `${car.name} for ${dni} days: ${limitLaczny.toLocaleString("en-GB")} km included (${limitNaDobe?.toLocaleString("en-GB")} km per day).`,
          )
        : t(
            locale,
            `${car.name}: limit ${car.kmPerDayLimit.toLocaleString("pl-PL")} km na dobę.`,
            `${car.name}: ${car.kmPerDayLimit.toLocaleString("en-GB")} km per day included.`,
          ),
    );

    if (car.extraMileageFeeGrosze == null) {
      /*
        Stawki nie ustawiono. Mówimy o tym wprost i kierujemy do człowieka —
        wymyślenie liczby albo podanie „typowej" byłoby wyceną, której nikt nie
        zatwierdził, a klient zapamiętałby ją jako obietnicę.
      */
      zdania.push(
        t(
          locale,
          "Stawkę za kilometry ponad limit ustalamy dla tego auta indywidualnie — napisz albo zadzwoń, podamy ją od ręki.",
          "The rate for kilometres above the limit is quoted individually for this car — write or call and we will give it to you straight away.",
        ),
      );
    } else {
      const stawka = stawkaZaKm(car.extraMileageFeeGrosze, locale);
      zdania.push(
        t(
          locale,
          `Każdy kilometr ponad limit: ${stawka}/km.`,
          `Every kilometre above the limit: ${stawka}/km.`,
        ),
      );

      /*
        Klient podał przebieg — liczymy. `km` to LICZBA Z PYTANIA i dopiero tu
        rozstrzygamy, czym jest: przy podanej długości najmu traktujemy ją jako
        przejechany dystans („na 3 dni przejadę 1000 km"), bez niej — jako sam
        nadmiar ponad limit („dodatkowe 100 km"). To rozróżnienie robi różnicę
        w rachunku, więc odpowiedź nazywa je wprost, zamiast podać samą kwotę.
      */
      const km = parsed?.entities.km ?? null;
      if (km != null && km > 0) {
        if (dni != null && limitLaczny != null) {
          const ponad = nadprzebiegKm(km, limitLaczny);
          const oplata = oplataNadprzebiegGrosze(
            km,
            limitLaczny,
            car.extraMileageFeeGrosze,
          );
          zdania.push(
            ponad === 0
              ? t(
                  locale,
                  `Przy ${km.toLocaleString("pl-PL")} km mieścisz się w limicie — bez dopłaty.`,
                  `At ${km.toLocaleString("en-GB")} km you stay within the limit — no extra charge.`,
                )
              : t(
                  locale,
                  `Przy ${km.toLocaleString("pl-PL")} km to ${ponad.toLocaleString("pl-PL")} km ponad limit, czyli ${money(oplata ?? 0, locale)} dopłaty.`,
                  `At ${km.toLocaleString("en-GB")} km that is ${ponad.toLocaleString("en-GB")} km over the limit, so ${money(oplata ?? 0, locale)} extra.`,
                ),
          );
        } else {
          const oplata = km * car.extraMileageFeeGrosze;
          zdania.push(
            t(
              locale,
              `${km.toLocaleString("pl-PL")} km ponad limit to ${money(oplata, locale)}.`,
              `${km.toLocaleString("en-GB")} km above the limit comes to ${money(oplata, locale)}.`,
            ),
          );
        }
      }
    }

    return {
      blocks: [text(zdania.join(" ")), { kind: "cars", cars: [car] }],
      slots,
      locale,
      intent: "GET_MILEAGE_LIMIT",
      unanswered: false,
      handoff: false,
    };
  }

  /**
   * One attribute of the cars already under discussion, ranked.
   *
   * Reads the same `getCar` the comparison table reads, so a price the panel
   * changed this morning is the price in this sentence — there is no second
   * source and no cached figure.
   *
   * Two rules of wording, both from the commission. It never calls a car "the
   * best": cheaper is cheaper and roomier is roomier, and neither makes a car
   * better for a customer whose reason for choosing is not in the data. And
   * when two cars are equal it says so, rather than picking the first and
   * sounding certain.
   */
  /**
   * What one add-on costs, from the fee catalogue the booking form charges from.
   *
   * One source, so a fee the owner edits in Admin → Cennik is the fee in this
   * sentence on the next message. `getFeeCatalog` already resolves an inactive
   * row to the built-in default, which is what the booking form will actually
   * charge — so quoting whatever it returns is the only way the sentence and
   * the invoice agree.
   */
  private async extraFee(
    locale: Locale,
    slots: ChatSlots,
    topic:
      | "extra_driver"
      | "child_seat"
      | "no_deposit"
      | "protection_package"
      | "delivery",
    /** Liczba dni z pytania („na 3 dni"), gdy klient ją podał. */
    days: number | null = null,
  ): Promise<ChatReply> {
    const fees = await getFeeCatalog();

    /*
     * Dostawa nie jest dodatkiem z katalogu `fees` — jest opłatą punktu odbioru
     * i mieszka w `pickup_locations`. Odpowiada jednak na dokładnie to samo
     * pytanie („ile kosztuje…"), więc odpowiada ta sama funkcja, czytając
     * kwotę z tego samego miejsca, z którego liczy formularz rezerwacji.
     */
    if (topic === "delivery") {
      const dostawa = (await getLocationOptions(locale)).find(
        (l) => l.slug === "delivery",
      );
      const kwota = dostawa ? money(dostawa.feeGrosze, locale) : null;
      return {
        blocks: [
          text(
            kwota
              ? t(
                  locale,
                  `Dostawa auta pod wskazany adres w Warszawie: ${kwota}. Podaj adres przy rezerwacji, a podstawimy auto na miejsce.`,
                  `Delivery to an address in Warsaw: ${kwota}. Give us the address when booking and we will bring the car to you.`,
                )
              : t(
                  locale,
                  "Dostawę pod adres wyceniamy indywidualnie — napisz, dokąd mamy podstawić auto.",
                  "Delivery is quoted individually — tell us where the car should go.",
                ),
          ),
        ],
        slots,
        locale,
        intent: "GET_PRICE",
        unanswered: false,
        handoff: false,
      };
    }

    const entry = {
      extra_driver: {
        fee: fees.extraDriver,
        label: t(locale, "Dodatkowy kierowca", "An additional driver"),
      },
      child_seat: {
        fee: fees.childSeat,
        label: t(locale, "Fotelik dziecięcy", "A child seat"),
      },
      no_deposit: {
        fee: fees.noDeposit,
        label: t(locale, "Wynajem bez kaucji", "Renting without a deposit"),
      },
      protection_package: {
        fee: fees.protectionPackage,
        label: t(locale, "Pakiet ochronny", "The protection package"),
      },
    }[topic];

    const per =
      entry.fee.unit === "per_day"
        ? t(locale, " za dobę", " per day")
        : t(locale, " za cały wynajem", " for the whole rental");

    /*
     * Granica naliczenia musi paść w tym samym zdaniu co stawka.
     *
     * „Dodatkowy kierowca: 50 zł za dobę" przy dziesięciodniowym wynajmie
     * czyta się jako 500 zł, a formularz naliczy 400 zł. Klient, który usłyszy
     * samą stawkę, dostanie potem niższy rachunek — co brzmi niegroźnie, ale
     * jest tym samym rozjazdem między słowem a fakturą, tyle że w drugą
     * stronę. Liczba pochodzi z katalogu, nie z tego zdania.
     */
    const cap = entry.fee.capGrosze
      ? t(
          locale,
          `, maksymalnie ${money(entry.fee.capGrosze, locale)} za cały wynajem`,
          `, capped at ${money(entry.fee.capGrosze, locale)} for the whole rental`,
        )
      : "";

    /*
     * „Na 3 dni" zasługuje na liczbę, a nie na stawkę do przemnożenia.
     *
     * Klient, który podał długość, zadał pytanie o KWOTĘ. Odpowiedź „50 zł za
     * dobę" jest prawdziwa i zostawia mu mnożenie — a przy granicy 400 zł to
     * mnożenie daje zły wynik od ósmej doby. Kwotę liczy `computeQuote`, ten
     * sam silnik, który wystawi rachunek, więc zdanie i faktura nie mają jak
     * się rozminąć.
     */
    let zaOkres = "";
    if (days && days > 0 && entry.fee.unit === "per_day") {
      const suma = feeAmount(entry.fee, days);
      zaOkres = t(
        locale,
        ` Za ${days} ${days === 1 ? "dzień" : "dni"} to ${money(suma, locale)}.`,
        ` For ${days} ${days === 1 ? "day" : "days"} that comes to ${money(suma, locale)}.`,
      );
    }

    return {
      blocks: [
        text(
          t(
            locale,
            `${entry.label}: ${money(entry.fee.amountGrosze, locale)}${per}${cap}.${zaOkres} Wystarczy zaznaczyć przy rezerwacji.`,
            `${entry.label}: ${money(entry.fee.amountGrosze, locale)}${per}${cap}.${zaOkres} Just tick it when booking.`,
          ),
        ),
      ],
      slots,
      locale,
      intent: "GET_PRICE",
      unanswered: false,
      handoff: false,
    };
  }

  private async compareAspect(
    locale: Locale,
    slots: ChatSlots,
    aspect: "price" | "seats" | "deposit" | "mileage",
  ): Promise<ChatReply> {
    const cars = (
      await Promise.all(
        slots.carModelIds.slice(0, 3).map((id) => getCar(id, locale)),
      )
    ).filter((c): c is ChatCar => c !== null);

    if (cars.length < 2) return askWhichCar(locale, slots, "COMPARE_CARS");

    const valueOf = (c: ChatCar): number =>
      aspect === "price"
        ? c.fromDailyGrosze
        : aspect === "seats"
          ? c.seats
          : aspect === "deposit"
            ? c.depositGrosze
            : c.kmPerDayLimit;

    const asText = (c: ChatCar): string =>
      aspect === "seats"
        ? String(c.seats)
        : aspect === "mileage"
          ? c.kmPerDayLimit > 0
            ? `${c.kmPerDayLimit.toLocaleString("pl-PL")} km`
            : t(locale, "bez limitu", "unlimited")
          : money(valueOf(c), locale);

    const listing = cars.map((c) => `• ${c.name}: ${asText(c)}`).join("\n");
    const values = cars.map(valueOf);
    const allEqual = values.every((v) => v === values[0]);

    /* Which end of the scale answers the question. For seats and mileage the
       customer asking "więcej" wants the larger number; for price and deposit
       the interesting end is the lower one. */
    const wantsHigh = aspect === "seats" || aspect === "mileage";
    const winner = [...cars].sort((a, b) =>
      wantsHigh ? valueOf(b) - valueOf(a) : valueOf(a) - valueOf(b),
    )[0];

    const headline = allEqual
      ? t(
          locale,
          "Pod tym względem oba auta są takie same:",
          "On that they are the same:",
        )
      : aspect === "price"
        ? t(
            locale,
            `Taniej wypada ${winner.name} — ceny „od” za dobę:`,
            `The ${winner.name} is the cheaper of the two — "from" rates per day:`,
          )
        : aspect === "seats"
          ? t(
              locale,
              `Więcej miejsc ma ${winner.name}:`,
              `The ${winner.name} has more seats:`,
            )
          : aspect === "deposit"
            ? t(
                locale,
                `Niższą kaucję ma ${winner.name}:`,
                `The ${winner.name} has the lower deposit:`,
              )
            : t(
                locale,
                `Wyższy limit kilometrów ma ${winner.name}:`,
                `The ${winner.name} has the higher mileage limit:`,
              );

    /* The gap itself, when it is a sum of money and the question was about a
       difference. "O ile" is what "jaka jest różnica w kaucji" actually asks;
       two numbers and a subtraction left to the reader is half an answer. */
    const spread =
      !allEqual && (aspect === "price" || aspect === "deposit")
        ? t(
            locale,
            `Różnica to ${money(Math.max(...values) - Math.min(...values), locale)}.`,
            `The difference is ${money(Math.max(...values) - Math.min(...values), locale)}.`,
          )
        : null;

    return {
      blocks: [
        text(headline),
        text(listing),
        ...(spread ? [text(spread)] : []),
        ...(aspect === "price"
          ? [
              text(
                t(
                  locale,
                  "Ceny „od” dotyczą najdłuższego wynajmu. Podaj termin, a policzę dokładnie dla obu.",
                  "The “from” rates are for the longest rentals. Give me dates and I will price both exactly.",
                ),
              ),
            ]
          : []),
      ],
      // Both cars stay pinned: the next question is almost always about the
      // same pair, and dropping one here would make "a kaucja?" ambiguous.
      slots: withDateIntent(slots, "COMPARE_CARS"),
      locale,
      intent: "COMPARE_CARS",
      unanswered: false,
      handoff: false,
    };
  }

  private async compare(locale: Locale, slots: ChatSlots): Promise<ChatReply> {
    if (slots.carModelIds.length < 2) {
      return {
        blocks: [
          text(
            t(
              locale,
              "Które dwa samochody mam porównać? Napisz oba, na przykład „porównaj XC60 i RAV4”.",
              "Which two cars should I compare? Name both, for example “compare XC60 and RAV4”.",
            ),
          ),
        ],
        slots: {
          ...slots,
          awaiting: "which_car",
          pendingIntent: "COMPARE_CARS",
        },
        locale,
        intent: "COMPARE_CARS",
        unanswered: false,
        handoff: false,
      };
    }

    const cars = (
      await Promise.all(
        slots.carModelIds.slice(0, 3).map((id) => getCar(id, locale)),
      )
    ).filter((c): c is ChatCar => c !== null);

    if (cars.length < 2) return askWhichCar(locale, slots, "COMPARE_CARS");

    const rows = [
      {
        label: t(locale, "Cena od (doba)", "From (per day)"),
        values: cars.map((c) => money(c.fromDailyGrosze, locale)),
      },
      {
        label: t(locale, "Miejsca", "Seats"),
        values: cars.map((c) => String(c.seats)),
      },
      {
        label: t(locale, "Skrzynia", "Gearbox"),
        values: cars.map((c) => label(GEARBOX_LABEL, c.gearbox, locale)),
      },
      {
        label: t(locale, "Paliwo", "Fuel"),
        values: cars.map((c) => label(FUEL_LABEL, c.fuel, locale)),
      },
      {
        label: t(locale, "Kaucja", "Deposit"),
        values: cars.map((c) => money(c.depositGrosze, locale)),
      },
      {
        label: t(locale, "Limit km/dobę", "Km per day"),
        values: cars.map((c) =>
          c.kmPerDayLimit > 0
            ? c.kmPerDayLimit.toLocaleString("pl-PL")
            : t(locale, "bez limitu", "unlimited"),
        ),
      },
      {
        label: t(locale, "Klasa", "Class"),
        values: cars.map(
          (c) =>
            c.segments.map((s) => label(SEGMENT_LABEL, s, locale)).join(", ") ||
            "—",
        ),
      },
    ];

    return {
      blocks: [
        { kind: "compare", cars, rows },
        text(
          t(
            locale,
            "Na jaki termin potrzebujesz samochodu? Sprawdzę dostępność i policzę cenę dla obu.",
            "What dates do you need? I will check availability and price both.",
          ),
        ),
        datesBlock(locale, slots.dateFrom, slots.dateTo),
      ],
      slots: {
        ...withDateIntent(slots, "CHECK_AVAILABILITY"),
        awaiting: "dates",
        pendingIntent: "CHECK_AVAILABILITY",
      },
      locale,
      intent: "COMPARE_CARS",
      unanswered: false,
      handoff: false,
    };
  }

  /**
   * "Skąd odbieram auto?" / "Jednak odbiór w centrum."
   *
   * Answered by listing the pickup points that exist, with the surcharges the
   * panel holds — never by deciding what an unrecognised place name refers to.
   * A customer saying "centrum" may mean the office, may mean delivery to a
   * hotel, and the assistant has no way to know which; picking one would be
   * inventing a company fact from a word.
   *
   * So it states the real options and hands the choice back. That is the
   * difference between "I do not know" — which is what this used to say, about
   * our own locations — and "here is what there is".
   */
  private async pickupPoints(
    locale: Locale,
    slots: ChatSlots,
  ): Promise<ChatReply> {
    const locations = await getLocationOptions(locale);

    if (locations.length === 0) {
      return {
        blocks: [
          text(
            t(
              locale,
              "Nie mam w tej chwili skonfigurowanych miejsc odbioru — pracownik A&A ustali szczegóły.",
              "No pickup points are configured right now — someone from A&A will sort out the details.",
            ),
          ),
          { kind: "contact", ...(await getContact(locale)) },
        ],
        slots,
        locale,
        intent: "PICKUP_POINT",
        // Worth the owner seeing: somebody asked where to collect a car and the
        // system had nowhere to send them.
        unanswered: true,
        handoff: false,
      };
    }

    return {
      blocks: [
        text(
          t(
            locale,
            "Auto możesz odebrać w jednym z tych miejsc:",
            "You can collect the car at any of these:",
          ),
        ),
        text(
          locations
            .map(
              (l) =>
                `• ${l.name}${l.address ? ` — ${l.address}` : ""} — ${
                  l.feeGrosze === 0
                    ? t(locale, "bez dopłaty", "no fee")
                    : money(l.feeGrosze, locale)
                }`,
            )
            .join("\n"),
        ),
        text(
          t(
            locale,
            "Napisz, które miejsce Ci pasuje — albo podaj adres, jeśli wolisz dostawę pod wskazane miejsce.",
            "Tell me which suits you — or give an address if you would rather have the car delivered.",
          ),
        ),
        {
          kind: "quick",
          options: locations.slice(0, 4).map((l) => ({
            label: l.name,
            value: l.name,
          })),
        },
      ],
      // The location slot is deliberately left as it was. The customer has not
      // chosen yet, and overwriting a pickup point they gave earlier with
      // "somewhere, undecided" would lose information, not gain it.
      slots,
      locale,
      intent: "PICKUP_POINT",
      unanswered: false,
      handoff: false,
    };
  }

  private async airport(
    locale: Locale,
    slots: ChatSlots,
    parsed: Parsed,
  ): Promise<ChatReply> {
    const locations = await getLocationOptions(locale);
    const airports = locations.filter((l) => l.slug.startsWith("airport"));

    /**
     * The customer said everything in one breath — "od 20 do 25 sierpnia, 5
     * osób, Lotnisko Chopina" — and the reply below asked for the dates and
     * the headcount again, because it only ever read the location.
     *
     * When the message already carries what a search needs, do the search.
     * Nobody should have to type a date twice to a machine that repeated it
     * back to them.
     */
    /**
     * An airport we do not serve, named by the customer.
     *
     * Modlin is the one that matters. There has never been a Modlin pickup
     * point in the booking system, and on 31.08.2026 the owner confirmed there
     * is no such service: the landing page was retired and the marketing copy
     * stopped naming it. The question still arrives — from old links, from the
     * airport's own reputation — and asked about it, the assistant used to
     * reply "airport pickup is available" and list Chopin and Gdańsk: every
     * word true, and the whole answer misleading, because the customer's actual
     * question was never addressed.
     *
     * Matched against the pickup points that exist rather than a list of
     * airports we have heard of, so opening Modlin tomorrow needs no code
     * change — only the row.
     *
     * STOI PRZED `knowsEnough` I TO JEST CAŁA POPRAWKA. Gdy siedziało niżej,
     * zdanie „Modlin, 20–25 sierpnia, SUV" nie docierało tutaj w ogóle:
     * wyszukiwarka wyżej przypinała `airports[0]`, czyli Chopina, i klient
     * dostawał gotową CENĘ z cudzą dopłatą 200 zł, nie słysząc ani słowa
     * o tym, że o jego lotnisko nikt się nie ubiega. Im więcej klient
     * powiedział, tym gorszą dostawał odpowiedź — dokładnie odwrotnie, niż
     * powinno być.
     */
    const askedFor = parsed.normalized;
    const known = airports.map((a) => normalize(a.name));
    /*
     * Jedna lista, nie dwie. Pierwszeństwo ma `LOCATION_ALIASES` (zna odmiany
     * i skróty: „modlinie", „wmi"), a ręczna lista miast zostaje dla lotnisk,
     * których w aliasach nie ma i mieć nie muszą.
     */
    const aliasSlug = unservedLocationSlug(askedFor, await getVocabulary());
    const namedButUnserved =
      (aliasSlug?.startsWith("airport") ? aliasSlug : null) ??
      [
        "modlin",
        "krakow",
        "katowice",
        "wroclaw",
        "poznan",
        "rzeszow",
        "lublin",
      ].find(
        (city) =>
          askedFor.includes(city) && !known.some((k) => k.includes(city)),
      );
    if (namedButUnserved && airports.length > 0) {
      const list = airports
        .map((a) => `• ${a.name} — ${money(a.feeGrosze, locale)}`)
        .join("\n");
      const named = aliasSlug ? unservedPlaceSentence(aliasSlug, locale) : null;
      return {
        blocks: [
          text(
            named
              ? `${named}\n\n${t(locale, "Lotniska, które obsługujemy:", "The airports we do serve:")}\n${list}`
              : t(
                  locale,
                  `Nie obsługujemy tego lotniska — nie podstawiamy tam aut. Obsługujemy:\n${list}`,
                  `We do not serve that airport — we do not station cars there. The airports we do serve:\n${list}`,
                ),
          ),
          text(
            t(
              locale,
              "Jeśli potrzebujesz auta w innym mieście, pracownik A&A powie, co da się zorganizować.",
              "If you need a car in another city, someone from A&A can tell you what can be arranged.",
            ),
          ),
          mainMenu(locale),
        ],
        slots,
        locale,
        intent: "AIRPORT",
        // Worth the owner seeing: people are asking for airports we do not
        // serve, and that is a business signal, not a failure of wording.
        unanswered: true,
        handoff: false,
        unservedPlaceSaid: true,
      };
    }

    /**
     * The customer said everything in one breath — "od 20 do 25 sierpnia, 5
     * osób, Lotnisko Chopina" — and the reply below asked for the dates and
     * the headcount again, because it only ever read the location.
     *
     * When the message already carries what a search needs, do the search.
     * Nobody should have to type a date twice to a machine that repeated it
     * back to them.
     *
     * Siedzi PO sprawdzeniu miejsca, którego nie obsługujemy — patrz komentarz
     * wyżej. Skrót „dopowiedz brakujące lotnisko" wolno wziąć dopiero wtedy,
     * gdy klient nie nazwał lotniska, którego nie mamy.
     */
    const knowsEnough =
      Boolean(slots.dateFrom && slots.dateTo) &&
      Boolean(
        slots.seats ||
        slots.segment ||
        slots.bodyType ||
        slots.driverClass ||
        hasBudget(slots) ||
        slots.carModelIds.length > 0,
      );
    if (airports.length > 0 && knowsEnough) {
      return this.findCar(
        locale,
        // Pin the pickup point to an airport, since that is what was asked
        // for, but never overrule a specific one the customer named.
        { ...slots, locationId: slots.locationId ?? airports[0].id },
        parsed,
      );
    }

    return {
      blocks: [
        text(
          airports.length > 0
            ? t(
                locale,
                "Odbiór na lotnisku jest możliwy. Dostępne miejsca i dopłaty:",
                "Airport pickup is available. Locations and fees:",
              )
            : t(
                locale,
                "W tej chwili nie mam skonfigurowanego odbioru lotniskowego — połączę Cię z pracownikiem.",
                "Airport pickup is not configured right now — let me put you in touch with the team.",
              ),
        ),
        ...(airports.length > 0
          ? [
              text(
                airports
                  .map(
                    (a) =>
                      `• ${a.name} — ${a.feeGrosze === 0 ? t(locale, "bez dopłaty", "no fee") : money(a.feeGrosze, locale)}`,
                  )
                  .join("\n"),
              ),
            ]
          : []),
        text(
          t(
            locale,
            "Wybierz termin i liczbę pasażerów, a pokażę wolne auta z odbiorem na lotnisku.",
            "Choose your dates and how many passengers, and I will show cars free with airport pickup.",
          ),
        ),
        datesBlock(locale, slots.dateFrom, slots.dateTo),
      ],
      slots: {
        ...withDateIntent(slots, "FIND_CAR"),
        /*
         * Lotnisko, które klient NAZWAŁ, bije lotnisko kanoniczne.
         *
         * Stało tu `airports[0]?.id ?? slots.locationId`, czyli odwrotnie niż
         * w gałęzi wyszukiwania wyżej, gdzie ta sama zasada jest zapisana
         * poprawnie („never overrule a specific one the customer named").
         * Skutek na produkcji: „Lotnisko Gdańsk poproszę" zapisywało Lotnisko
         * Chopina. Dopłata identyczna (200 zł), więc cena niczego nie
         * zdradzała — mylił się sam GDZIE, o 340 km.
         *
         * Cudzy punkt sprzed kilku obrotów (biuro, dostawa) nadal ustępuje
         * lotnisku, bo rozmowa jest teraz o lotniskach: wygrywa tylko punkt,
         * który sam jest lotniskiem.
         */
        locationId:
          airports.find((a) => a.id === slots.locationId)?.id ??
          airports[0]?.id ??
          slots.locationId,
        awaiting: "dates",
        pendingIntent: "FIND_CAR",
      },
      locale,
      intent: "AIRPORT",
      unanswered: false,
      handoff: false,
    };
  }

  private async longTerm(
    locale: Locale,
    slots: ChatSlots,
    parsed: Parsed,
  ): Promise<ChatReply> {
    /*
     * A month or more is a different conversation from a long week.
     *
     * The answer below describes the published tiers, and the last of them —
     * "od 30 dni liczymy z ceny miesięcznej" — is only true if a monthly rate
     * exists. Today none does: every `monthly_price_grosze` in the fleet is
     * zero, so the calculator returns "on request" for exactly the rentals this
     * paragraph promises to price. Telling somebody asking about a year that we
     * bill from a monthly rate, and then having no monthly rate, is a promise
     * the next message has to withdraw.
     *
     * So a stated period of a month or more, with no monthly price anywhere in
     * the fleet, goes where it actually belongs: to a person, with the enquiry
     * saved. Nothing here is hardcoded — the day the owner enters monthly
     * rates, this branch stops firing on its own.
     */
    const statedDays =
      parsed.entities.days ??
      (/\bmiesi\w*|\brok\b|\broku\b|\blat\w*|\bmonths?\b|\byears?\b/.test(
        parsed.normalized,
      )
        ? 30
        : null);

    if (statedDays !== null && statedDays >= 30) {
      const fleet = await getFleet();
      const anyMonthlyRate = fleet.some((c) => c.monthlyPriceGrosze > 0);
      if (!anyMonthlyRate) {
        const contact = await getContact(locale);
        return {
          blocks: [
            text(
              t(
                locale,
                "Tak, prowadzimy wynajem długoterminowy. Warunki na taki okres ustalamy indywidualnie — nie ma dla niego stawki w cenniku, więc ofertę przygotowuje zespół A&A.",
                "Yes, we do long-term rentals. Terms for a period that long are agreed individually — there is no list rate for it, so the A&A team prepares the offer.",
              ),
            ),
            { kind: "contact", ...contact },
            {
              kind: "lead",
              notice: t(
                locale,
                "Zostaw numer lub e-mail i napisz, ile aut i na jak długo — opiekun wróci z ofertą. Dane wykorzystamy wyłącznie do kontaktu w tej sprawie.",
                "Leave a phone number or e-mail and say how many cars and for how long — we will come back with an offer. We will use it solely to contact you about this.",
              ),
            },
          ],
          slots: { ...slots, awaiting: "lead_contact" },
          locale,
          intent: "LONG_TERM",
          unanswered: false,
          handoff: true,
        };
      }
    }

    return {
      blocks: [
        text(
          t(
            locale,
            "Tak, prowadzimy wynajem długoterminowy. Im dłuższy okres, tym niższa stawka za dobę — progi to 3–6, 7–13, 14–29 i 30+ dni, a przy 30 dniach i więcej liczymy z ceny miesięcznej.",
            "Yes, we do long-term rentals. The longer the period, the lower the daily rate — the tiers are 3–6, 7–13, 14–29 and 30+ days, and from 30 days we bill from the monthly rate.",
          ),
        ),
        text(
          t(
            locale,
            "Powiedz, które auto Cię interesuje i na ile dni — policzę dokładnie z aktualnego cennika.",
            "Tell me which car and for how many days — I will calculate it exactly from the current price list.",
          ),
        ),
        {
          kind: "quick",
          options: [
            {
              label: t(locale, "🚗 Zobacz flotę", "🚗 See the fleet"),
              value: t(locale, "pokaż flotę", "show the fleet"),
            },
            {
              label: t(locale, "💬 Pracownik", "💬 Talk to a person"),
              value: t(
                locale,
                "porozmawiaj z pracownikiem",
                "talk to a person",
              ),
            },
          ],
        },
      ],
      slots: { ...slots, pendingIntent: "GET_PRICE" },
      locale,
      intent: "LONG_TERM",
      unanswered: false,
      handoff: false,
    };
  }

  /**
   * „Chcę zainwestować", „jak zostać partnerem", „ile na tym zarobię".
   *
   * DWA ZDANIA, KTÓRYCH TEN HANDLER NIGDY NIE POWIE, i to jest jego główna
   * treść: **żadnej liczby i żadnej obietnicy**. Ani stopy zwrotu, ani
   * procentu, ani „zarobisz", ani „zwrot po iluś miesiącach". Asystent nie
   * ma tych warunków, bo one nie istnieją jako cennik — ustala się je
   * indywidualnie po rozmowie o konkretnym aucie i konkretnym modelu. Liczba
   * wypowiedziana tutaj byłaby publiczną obietnicą inwestycyjną złożoną przez
   * automat, w imieniu firmy, bez niczyjej zgody.
   *
   * Dlatego pytanie o zysk trafia w to samo miejsce co pytanie o współpracę:
   * opis modeli, zdanie o indywidualnych warunkach i prośba o kontakt.
   * Odpowiedź jest ta sama, bo prawda jest ta sama.
   */
  private async partnership(
    locale: Locale,
    slots: ChatSlots,
  ): Promise<ChatReply> {
    const contact = await getContact(locale);
    return {
      blocks: [
        text(
          t(
            locale,
            "A&A rozwija flotę razem z partnerami. Rozmawiamy dziś o trzech formach współpracy: partner wnoszący konkretny samochód, udział w rozwoju większej części floty oraz szersza współpraca strategiczna.",
            "A&A grows its fleet together with partners. There are three forms of cooperation we discuss: a partner contributing a specific vehicle, a share in developing a larger part of the fleet, and a broader strategic partnership.",
          ),
        ),
        text(
          t(
            locale,
            "Warunki finansowe ustalamy indywidualnie, po rozmowie o konkretnym aucie i wybranym modelu współpracy — nie mam widełek ani stawek, które mógłbym podać z góry.",
            "Financial terms are agreed individually, after a conversation about the specific vehicle and the chosen model — I have no ranges or rates I could quote up front.",
          ),
        ),
        { kind: "contact", ...contact },
        {
          kind: "lead",
          notice: t(
            locale,
            "Zostaw numer lub e-mail i napisz, który model Cię interesuje — odezwiemy się i omówimy szczegóły. Dane wykorzystamy wyłącznie do kontaktu w tej sprawie.",
            "Leave a phone number or e-mail and tell us which model interests you — we will get back to you to discuss the details. We will use your details solely to contact you about this.",
          ),
        },
      ],
      slots: { ...slots, awaiting: "lead_contact" },
      locale,
      intent: "PARTNERSHIP",
      unanswered: false,
      handoff: false,
    };
  }

  private async business(locale: Locale, slots: ChatSlots): Promise<ChatReply> {
    const contact = await getContact(locale);
    return {
      blocks: [
        text(
          t(
            locale,
            "Obsługujemy firmy — wystawiamy faktury VAT i możemy ustalić warunki stałej współpracy. Szczegóły umowy i rozliczeń ustala zespół A&A.",
            "We work with companies — we issue VAT invoices and can arrange ongoing terms. Contract and billing details are agreed with the A&A team.",
          ),
        ),
        { kind: "contact", ...contact },
        {
          kind: "lead",
          notice: t(
            locale,
            "Zostaw numer lub e-mail, a opiekun odezwie się z ofertą dla firmy. Dane wykorzystamy wyłącznie do kontaktu w tej sprawie.",
            "Leave a phone number or e-mail and we will come back with a business offer. We will use it solely to contact you about this.",
          ),
        },
      ],
      slots: { ...slots, awaiting: "lead_contact" },
      locale,
      intent: "B2B",
      unanswered: false,
      handoff: false,
    };
  }

  /**
   * "Jak mogę wynająć samochód?" — the four steps, then a way to start.
   *
   * Written out here rather than kept as a FAQ entry because it describes how
   * this system works, not a company policy: the steps change when the booking
   * form changes, never when a rule is approved. It quotes no price, no age and
   * no condition, so there is nothing here that can fall out of step with the
   * panel.
   */
  /**
   * "Za drogie — coś tańszego?" answered as a rejection, not as a new search.
   *
   * The audit case (PL-28/EN-28) went: price the Volvo, hear "too expensive,
   * anything cheaper?", ask again what dates they need. The sentence was read
   * as a fresh `GET_PRICE`, the missing dates were the first thing in its way,
   * and the customer's actual message — this one costs too much — was never
   * acted on at all.
   *
   * Cheaper is measured against the car we were just discussing, using the same
   * "from" rate the cards show, so the comparison the customer sees is the
   * comparison we made.
   */
  private async cheaperThan(
    locale: Locale,
    slots: ChatSlots,
    refId: string,
  ): Promise<ChatReply> {
    const all = await findCars(
      {
        dateFrom: slots.dateFrom,
        dateTo: slots.dateTo,
        seats: slots.seats,
        limit: FULL_OFFER_LIMIT,
      },
      locale,
    );
    const reference =
      all.find((c) => c.modelId === refId) ??
      (await getCar(refId, locale, null, null));
    if (!reference) return this.browseFleet(locale, slots);

    const cheaper = all
      .filter(
        (c) =>
          c.modelId !== refId && c.fromDailyGrosze < reference.fromDailyGrosze,
      )
      .sort((a, b) => a.fromDailyGrosze - b.fromDailyGrosze);

    if (cheaper.length === 0) {
      // Saying "no" here is fine; saying only "no" is not. The cheapest car we
      // have IS the answer to "anything cheaper", so it is shown.
      const cheapest = [...all].sort(
        (a, b) => a.fromDailyGrosze - b.fromDailyGrosze,
      )[0];
      return {
        blocks: [
          text(
            t(
              locale,
              `${reference.name} to już jedno z najtańszych aut, jakie mamy — nie mam nic tańszego w tej klasie.`,
              `The ${reference.name} is already one of the cheapest cars we have — I have nothing cheaper in that class.`,
            ),
          ),
          ...(cheapest && cheapest.modelId !== refId
            ? [
                text(
                  t(
                    locale,
                    "Najtańsze auto w naszej flocie to:",
                    "The cheapest car in our fleet is:",
                  ),
                ),
                { kind: "cars" as const, cars: [cheapest] },
              ]
            : []),
          mainMenu(locale),
        ],
        slots: withDateIntent(slots, "FIND_CAR"),
        locale,
        intent: "FIND_CAR",
        unanswered: false,
        handoff: false,
      };
    }

    const checked = Boolean(slots.dateFrom && slots.dateTo);
    return {
      blocks: [
        text(
          t(
            locale,
            `Tańsze niż ${reference.name} — od najtańszego:`,
            `Cheaper than the ${reference.name} — cheapest first:`,
          ),
        ),
        { kind: "cars", cars: cheaper },
        text(
          checked
            ? t(
                locale,
                "Powyższe auta są wolne w podanym terminie — sprawdzone przed chwilą w systemie rezerwacji.",
                "These cars are free for those dates — checked just now against the booking system.",
              )
            : t(
                locale,
                "Ceny „od” dotyczą najdłuższego wynajmu. Podaj termin, a policzę dokładną cenę dla wybranego auta.",
                "The “from” prices are for the longest rentals. Give me dates and I will price whichever one you like exactly.",
              ),
        ),
        datesBlock(locale, slots.dateFrom, slots.dateTo),
      ],
      // The rejected car is released: keeping it pinned meant the next message
      // ("ile kosztuje?") priced the very car the customer had just turned down.
      slots: { ...withDateIntent(slots, "FIND_CAR"), carModelIds: [] },
      locale,
      intent: "FIND_CAR",
      unanswered: false,
      handoff: false,
    };
  }

  /**
   * "Pokaż coś droższego" — the exact mirror of `cheaperThan`.
   *
   * Deliberately built as a mirror and not as a copy with the sort flipped.
   * Both lists are ordered **cheapest first**, because in both cases the
   * customer is being shown the nearest step from where they are: the dearest
   * car below the reference, and the cheapest car above it, are the two
   * answers they are actually weighing. Reversing this list would put the most
   * expensive car in the fleet at the top of a reply to "coś droższego", which
   * reads as an upsell rather than an answer.
   */
  private async pricierThan(
    locale: Locale,
    slots: ChatSlots,
    refId: string,
  ): Promise<ChatReply> {
    const all = await findCars(
      {
        dateFrom: slots.dateFrom,
        dateTo: slots.dateTo,
        seats: slots.seats,
        limit: FULL_OFFER_LIMIT,
      },
      locale,
    );
    const reference =
      all.find((c) => c.modelId === refId) ??
      (await getCar(refId, locale, null, null));
    if (!reference) return this.browseFleet(locale, slots);

    const pricier = all
      .filter(
        (c) =>
          c.modelId !== refId && c.fromDailyGrosze > reference.fromDailyGrosze,
      )
      .sort((a, b) => a.fromDailyGrosze - b.fromDailyGrosze);

    if (pricier.length === 0) {
      // Same shape as the cheaper dead end: "no" alone is a worse answer than
      // "no, and here is the top of the range".
      const priciest = [...all].sort(
        (a, b) => b.fromDailyGrosze - a.fromDailyGrosze,
      )[0];
      return {
        blocks: [
          text(
            t(
              locale,
              `${reference.name} to już jedno z najdroższych aut, jakie mamy — nie mam nic droższego.`,
              `The ${reference.name} is already one of the most expensive cars we have — I have nothing above it.`,
            ),
          ),
          ...(priciest && priciest.modelId !== refId
            ? [
                text(
                  t(
                    locale,
                    "Najdroższe auto w naszej flocie to:",
                    "The most expensive car in our fleet is:",
                  ),
                ),
                { kind: "cars" as const, cars: [priciest] },
              ]
            : []),
          mainMenu(locale),
        ],
        slots: withDateIntent(slots, "FIND_CAR"),
        locale,
        intent: "FIND_CAR",
        unanswered: false,
        handoff: false,
      };
    }

    const checked = Boolean(slots.dateFrom && slots.dateTo);
    return {
      blocks: [
        text(
          t(
            locale,
            `Droższe niż ${reference.name} — od najtańszego:`,
            `More expensive than the ${reference.name} — cheapest first:`,
          ),
        ),
        { kind: "cars", cars: pricier },
        text(
          checked
            ? t(
                locale,
                "Powyższe auta są wolne w podanym terminie — sprawdzone przed chwilą w systemie rezerwacji.",
                "These cars are free for those dates — checked just now against the booking system.",
              )
            : t(
                locale,
                "Ceny „od” dotyczą najdłuższego wynajmu. Podaj termin, a policzę dokładną cenę dla wybranego auta.",
                "The “from” prices are for the longest rentals. Give me dates and I will price whichever one you like exactly.",
              ),
        ),
        datesBlock(locale, slots.dateFrom, slots.dateTo),
      ],
      slots: { ...withDateIntent(slots, "FIND_CAR"), carModelIds: [] },
      locale,
      intent: "FIND_CAR",
      unanswered: false,
      handoff: false,
    };
  }

  /**
   * The gearbox of the car being discussed, as a sentence.
   *
   * Returns `null` rather than an apology when the car cannot be resolved, so
   * the caller falls through to the normal search instead of dead-ending on a
   * question it could not read.
   */
  private async gearboxAnswer(
    locale: Locale,
    slots: ChatSlots,
  ): Promise<ChatReply | null> {
    const car = await getCar(
      slots.carModelIds[0],
      locale,
      slots.dateFrom && slots.dateTo
        ? { from: slots.dateFrom, to: slots.dateTo }
        : null,
      null,
    );
    if (!car) return null;

    const automatic = car.gearbox === "automatic";
    return {
      blocks: [
        text(
          automatic
            ? t(
                locale,
                `Tak — ${car.name} ma automatyczną skrzynię biegów.`,
                `Yes — the ${car.name} has an automatic gearbox.`,
              )
            : t(
                locale,
                `Nie, ten egzemplarz ma manualną skrzynię biegów. ${car.name} występuje u nas wyłącznie z manualem.`,
                `No, this one has a manual gearbox. Our ${car.name} comes with a manual only.`,
              ),
        ),
        { kind: "cars", cars: [car] },
        mainMenu(locale),
      ],
      slots: withDateIntent(slots, "FIND_CAR"),
      locale,
      intent: "FIND_CAR",
      unanswered: false,
      handoff: false,
    };
  }

  /**
   * "RAV4 nie jest wolna — co macie podobnego?"
   *
   * The sentence names the car it is rejecting, so every earlier reading pinned
   * the RAV4 and showed the RAV4 (audit case PL-29/EN-29). Here the named car
   * is the one thing the answer may not contain.
   *
   * With dates known this is the same ranking `availability` uses, so "show
   * similar" gives the same cars whichever way the customer arrived at it. With
   * no dates there is nothing to check availability against, so it falls back to
   * seat count and price proximity and says nothing about what is free.
   */
  private async similarCars(
    locale: Locale,
    slots: ChatSlots,
    refId: string,
  ): Promise<ChatReply> {
    const checked = Boolean(slots.dateFrom && slots.dateTo);
    const reference = await getCar(refId, locale, null, null);
    if (!reference) return this.browseFleet(locale, slots);

    const similar = checked
      ? await findAlternatives(
          refId,
          { from: slots.dateFrom!, to: slots.dateTo! },
          locale,
          slots.seats,
          statedBudget(slots),
        )
      : (
          await findCars(
            { seats: reference.seats, limit: FULL_OFFER_LIMIT },
            locale,
          )
        )
          .filter((c) => c.modelId !== refId)
          .sort(
            (a, b) =>
              Math.abs(a.fromDailyGrosze - reference.fromDailyGrosze) -
              Math.abs(b.fromDailyGrosze - reference.fromDailyGrosze),
          );

    if (similar.length === 0) {
      return {
        blocks: [
          text(
            checked
              ? t(
                  locale,
                  `Nie mam w tym terminie wolnego auta podobnego do ${reference.name}. Mogę sprawdzić inny termin albo połączyć Cię z pracownikiem.`,
                  `I have nothing similar to the ${reference.name} free for those dates. I can check other dates or put you in touch with someone.`,
                )
              : t(
                  locale,
                  `Nie mam auta podobnego do ${reference.name}. Mogę pokazać całą flotę albo połączyć Cię z pracownikiem.`,
                  `I have nothing similar to the ${reference.name}. I can show you the whole fleet or put you in touch with someone.`,
                ),
          ),
          datesBlock(
            locale,
            null,
            null,
            t(locale, "📅 Wybierz inny termin", "📅 Choose other dates"),
          ),
          mainMenu(locale),
        ],
        slots: withDateIntent(slots, "FIND_CAR"),
        locale,
        intent: "FIND_CAR",
        unanswered: false,
        handoff: false,
      };
    }

    return {
      blocks: [
        text(
          checked
            ? t(
                locale,
                `Zamiast ${reference.name} — te auta są wolne w podanym terminie:`,
                `Instead of the ${reference.name} — these are free for those dates:`,
              )
            : t(
                locale,
                `Auta podobne do ${reference.name}:`,
                `Cars similar to the ${reference.name}:`,
              ),
        ),
        { kind: "cars", cars: similar },
        text(
          checked
            ? t(
                locale,
                "Dostępność sprawdzona przed chwilą w systemie rezerwacji.",
                "Availability checked just now against the booking system.",
              )
            : t(
                locale,
                "Podaj termin, a sprawdzę dostępność i policzę dokładną cenę.",
                "Give me dates and I will check availability and work out the exact price.",
              ),
        ),
        datesBlock(locale, slots.dateFrom, slots.dateTo),
      ],
      // Same reasoning as `cheaperThan`: the rejected car does not stay pinned.
      slots: { ...withDateIntent(slots, "FIND_CAR"), carModelIds: [] },
      locale,
      intent: "FIND_CAR",
      unanswered: false,
      handoff: false,
    };
  }

  /**
   * "Jaki macie najdroższy / najtańszy samochód?"
   *
   * Answered from the price list, which knows. It used to be refused —
   * "nie mam pewnej informacji na ten temat" — which is the one answer that is
   * both untrue and unhelpful: our own cars and our own published rates.
   */
  private async priceSuperlative(
    locale: Locale,
    slots: ChatSlots,
    which: "cheapest" | "priciest",
  ): Promise<ChatReply> {
    const all = await findCars({ limit: FULL_OFFER_LIMIT }, locale);
    if (all.length === 0) return this.browseFleet(locale, slots);
    const sorted = [...all].sort(
      (a, b) => a.fromDailyGrosze - b.fromDailyGrosze,
    );
    const pick = which === "cheapest" ? sorted[0] : sorted[sorted.length - 1];

    return {
      blocks: [
        text(
          which === "cheapest"
            ? t(
                locale,
                `Najtańsze auto w naszej flocie to ${pick.name} — od ${money(pick.fromDailyGrosze, locale)} za dobę.`,
                `The cheapest car in our fleet is the ${pick.name} — from ${money(pick.fromDailyGrosze, locale)} per day.`,
              )
            : t(
                locale,
                `Najdroższe auto w naszej flocie to ${pick.name} — od ${money(pick.fromDailyGrosze, locale)} za dobę.`,
                `The most expensive car in our fleet is the ${pick.name} — from ${money(pick.fromDailyGrosze, locale)} per day.`,
              ),
        ),
        { kind: "cars", cars: [pick] },
        text(
          t(
            locale,
            "Stawka „od” dotyczy najdłuższego wynajmu — przy krótszym terminie doba kosztuje więcej. Podaj termin, a policzę dokładnie.",
            "The “from” rate is for the longest rentals — a shorter booking costs more per day. Give me dates and I will price it exactly.",
          ),
        ),
        datesBlock(locale, slots.dateFrom, slots.dateTo),
      ],
      slots: {
        ...withDateIntent(slots, "GET_PRICE"),
        carModelIds: [pick.modelId],
      },
      locale,
      intent: "GET_PRICE",
      unanswered: false,
      handoff: false,
    };
  }

  private async howToRent(
    locale: Locale,
    slots: ChatSlots,
  ): Promise<ChatReply> {
    const contact = await getContact(locale);
    return {
      blocks: [
        text(
          t(
            locale,
            "Wynajem u nas wygląda tak:",
            "Renting with us works like this:",
          ),
        ),
        text(
          t(
            locale,
            "1. Wybierasz samochód — mogę pokazać całą flotę albo dobrać auto do Twoich potrzeb.\n2. Podajesz termin — sprawdzę dostępność i policzę dokładną cenę.\n3. Rezerwujesz online w formularzu albo telefonicznie.\n4. Odbierasz auto w umówionym miejscu; dokumenty i kaucję rozliczamy przy wydaniu.",
            "1. You choose a car — I can show you the whole fleet or match one to what you need.\n2. You give me the dates — I check availability and work out the exact price.\n3. You book online in the form, or by phone.\n4. You collect the car at the agreed place; documents and the deposit are settled at handover.",
          ),
        ),
        text(
          t(locale, "Od czego zaczynamy?", "Where would you like to start?"),
        ),
        {
          kind: "quick",
          options: [
            {
              label: t(locale, "🚗 Zobacz flotę", "🚗 See the fleet"),
              value: t(locale, "pokaż flotę", "show the fleet"),
            },
            {
              label: t(locale, "🚘 Dobierz auto", "🚘 Match me a car"),
              value: t(locale, "znajdź samochód", "find a car"),
            },
            {
              label: t(locale, "💰 Sprawdź cenę", "💰 Check price"),
              value: t(locale, "sprawdź cenę", "check price"),
            },
          ],
        },
        { kind: "contact", ...contact },
      ],
      slots,
      locale,
      intent: "HOW_TO_RENT",
      unanswered: false,
      handoff: false,
    };
  }

  /**
   * The whole fleet, in one answer, with no question asked first.
   *
   * `limit` is deliberately larger than the fleet: "show me everything" that
   * silently stops at three is the complaint this handler exists to answer, and
   * a cap that is never reached cannot quietly hide a car somebody added.
   * Availability is only claimed when a range is already known — otherwise the
   * cards carry `freeUnits: null` and say nothing about it.
   */
  private async browseFleet(
    locale: Locale,
    slots: ChatSlots,
  ): Promise<ChatReply> {
    const checked = Boolean(slots.dateFrom && slots.dateTo);
    const cars = await findCars(
      {
        dateFrom: slots.dateFrom,
        dateTo: slots.dateTo,
        limit: FULL_OFFER_LIMIT,
      },
      locale,
    );

    if (cars.length === 0) {
      // Only reachable with a range that nothing is free in — an empty fleet
      // would be a broken deployment, not a conversation.
      return {
        blocks: [
          text(
            t(
              locale,
              "W tym terminie nie mam wolnego żadnego auta. Mogę sprawdzić inny termin albo połączyć Cię z pracownikiem.",
              "I have nothing free for those dates. I can check other dates or put you in touch with someone.",
            ),
          ),
          datesBlock(
            locale,
            null,
            null,
            t(locale, "📅 Wybierz inny termin", "📅 Choose other dates"),
          ),
          mainMenu(locale),
        ],
        slots: withDateIntent(slots, "BROWSE_FLEET"),
        locale,
        intent: "BROWSE_FLEET",
        unanswered: false,
        handoff: false,
      };
    }

    return {
      blocks: [
        text(
          checked
            ? t(
                locale,
                `Cała nasza flota — ${cars.length} ${carsWordPl(cars.length)} wolnych w podanym terminie:`,
                `Our whole fleet — ${cars.length} ${cars.length === 1 ? "car" : "cars"} free for those dates:`,
              )
            : t(
                locale,
                `Cała nasza flota — ${cars.length} ${carsWordPl(cars.length)}:`,
                `Our whole fleet — ${cars.length} ${cars.length === 1 ? "car" : "cars"}:`,
              ),
        ),
        { kind: "cars", cars },
        text(
          checked
            ? t(
                locale,
                "Powyższe auta są wolne w podanym terminie — sprawdzone przed chwilą w systemie rezerwacji.",
                "These cars are free for those dates — checked just now against the booking system.",
              )
            : t(
                locale,
                "Ceny „od” dotyczą najdłuższego wynajmu. Podaj termin, a sprawdzę dostępność i policzę dokładną cenę.",
                "The “from” prices are for the longest rentals. Give me dates and I will check availability and work out the exact price.",
              ),
        ),
        datesBlock(locale, slots.dateFrom, slots.dateTo),
      ],
      slots: withDateIntent(slots, "BROWSE_FLEET"),
      locale,
      intent: "BROWSE_FLEET",
      unanswered: false,
      handoff: false,
    };
  }

  /**
   * An existing reservation — the one subject this assistant cannot read.
   *
   * `lib/chat/data` exposes fleet, prices, availability and contact details and
   * nothing else; there is no function there that can look up a customer's
   * booking, which is a security property rather than an omission. So this
   * handler never pretends to check, cancel or move anything. It says who can,
   * and offers the two ways to reach them.
   */
  /**
   * Istniejąca rezerwacja: zmiana i anulowanie.
   *
   * ## Co się zmieniło 01.09.2026
   *
   * Do tej pory asystent odsyłał do zespołu przy KAŻDYM pytaniu o rezerwację —
   * także przy „jak anulować", na które system od tej wersji odpowiada sam.
   * Zamówienie mówi wprost, że do zwykłego anulowania online klient nie ma być
   * zmuszany do pisania pisma ani dzwonienia. Asystent podaje więc drogę
   * samoobsługi i ZASADY, a człowieka proponuje tam, gdzie naprawdę jest
   * potrzebny: przy sprawach, których panel nie załatwi.
   *
   * ## Skąd kwoty
   *
   * Z `getSetting("cancellation")` — tego samego wiersza, który czyta panel,
   * ekran anulowania i rozliczenie. ANI JEDNA kwota nie jest tu wpisana:
   * po zmianie 200 zł na 250 zł asystent mówi 250 zł od razu, bez wdrożenia.
   *
   * ## Godziny z pytania
   *
   * „Odbieram samochód za 20 godzin" to pytanie o KONKRETNY próg i zasługuje
   * na konkretną odpowiedź, a nie na wyliczankę wszystkich trzech. Liczbę
   * czytamy tutaj, a nie globalną encją, bo poza tą odpowiedzią nigdzie się
   * nie przydaje — a każda encja globalna to nowy sposób, w jaki inne intencje
   * mogą się pomylić.
   */
  private async manageBooking(
    locale: Locale,
    slots: ChatSlots,
    wiadomosc?: string,
  ): Promise<ChatReply> {
    const [contact, polityka] = await Promise.all([
      getContact(locale),
      getSetting("cancellation"),
    ]);
    const kwota = (grosze: number) => money(grosze, locale);

    /* „za 20 godzin", „in 10 hours", „za 3 dni" — tylko wtedy, gdy padło. */
    const tekst = normalize(wiadomosc ?? "");
    const dopasowanie = tekst.match(
      /\b(?:za|in|w ciagu|within)\s+(\d{1,3})\s*(godzin\w*|godz|h|hours?|dni|dnia|days?)\b/,
    );
    const godzinyZPytania = dopasowanie
      ? /^(dni|dnia|days?)$/.test(dopasowanie[2])
        ? Number(dopasowanie[1]) * 24
        : Number(dopasowanie[1])
      : null;

    const bloki: ChatBlock[] = [];

    if (godzinyZPytania !== null) {
      /*
        Konkretna odpowiedź na konkretną liczbę. Przedział liczy ta sama
        funkcja, która naliczy należność po potwierdzeniu — asystent nie ma
        własnej drabinki progów.
      */
      const prog = tierForHours(godzinyZPytania, polityka);
      const naleznosc = tierAmountGrosze(prog, polityka);
      bloki.push(
        text(
          prog === "free"
            ? t(
                locale,
                `Przy ${godzinyZPytania} h do odbioru anulowanie jest bezpłatne — próg bezpłatny to ${polityka.freeHours} h.`,
                `At ${godzinyZPytania} h before pick-up the cancellation is free of charge — the free threshold is ${polityka.freeHours} h.`,
              )
            : t(
                locale,
                `Przy ${godzinyZPytania} h do odbioru opłata za anulowanie wynosi ${kwota(naleznosc)}. Nigdy nie przekracza wartości rezerwacji, więc przy tańszej rezerwacji zapłacisz tyle, ile ona wynosi.`,
                `At ${godzinyZPytania} h before pick-up the cancellation fee is ${kwota(naleznosc)}. It never exceeds the value of the reservation, so on a cheaper booking you pay what the booking is worth.`,
              ),
        ),
      );
    } else {
      bloki.push(
        text(
          t(
            locale,
            `Rezerwację możesz anulować sam, w każdej chwili przed odbiorem: „Moje rezerwacje" → wybierz rezerwację → „Anuluj rezerwację". Przed potwierdzeniem zobaczysz dokładną kwotę. Żadne pismo ani e-mail nie są potrzebne.`,
            `You can cancel yourself at any time before handover: "My reservations" → pick the booking → "Cancel reservation". You will see the exact amount before you confirm. No letter or e-mail is needed.`,
          ),
        ),
      );
      bloki.push(
        text(
          t(
            locale,
            `Zasady: ponad ${polityka.freeHours} h przed odbiorem — bezpłatnie; od ${polityka.freeHours} h do ${polityka.lateHours} h — ${kwota(polityka.tier1Grosze)}; poniżej ${polityka.lateHours} h — ${kwota(polityka.tier2Grosze)}; nieodebranie auta — ${kwota(polityka.noShowGrosze)}. Opłata nigdy nie przekracza wartości rezerwacji.`,
            `The terms: more than ${polityka.freeHours} h before pick-up — free of charge; between ${polityka.freeHours} h and ${polityka.lateHours} h — ${kwota(polityka.tier1Grosze)}; under ${polityka.lateHours} h — ${kwota(polityka.tier2Grosze)}; not collecting the car — ${kwota(polityka.noShowGrosze)}. The fee never exceeds the value of the reservation.`,
          ),
        ),
      );
    }

    bloki.push(
      text(
        t(
          locale,
          "Zmianę terminu bliżej odbioru oraz sprawy nietypowe załatwia zespół A&A — nie mam wglądu w rezerwacje klientów, więc niczego w konkretnej sprawie nie potwierdzę.",
          "Date changes close to handover and anything unusual are handled by the A&A team — I have no access to customer reservations, so I cannot confirm anything about a specific booking.",
        ),
      ),
    );
    bloki.push({ kind: "contact", ...contact });

    return {
      blocks: bloki,
      slots,
      locale,
      intent: "MANAGE_BOOKING",
      unanswered: false,
      /*
        JUŻ NIE `handoff`. Odpowiedź zawiera drogę samoobsługi i zasady, więc
        nie jest przekazaniem sprawy człowiekowi — a liczenie jej jako
        przekazania zawyżałoby w panelu liczbę spraw naprawdę wymagających
        obsługi. Kontakt zostaje, bo część spraw go potrzebuje.
      */
      handoff: false,
    };
  }

  private async startBooking(
    locale: Locale,
    slots: ChatSlots,
  ): Promise<ChatReply> {
    if (slots.carModelIds.length === 0) {
      return askWhichCar(locale, slots, "START_BOOKING");
    }
    if (!slots.dateFrom || !slots.dateTo) {
      return askDates(locale, { ...slots, pendingIntent: "START_BOOKING" });
    }

    const locationSlug = slots.locationId
      ? await locationSlugById(slots.locationId)
      : null;
    const car = await getCar(
      slots.carModelIds[0],
      locale,
      { from: slots.dateFrom, to: slots.dateTo },
      locationSlug,
    );
    if (!car) return askWhichCar(locale, slots, "START_BOOKING");

    if ((car.freeUnits ?? 0) === 0) {
      return this.availability(locale, slots);
    }

    return {
      blocks: [
        text(
          t(
            locale,
            "Świetnie. Przenoszę Cię do formularza — termin i auto będą już uzupełnione, zostanie tylko potwierdzić dane.",
            "Great. I'll take you to the booking form — the car and dates will already be filled in.",
          ),
        ),
        { kind: "cars", cars: [car] },
        datesBlock(locale, slots.dateFrom, slots.dateTo),
        {
          kind: "link",
          label: t(locale, "Przejdź do rezerwacji", "Go to booking"),
          // The form, not the top of the car page — same fix the car cards
          // carry. The dates and the pickup point are already in `bookHref`.
          href: `${car.bookHref}#rezerwacja`,
        },
      ],
      slots: withDateIntent(slots, "START_BOOKING"),
      locale,
      intent: "START_BOOKING",
      unanswered: false,
      handoff: false,
    };
  }

  /**
   * FAQ, and the honest dead end.
   *
   * This is where an unrecognised message lands. The matcher either clears
   * `MIN_SCORE` — in which case the answer is a verbatim FAQ entry the company
   * wrote — or it does not, and the assistant says so in the words the spec
   * asked for. Nothing in between is generated.
   */
  private async faq(
    locale: Locale,
    slots: ChatSlots,
    message: string,
    parsed: Parsed,
  ): Promise<ChatReply> {
    const entries = await getFaqEntries(locale);
    const match = matchFaq(message, entries);

    if (match) {
      const blocks: ChatBlock[] = [text(match.entry.a)];
      if (match.alternative) {
        blocks.push(
          text(
            t(
              locale,
              `Jeśli pytanie dotyczyło czegoś innego — mam też odpowiedź na: „${match.alternative.q}”.`,
              `If you meant something else — I also have an answer to: “${match.alternative.q}”.`,
            ),
          ),
          {
            kind: "quick",
            options: [
              { label: match.alternative.q, value: match.alternative.q },
            ],
          },
        );
      }
      return {
        blocks,
        slots,
        locale,
        intent: "FAQ",
        unanswered: false,
        // Answered — but if the match only just cleared the floor, the admin
        // list is where a person gets to disagree with it.
        lowConfidence: match.needsReview,
        handoff: false,
      };
    }

    /**
     * The honest dead end, reworded on 2026-08-20.
     *
     * It used to say "I'm not sure I understood the question", which was the
     * wrong admission in most cases: the assistant had understood perfectly
     * well and simply had no confirmed answer. After the matcher's floor was
     * raised this branch runs far more often, so the wording had to stop
     * blaming the customer's phrasing for a gap in ours — and it now carries
     * the contact details and the callback form rather than only mentioning
     * that a person exists.
     */
    const contact = await getContact(locale);
    return {
      blocks: [
        text(
          t(
            locale,
            "Nie mam pewnej informacji na ten temat, a nie chcę zgadywać. Najlepiej potwierdzi to pracownik A&A.",
            "I don't have confirmed information on that, and I would rather not guess. Someone from A&A can confirm it for you.",
          ),
        ),
        { kind: "contact", ...contact },
        {
          kind: "quick",
          options: [
            {
              label: t(locale, "Znajdź samochód", "Find a car"),
              value: t(locale, "znajdź samochód", "find a car"),
            },
            {
              label: t(locale, "Sprawdź cenę", "Check price"),
              value: t(locale, "sprawdź cenę", "check price"),
            },
            {
              label: t(locale, "Sprawdź dostępność", "Check availability"),
              value: t(locale, "sprawdź dostępność", "check availability"),
            },
            { label: "FAQ", value: "FAQ" },
            {
              label: t(
                locale,
                "Porozmawiaj z pracownikiem",
                "Talk to a person",
              ),
              value: t(
                locale,
                "porozmawiaj z pracownikiem",
                "talk to a person",
              ),
            },
          ],
        },
      ],
      slots,
      locale,
      intent: parsed.intent === "UNKNOWN" ? "UNKNOWN" : parsed.intent,
      unanswered: true,
      handoff: false,
    };
  }
}
