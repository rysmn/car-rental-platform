import type { Intent, Locale } from "./nlu";
import type { Demand } from "./demand";

/**
 * The wire format between the assistant and the widget.
 *
 * Blocks rather than a string of HTML: the widget renders each kind itself, so
 * nothing the server produces can inject markup into the page, and a car card
 * is a real component with a real link rather than a paragraph pretending to be
 * one.
 */
export type ChatBlock =
  | { kind: "text"; text: string }
  /** Buttons. `value` is what gets sent back as if the visitor typed it. */
  | { kind: "quick"; options: { label: string; value: string }[] }
  | { kind: "cars"; cars: ChatCar[] }
  /** A priced offer for one car and one date range. */
  | { kind: "quote"; quote: ChatQuote }
  | { kind: "compare"; cars: ChatCar[]; rows: CompareRow[] }
  /** Phone / WhatsApp / e-mail, from the admin settings. */
  | { kind: "contact"; phones: ContactPhone[]; email: string; hours: string }
  /**
   * Consent-gated callback form.
   *
   * `known` to kontakt, który ta rozmowa JUŻ zostawiła — wypełnia pola
   * z góry. Zasada etapu 44D brzmi wprost: o informację, którą asystent ma
   * z bieżącej rozmowy, nie pytamy drugi raz. Klient, który podał numer,
   * a potem wrócił z pytaniem o auto spoza floty, wpisywałby go od nowa —
   * i to jest moment, w którym zwyczajnie zamyka panel.
   *
   * Dokładany przez TRASĘ, nie przez dostawcę odpowiedzi: to samo miejsce,
   * które stempluje odnośniki identyfikatorem rozmowy, i jedyne, które ma
   * prawo czytać bazę. Reguły nie mają dostępu do zgłoszeń i mieć nie mają.
   */
  | {
      kind: "lead";
      notice: string;
      known?: { name: string | null; phone: string | null; email: string | null };
    }
  | { kind: "link"; label: string; href: string }
  /**
   * The date picker — offered, never demanded.
   *
   * One block kind for both halves of the job, because they are the same
   * question asked at two moments. With `from`/`to` empty it is an invitation:
   * shortcut chips plus a button that opens the calendar. With a range in it,
   * it is the receipt for what the assistant already knows — "22.08.2026 →
   * 25.08.2026" and a way to change it — which is what stops the assistant
   * asking for dates a customer has already given.
   *
   * The shortcuts are named, not dated: "tomorrow" is resolved by the widget
   * against the browser's own clock, so a block that sat in the panel over
   * midnight cannot offer yesterday.
   */
  | {
      kind: "dates";
      from: string | null;
      to: string | null;
      /** Label on the button that opens the calendar. */
      openLabel: string;
      shortcuts: DateShortcut[];
    };

/** Relative shortcuts the widget may offer. Resolved on the client, from today. */
export type DateShortcut = "today" | "tomorrow" | "weekend" | "next_weekend";

export type ChatCar = {
  modelId: string;
  slug: string;
  name: string;
  year: number;
  seats: number;
  gearbox: string;
  fuel: string;
  /** Lowest rate the model is ever offered at — the honest "od" price. */
  fromDailyGrosze: number;
  depositGrosze: number;
  kmPerDayLimit: number;
  /**
   * Stawka za kilometr ponad limit, w groszach — `null` gdy nie ustawiono.
   *
   * Asystent NIE MA własnej tabeli stawek i mieć jej nie może: czyta tę samą
   * kolumnę `car_models`, którą pokazuje karta auta i którą rozliczy zwrot.
   * Ręczna lista w kodzie czatu byłaby drugim cennikiem, który rozjedzie się
   * przy pierwszej zmianie w panelu — i rozjedzie się po cichu, bo nikt nie
   * czyta odpowiedzi bota tak uważnie jak strony.
   */
  extraMileageFeeGrosze: number | null;
  image: string | null;
  segments: readonly string[];
  /**
   * Free units in the asked-about range. `null` means no range was given, so
   * availability was never checked — the card must not imply it was.
   */
  freeUnits: number | null;
  /**
   * Units of this model that could ever be rented — status `available`, before
   * any date is considered.
   *
   * It is what separates "taken that week" from "not currently rented at all":
   * zero here means no date would help, and telling a customer to try another
   * week would be a lie with a calendar attached.
   */
  bookableUnits: number;
  /** Deep link into the existing booking form, dates prefilled. */
  bookHref: string;
};

export type ChatQuote = {
  car: ChatCar;
  dateFrom: string;
  dateTo: string;
  days: number;
  /** Effective per-day rate after the length tier. */
  dailyGrosze: number;
  rentalGrosze: number;
  locationName: string | null;
  locationFeeGrosze: number;
  totalGrosze: number;
  depositGrosze: number;
  available: boolean;
  /**
   * No rate exists for this length of stay — a manager quotes it. Every amount
   * above is then meaningless and the widget must not render one.
   */
  onRequest: boolean;
};

export type CompareRow = {
  label: string;
  /** One value per car, same order as `cars`. */
  values: string[];
};

export type ContactPhone = { label: string; number: string; whatsapp: string };

/**
 * What the assistant remembers between messages.
 *
 * Deliberately small and deliberately all IDs: the slots point into live data
 * and are re-read on every turn, so a price quoted two messages ago cannot go
 * stale in here. `awaiting` is what makes the "ask, don't guess" rule work —
 * when it is set, the next message is read as the answer to that question.
 */
export type ChatSlots = {
  carModelIds: string[];
  /**
   * Body the customer asked for — `suv` | `sedan` | `van`, from
   * `car_models.category`. Carried beside `segment`, never merged into it: the
   * two are independent axes and a conversation may narrow either one.
   */
  bodyType: string | null;
  /** Commercial shelf — `luxury` | `executive` | `business`. */
  segment: string | null;
  /** Driver-requirement class — what "premium" means, per the owner's ruling. */
  driverClass: string | null;
  /**
   * The ceiling of a stated budget, in złoty grosze — per day unless
   * `budgetKind` says the figure is for the whole rental.
   */
  budgetGrosze: number | null;
  /** The floor of a stated range, in złoty grosze; null when only a ceiling. */
  budgetMinGrosze: number | null;
  /** What the figures are a budget for; null when none was stated. */
  budgetKind: "day" | "total" | null;
  /** The currency it was said in — złoty is what it is compared in. */
  budgetCurrency: "pln" | "eur" | null;
  seats: number | null;
  dateFrom: string | null;
  dateTo: string | null;
  locationId: string | null;
  awaiting:
    | null
    | "seats"
    | "dates"
    | "location"
    | "which_car"
    | "lead_contact"
    | "confirm_intent";
  /** Intent parked while a clarifying question is answered. */
  pendingIntent: Intent | null;
  /**
   * What to redo when the dates change.
   *
   * Set by whichever handler put a date picker in front of the customer, so
   * that "Zmień termin" tapped under a price quote comes back as a price for
   * the new dates rather than as a generic availability answer. It is the
   * conversation's current subject, not a queued question — `awaiting` is that
   * — which is why it survives turns instead of being cleared by the next
   * message.
   */
  dateIntent: Intent | null;
  /**
   * How many messages this visitor has sent. Used for one thing only: noticing
   * a conversation that has gone long without settling on a car.
   */
  turns: number;
  /**
   * "What sort of car are you after?" has been asked once already.
   *
   * The whole reason this flag exists is the instruction not to turn the
   * assistant into a questionnaire. Asked once at the right moment it rescues a
   * conversation that was about to end with nothing; asked every other message
   * it is the reason somebody closes the panel. Once per conversation, and only
   * after something has actually gone wrong.
   */
  nudged: boolean;
  /**
   * The last car or need this conversation was about, as its display label.
   *
   * Exists so a follow-up can be understood. "Macie Porsche Cayenne?" is read
   * fine; "A Cayenne S?" two seconds later has no brand in it and, without
   * this, comes back as "nie rozumiem" — right after the assistant has just
   * demonstrated that it does. It also keeps the demand row single: the
   * follow-up resolves to the same label and lands on the same row.
   */
  lastDemand: string | null;
};

export const EMPTY_SLOTS: ChatSlots = {
  carModelIds: [],
  bodyType: null,
  segment: null,
  driverClass: null,
  budgetGrosze: null,
  budgetMinGrosze: null,
  budgetKind: null,
  budgetCurrency: null,
  seats: null,
  dateFrom: null,
  dateTo: null,
  locationId: null,
  awaiting: null,
  pendingIntent: null,
  dateIntent: null,
  turns: 0,
  nudged: false,
  lastDemand: null,
};

export type ChatReply = {
  blocks: ChatBlock[];
  slots: ChatSlots;
  locale: Locale;
  /** For the transcript and the analytics. */
  intent: Intent;
  /** True when nothing could be answered — logged for the admin list. */
  unanswered: boolean;
  /**
   * An answer WAS given, but close enough to the matcher's floor that a person
   * should check it.
   *
   * Added 2026-08-20. Until then the admin's "unanswered" list held only the
   * questions the assistant admitted defeat on, which meant it showed the
   * harmless failures and hid the dangerous ones: all twenty-six confidently
   * wrong answers the audit found were, by this measure, answered.
   */
  lowConfidence?: boolean;
  /** The visitor asked for a person. */
  handoff: boolean;
  /**
   * Ten obrót powiedział już klientowi, że nazwanego miejsca nie obsługujemy.
   *
   * Istnieje po to, żeby dopisek z `noteUnservedPlace` nie dokładał drugiego
   * zdania o tym samym — dwa niezależne mechanizmy na to samo pytanie
   * wyprodukowały na produkcji parę komunikatów, które sobie przeczyły.
   * Nie idzie do klienta ani do analityki.
   */
  unservedPlaceSaid?: boolean;

  /*
   * What this turn was about, for the demand report. None of it changes a
   * word the customer reads.
   */
  /** The car or the need the message described — see `lib/chat/demand`. */
  demand?: Demand | null;
  /** Does A&A own such a car at all? Only meaningful with `demand`. */
  demandInFleet?: boolean;
  /** It is ours, and it was taken for the dates asked about. */
  unavailable?: boolean;
  /** Substitutes were put in front of the customer instead. */
  alternativesShown?: boolean;
};

export type ChatRequest = {
  message: string;
  slots: ChatSlots;
  locale: Locale;
};

/**
 * The seam a future AI provider would slot into.
 *
 * One method, one shape in, one shape out. `DeterministicProvider` implements
 * it today with rules; an `AIProvider` would implement it with a model and the
 * same tool layer, and nothing outside this interface would change — not the
 * widget, not the API route, not the admin panel.
 *
 * The tool layer (`lib/chat/data`) is what any provider is allowed to touch.
 * That boundary is the security model: a provider cannot reach the database
 * directly, so it cannot read a customer or change a price however it is
 * implemented.
 */
export interface ChatProvider {
  readonly id: "deterministic" | "ai";
  respond(request: ChatRequest): Promise<ChatReply>;
}
