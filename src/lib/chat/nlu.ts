/**
 * Understanding what the visitor typed — without a language model.
 *
 * This file is pure: text in, a structured reading out. No database, no
 * network, no `server-only` import, so the same code can be unit-tested and (if
 * ever needed) run in the browser.
 *
 * ## The rule this module exists to enforce
 *
 * **A guess is not an answer.** Every result carries a `confidence`, and the
 * conversation engine is required to ask a clarifying question rather than act
 * on anything below `CONFIDENT`. A parser that quietly decides "duże auto"
 * means a 9-seater will book somebody the wrong car; a parser that asks "ilu
 * pasażerów?" costs one message and is right.
 *
 * ## Why the vocabulary is injected
 *
 * Car names, segments and locations are passed in by the caller, built from the
 * live database. Nothing about the fleet is hardcoded here — add a car in the
 * admin panel and the parser recognises it on the next message, with no code
 * change. That is the same "one source of truth" rule the prices follow.
 */

import { addDays, weekendRange } from "@/lib/dates";

export const INTENTS = [
  "FIND_CAR",
  "CHECK_AVAILABILITY",
  "GET_PRICE",
  "GET_DEPOSIT",
  "GET_MILEAGE_LIMIT",
  /** When the office works, when the phone is answered, when a car can be collected. */
  "OPENING_HOURS",
  "COMPARE_CARS",
  "AIRPORT",
  /**
   * "Skąd odbieram auto?" — the pickup point, when the customer has not named
   * one we recognise.
   *
   * Its own intent because the alternative was the worst possible answer.
   * "Jednak odbiór w centrum" used to score on the FAQ matcher, find nothing,
   * and come back with "nie mam pewnej informacji na ten temat" — about our own
   * pickup points, listed in our own database, on a question the customer had
   * every right to expect an answer to.
   *
   * What it must NOT do is guess. A&A has an office, two airports and delivery
   * to an address; whether the office counts as "centrum" is a fact about a
   * street, and the assistant does not know it. So the handler states the
   * points that exist, with the surcharges the panel holds, and lets the
   * customer pick. Listing real options is not the same as inventing one.
   */
  "PICKUP_POINT",
  "LONG_TERM",
  "B2B",
  /**
   * Ktoś oferuje WSPÓŁPRACĘ, zamiast pytać o wynajem.
   *
   * Osobna intencja, bo bez niej „chcę wnieść samochód do waszej floty" trafia
   * na dopasowanie do floty i wraca jako oferta wynajmu tego samochodu —
   * odpowiedź gramatycznie poprawna i biznesowo odwrotna do pytania. To ta
   * sama rodzina pomyłek co „mam wypadek" odpowiedziane cennikiem.
   *
   * Handler ma jeden twardy zakaz: NIE PODAJE WARUNKÓW FINANSOWYCH. Żadnej
   * stopy zwrotu, procentu, podziału przychodu ani „ile na tym zarobię" —
   * to są ustalenia umowne i publiczna obietnica zysku wypowiedziana przez
   * automat jest zobowiązaniem, którego nikt w A&A nie autoryzował.
   */
  "PARTNERSHIP",
  "FAQ",
  "CONTACT_HUMAN",
  "START_BOOKING",
  "GREETING",
  "UNKNOWN",
  /** Asking the assistant to do something it must never do. */
  "OUT_OF_SCOPE",
  /**
   * A car that has crashed, broken down or will not start — happening now.
   *
   * Its own intent because it is the one category where the cost of a wrong
   * answer is not money. The audit found "Miałem wypadek, co mam robić?"
   * answered with "I'm not sure I understood" and "Auto się zepsuło na trasie"
   * answered with "Tak. Każdy pojazd posiada OC i AC".
   */
  "EMERGENCY",
  /**
   * A question about a rule A&A has not written down yet.
   *
   * Twenty-one such topics were catalogued in the audit — driver age, required
   * documents, permitted countries, insurance excess, fines, fuel, pets,
   * smoking. Until the owner supplies each rule the assistant must neither
   * confirm nor deny it, so these are pulled out before the FAQ matcher gets a
   * chance to guess. Remove a topic from `AWAITING_POLICY` the day its answer
   * is published — not before.
   */
  "NEEDS_STAFF_CONFIRMATION",
  /**
   * Taking the car out of Poland.
   *
   * Its own intent, above the FAQ matcher, because the company rule approved on
   * 2026-08-20 is that no destination is ever permitted automatically — not
   * Germany, not the Czech Republic, not anywhere. The assistant states the
   * rule and routes to a person; it must never answer this from a list of
   * countries, and there is deliberately no such list in the code.
   */
  "ABROAD",
  /**
   * Which documents the driver has to bring.
   *
   * Split out of `NEEDS_STAFF_CONFIRMATION` on 2026-08-20, when the rules
   * centre gave the base requirement an approved wording. The topic is no
   * longer entirely undecided — a licence and an identity document are always
   * required — so the assistant states that much and refers the rest.
   */
  "DOCUMENTS",
  /**
   * How old the driver must be, and how long they must have held a licence.
   *
   * Split out of `NEEDS_STAFF_CONFIRMATION` on 2026-08-20, when the owner
   * approved three classes of car with their own thresholds. The handler reads
   * Admin → Zasady wynajmu — first working out which class the car belongs to,
   * then taking the numbers from that class. Nothing is hard-coded here: with
   * every requirement switched off the handler says nothing and refers to a
   * person, exactly as this intent's predecessor did.
   */
  "DRIVER_AGE",
  /**
   * "Jak mogę wynająć samochód?" — the process, not a particular car.
   *
   * Its own intent because it was the single worst answer in the fleet: the FAQ
   * matcher took the sentence apart, found "wynająć", and replied about monthly
   * rentals — a confident answer to a question nobody asked, on the message
   * that most often opens a conversation. It cannot be a FAQ entry, because the
   * steps are structural (choose a car, choose dates, book online or by phone)
   * and must not drift with FAQ wording.
   */
  "HOW_TO_RENT",
  /**
   * "Zobacz flotę" — show everything, ask nothing.
   *
   * Separate from `FIND_CAR` because the two are opposite jobs. `FIND_CAR`
   * narrows towards one car and may reasonably ask a question to do it;
   * browsing is the customer saying "let me look myself", and answering it with
   * "how many passengers?" — which is what the menu button did — is a wall in
   * front of the one visitor who was ready to look at cars.
   */
  "BROWSE_FLEET",
  /**
   * Changing or cancelling a reservation that already exists.
   *
   * Never answerable by the assistant: it can read the fleet and the price
   * list, and it deliberately cannot read a customer's reservation. Before this
   * intent existed "I want to cancel my booking" scored on "booking" and came
   * back as "Which car do you mean?" — the assistant offering to sell a car to
   * somebody trying to give one back.
   */
  "MANAGE_BOOKING",
] as const;

export type Intent = (typeof INTENTS)[number];

export type Confidence = "confident" | "unsure" | "none";

export type Locale = "pl" | "en";

/** What the caller supplies, built from the live fleet. */
export type Vocabulary = {
  cars: {
    modelId: string;
    slug: string;
    /** "Volvo", lowercased and normalised by the caller or by `normalize`. */
    brand: string;
    /** "XC60" */
    model: string;
    seats: number;
    category: string;
    fuel: string;
    gearbox: string;
    segments: readonly string[];
    /**
     * Which driver-requirement class the car is in, or null when unassigned.
     * Read by the `DRIVER_AGE` handler so "ile lat na Panamerę" is answered
     * with the Premium threshold rather than the lowest one in the fleet.
     *
     * Optional because the test harnesses build vocabularies by hand and have
     * no business knowing about rental policy; absent reads as "unassigned",
     * which is the safe interpretation everywhere.
     */
    driverClass?: string | null;
  }[];
  locations: {
    id: string;
    slug: string;
    name: string;
    /** English label, when the admin set one — matched alongside `name`. */
    nameEn?: string | null;
  }[];
  /**
   * Today's EUR/PLN reference rate, when the system has one.
   *
   * It rides in the vocabulary because that is already the channel through
   * which database facts reach a pure parser — the same door `driverClass`
   * came through. A budget said in euro is a złoty figure the customer does
   * not know yet, and it becomes one here, once, rather than travelling
   * through the conversation as a number in the wrong unit.
   *
   * Absent means absent: with no rate a euro budget is not filtered on at all.
   * Nothing in this system may invent an exchange rate — see
   * `lib/currency/rate`.
   */
  plnPerEur?: number | null;
};

export type ParsedEntities = {
  /** Matched car model ids, in the order they appeared in the sentence. */
  carModelIds: string[];
  /**
   * Axis 1 — the body the customer named: `suv`, `sedan` or `van`.
   *
   * Separate from `segment` since 21.08.2026, and that separation is the whole
   * point: a sentence may name a body AND a shelf ("luksusowy SUV"), and each
   * has to survive the other. While both shared one field, the second word read
   * overwrote the first and the search silently changed subject.
   */
  bodyType: "suv" | "sedan" | "van" | null;
  /** Axis 2 — the commercial shelf: `luxury`, `executive` or `business`. */
  segment: string | null;
  /**
   * Axis 3 — the driver-requirement class the customer asked for.
   *
   * Today only "premium" reaches this, by the owner's decision of 21.08.2026:
   * the class is the source of truth for that word, not the `luxury` shelf.
   */
  driverClass: string | null;
  /**
   * The ceiling of a stated budget, in złoty grosze. `null` when no number was
   * given — which is most of the time, and is NOT the same as "no budget": a
   * bare "tani" sorts by price and filters nothing.
   *
   * Per day unless `budgetKind` says otherwise. The field kept its name and its
   * unit so that every reader written before ranges existed still reads a
   * ceiling and still reads it in grosze.
   */
  budgetGrosze: number | null;
  /** The floor of a stated range, in złoty grosze; null when only a ceiling. */
  budgetMinGrosze: number | null;
  /** What the two figures are a budget for. `null` when none was stated. */
  budgetKind: "day" | "total" | null;
  /**
   * The currency the customer named, not the one we filter in — the filtering
   * is always złoty. Kept so the answer can be given back in the currency the
   * question was asked in.
   */
  budgetCurrency: "pln" | "eur" | null;
  seats: number | null;
  dateFrom: string | null;
  dateTo: string | null;
  /** Length in days when stated without dates ("na tydzień", "for 5 days"). */
  days: number | null;
  /**
   * Kilometry wymienione w pytaniu — „przejadę 1000 km", „dodatkowe 100 km".
   *
   * Sama liczba, bez rozstrzygania, czy to przebieg całkowity, czy nadmiar
   * ponad limit. Rozstrzyga to dopiero handler, który zna limit; tutaj byłoby
   * to zgadywanie z szyku zdania.
   */
  km: number | null;
  locationId: string | null;
  gearbox: "automatic" | "manual" | null;
  fuel: "petrol" | "diesel" | "hybrid" | "electric" | null;
  /**
   * What kind of rental this is.
   *
   * Derived, not spotted: a month-long hire is `long_term` whether or not the
   * customer used the phrase, and an invoice for a company is `business`. Kept
   * as a slot so the AI layer and the parser can be compared on equal terms.
   */
  rentalType: "short" | "long_term" | "business" | null;
  /** The customer said price matters most. */
  wantsCheapest: boolean;
  /**
   * "Za drogie, coś tańszego?" — cheaper THAN THE ONE WE JUST DISCUSSED.
   *
   * Distinct from `wantsCheapest`, which is a standing preference stated at the
   * start ("szukam czegoś taniego"). This one is a reaction to a price the
   * assistant has already quoted, so it needs the previous car to mean
   * anything, and it is a rejection of that car rather than a new search.
   */
  wantsCheaper: boolean;
  /**
   * "Pokaż coś droższego" — the mirror of `wantsCheaper`, and until now missing.
   *
   * Without it the sentence fell through to a generic search that still had the
   * previous car pinned, so "coś droższego" after a Tiguan answered with the
   * Tiguan. Same shape as its opposite: it needs a reference car, and it is a
   * rejection of that car's price rather than a fresh search.
   */
  wantsPricier: boolean;
  /**
   * A question ABOUT the gearbox, as opposed to a preference for one.
   *
   * "Czy Trafic ma automatyczną skrzynię?" and "szukam auta z automatem" both
   * mention a gearbox and want opposite things: the first wants a sentence back,
   * the second wants a filtered list. Only the first sets this.
   */
  asksGearbox: boolean;
  /**
   * "Auto rodzinne", "coś większego" — a size need with no approved definition.
   *
   * Carried as a flag rather than resolved into a class here, so that the one
   * place that turns it into a filter is visible and reviewable.
   */
  familyHint: boolean;
  /**
   * "Co macie podobnego?" — something LIKE the car just named, not that car.
   *
   * The reason it must be its own flag: the sentence usually names the car it
   * is rejecting ("RAV4 nie jest wolna, co podobnego?"), and every parser
   * before this read that as a request for the RAV4.
   */
  wantsSimilar: boolean;
  /**
   * "Który jest tańszy?" — asked about cars ALREADY on the table.
   *
   * Which attribute the question is about, or null when it is not that kind of
   * question. It exists because the follow-up to a comparison looks exactly
   * like a rejection: "który jest tańszy" scored as "show me something
   * cheaper", so the assistant answered a question about two named cars with a
   * list of five unrelated ones, and "który ma więcej miejsc" asked for dates.
   *
   * The flag says only what was asked. Whether there are two cars to answer
   * about is the handler's business — with one car pinned the same sentence
   * really IS a rejection, and must stay one.
   */
  comparisonAspect: "price" | "seats" | "deposit" | "mileage" | null;
  /**
   * The driver's own age, when they volunteer it: "mam 23 lata", "I'm 23".
   *
   * Its own field because "ile lat trzeba mieć" and "mam 23 lata, czy mogę" are
   * different questions with the same intent. The first wants the threshold;
   * the second wants a yes or a no, and answering it with the threshold — which
   * is what the assistant did — leaves the customer to do the comparison the
   * machine was in a better position to do.
   *
   * Bounded to a plausible driving age. A "2" from "mam 2 dzieci" is not an
   * age, and a number without a year word is not one either.
   */
  statedAge: number | null;
  /**
   * "Prawo jazdy mam od roku", "how long must I have held my licence".
   *
   * Separate from `statedAge`: tenure and age are two requirements, only one of
   * which A&A can currently verify, and the answers differ accordingly. See
   * `LICENCE_TENURE_ENFORCEABLE`.
   */
  asksLicenceTenure: boolean;
  /**
   * An add-on the customer named: an extra driver, a child seat, the
   * no-deposit option, the protection package.
   *
   * These are priced per rental or per day in `fees`, the same table the
   * booking form charges from — they are NOT a property of a car. Without this
   * flag "ile kosztuje dodatkowy kierowca?" scored as a price question, and the
   * assistant answered a flat fee with "o który samochód chodzi?".
   */
  extraTopic:
    | "extra_driver"
    | "child_seat"
    | "no_deposit"
    | "protection_package"
    /*
     * Dostawa pod wskazany adres. Dopisana 26.08.2026, bo „ile kosztuje
     * dostawa pod adres w Warszawie?" wpadało w gałąź ceny SAMOCHODU
     * i asystent odpowiadał „o który samochód chodzi?" — pytanie o opłatę
     * stałą, potraktowane jak pytanie o wynajem.
     */
    | "delivery"
    | null;
  /**
   * "Jaki macie najdroższy / najtańszy samochód?"
   *
   * A question with exactly one right answer that the fleet already knows.
   * Answered from the price list rather than refused, which is what it did
   * before — a refusal on a question about our own cars reads as evasion.
   */
  superlative: "cheapest" | "priciest" | null;
};

export type Parsed = {
  intent: Intent;
  confidence: Confidence;
  /**
   * The same judgement as a number, 0–1.
   *
   * This is what decides whether the message is worth escalating to a language
   * model, so it has to mean something. It is built from the evidence — how
   * clearly the intent won, how much of the sentence resolved into real slots,
   * whether any match was ambiguous — never from a constant.
   */
  confidenceScore: number;
  /** Why the score came out as it did. For the audit log and for debugging. */
  signals: ConfidenceSignals;
  locale: Locale;
  entities: ParsedEntities;
  /** Normalised text, reused by the FAQ matcher and the unanswered log. */
  normalized: string;
};

export type ConfidenceSignals = {
  /** Winning intent's keyword score. */
  intentScore: number;
  /** How far ahead of the runner-up it finished. */
  intentMargin: number;
  /** Slots that resolved to something real. */
  slotsFilled: number;
  /** A car matched by model name, not merely by brand. */
  carPrecise: boolean;
  /** 0–1, from `matchLocation`. */
  locationStrength: number;
  /** Explicit dates beat "weekend" beats nothing. */
  dateStrength: number;
  /** Two locations, or two cars of one brand, fitted equally well. */
  conflicts: number;
};

/* ── Normalisation ────────────────────────────────────────────────────────── */

/**
 * Lowercase, strip Polish diacritics, drop punctuation, collapse whitespace.
 *
 * Diacritics go because half of Polish visitors type without them — "ile
 * kosztuje kaucja" and "ile kosztuje kaucją" must reach the same bucket, and so
 * must "Gdańsk" and "gdansk".
 */
export function normalize(input: string): string {
  return (
    input
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/ł/gi, "l")
      // "€90" is how a price is written and "euro" is how it is said; the line
      // below deletes every symbol, so the sign becomes the word before it can
      // be lost. Without this, "budżet €90" reaches the budget rule as a bare
      // two-digit number and is thrown away as a date.
      .replace(/€/g, " euro ")
      /*
        Każda kreska to ten sam myślnik.
        
        Klawiatura telefonu i autokorekta zamieniają „70-120" na „70–120"
        (półpauza), a wklejenie z Worda potrafi dać pauzę albo znak minus.
        Linia niżej kasuje każdy znak spoza `[a-z0-9\s./-]`, więc półpauza
        znikała bez śladu i „70–120 EUR" docierało do reguł jako „70 120 eur"
        — dwie liczby bez związku. Sprowadzamy je do dywizu, zanim to nastąpi,
        dokładnie tak samo, jak „€" staje się wyżej słowem „euro".
      */
      .replace(/[\u2010-\u2015\u2212]/g, "-")
      .toLowerCase()
      .replace(/[^a-z0-9\s./-]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Crude Polish stem: chop the inflectional tail off longer words.
 *
 * Not linguistics — a lookup table of endings that makes "samochodu",
 * "samochodem" and "samochody" collide with "samochod". Words of six letters or
 * fewer are left alone, because that is where chopping starts destroying short
 * words ("cena" → "c"). Good enough for keyword matching; it is never shown to
 * anyone.
 */
const PL_ENDINGS = [
  "ami",
  "ach",
  "owi",
  "iem",
  "em",
  "om",
  "ow",
  "ie",
  "iu",
  "ia",
  "y",
  "u",
  "e",
  "a",
  "i",
  "o",
];

export function stem(word: string): string {
  if (word.length <= 5) return word;
  for (const end of PL_ENDINGS) {
    if (word.length - end.length >= 4 && word.endsWith(end)) {
      return word.slice(0, -end.length);
    }
  }
  return word;
}

export function tokens(text: string): string[] {
  return normalize(text).split(" ").filter(Boolean);
}

export function stems(text: string): string[] {
  return tokens(text).map(stem);
}

/* ── Language detection ───────────────────────────────────────────────────── */

const PL_MARKERS = [
  "czy",
  "jak",
  "ile",
  "gdzie",
  "kiedy",
  "chce",
  "chcial",
  "potrzebuj",
  "samoch",
  "auto",
  "auta",
  "dzien",
  "dobry",
  "prosze",
  "kaucj",
  "cen",
  "wynaj",
  "dostepn",
  "mozna",
  "moge",
  "jest",
  "na",
  "od",
  "do",
  "dla",
  "osob",
  "tak",
  "nie",
  "witam",
  "szukam",
  "poprosz",
];
const EN_MARKERS = [
  "the",
  "is",
  "are",
  "how",
  "much",
  "what",
  "where",
  "when",
  "want",
  "need",
  "car",
  "hire",
  "rent",
  "available",
  "price",
  "deposit",
  "can",
  "i",
  "would",
  "like",
  "hello",
  "hi",
  "please",
  "looking",
  /*
   * Function words, added after "Do you have a Porsche Cayenne?" was answered
   * in Polish. The Polish list matches by prefix, so "do" scored for Polish
   * while nothing on this side scored at all, and one stray preposition
   * outvoted an entirely English sentence.
   *
   * Only words that cannot be Polish are listed. "do" is deliberately absent —
   * it is a word in both languages and belongs to neither side of the count;
   * "we" likewise ("we Wrocławiu").
   */
  "you",
  "your",
  "have",
  "has",
  "does",
  "any",
  "got",
  "with",
  "for",
  "about",
  "there",
  "thanks",
];

/**
 * Which language to answer in.
 *
 * Marker counting, not a library: the question is only ever "Polish or English",
 * the texts are short, and a wrong answer is recoverable (the visitor writes
 * again). Ties go to Polish — it is the primary market, and the site's default.
 */
export function detectLocale(text: string, fallback: Locale = "pl"): Locale {
  const t = tokens(text);
  if (t.length === 0) return fallback;
  let pl = 0;
  let en = 0;
  for (const tok of t) {
    if (PL_MARKERS.some((m) => tok.startsWith(m))) pl++;
    if (EN_MARKERS.includes(tok)) en++;
  }
  // Any Polish diacritic at all is decisive — English never has them.
  if (/[ąćęłńóśźż]/i.test(text)) return "pl";
  if (en > pl) return "en";
  if (pl > en) return "pl";
  return fallback;
}

/* ── Intent patterns ──────────────────────────────────────────────────────── */

/**
 * Keyword sets per intent, both languages in one list.
 *
 * Scored rather than first-match: "ile kosztuje kaucja za BMW" hits both
 * GET_PRICE ("kosztuje") and GET_DEPOSIT ("kaucja"), and the deposit is the
 * more specific answer. Specific intents therefore carry heavier weights than
 * general ones, and the heaviest total wins.
 */
type Pattern = { intent: Intent; weight: number; any: string[] };

/**
 * The twenty-one subjects on which A&A has not decided anything yet.
 *
 * Catalogued by the audit of 2026-08-20 and listed in
 * `docs/RAPORT-CHATBOT-AUDYT.md`. Every one of them used to be answered by the
 * FAQ matcher picking its nearest entry, which is how a question about
 * passports came back as "Tak. Fotelik kosztuje 30 zł za dzień" and a question
 * about the driver's minimum age came back as a monthly rate.
 *
 * Deliberately absent from this list: deposits, mileage, VAT invoices, travel
 * inside the EU, insurance cover, cleaning, GPS — those DO have approved
 * answers, and intercepting them would replace a good answer with a referral.
 *
 * Each line is a stem matched at a word boundary; see `hits`.
 */
/**
 * Anything that means "I want to drive this car out of Poland".
 *
 * Country names are here to be RECOGNISED, never to be approved. Whatever the
 * customer names, the answer is the same rule: prior consent from A&A, obtained
 * from a person. That is why this is one flat list and not a permitted set —
 * a permitted set is exactly what the owner's decision forbids, and a list in
 * the code would eventually be read as one.
 */
const ABROAD_TOPIC: string[] = [
  "za granic",
  "zagranic",
  "poza polsk",
  "poza granic",
  "poza kraj",
  "wyjechac autem",
  "wyjazd autem",
  "przekroczyc granic",
  "abroad",
  "outside poland",
  "cross the border",
  "another country",
  "other countries",
  "foreign trip",
  "take the car to",
  // Ferry and transporter — still the car leaving the country.
  "prom do",
  "promem",
  "ferry",
  "laweta za granic",
  // Destinations customers actually name. Recognised, never granted.
  "niemiec",
  "niemczech",
  "germany",
  "czech",
  "slowacj",
  "slovakia",
  "litw",
  "lithuania",
  "lotw",
  "latvia",
  "estoni",
  "ukrain",
  "bialorus",
  "belarus",
  "rosj",
  "russia",
  "moldaw",
  "moldova",
  "moldova",
  "austri",
  "wloch",
  "italy",
  "francj",
  "france",
  "hiszpan",
  "spain",
  "chorwacj",
  "croatia",
  "wegr",
  "hungary",
  "holandi",
  "niderland",
  "netherlands",
  "belgi",
  "belgium",
  "norwegi",
  "norway",
  "szwecj",
  "sweden",
  "danii",
  "dania",
  "denmark",
  "wielkiej brytanii",
  "brytani",
  "anglii",
  "united kingdom",
  "szwajcari",
  "switzerland",
  "rumuni",
  "romania",
  "bulgari",
  "bulgaria",
  "grecj",
  "greece",
  "portugali",
  "portugal",
  "serbi",
  "turcj",
  "turkey",
];

/**
 * Questions about what the driver must bring to collect the car.
 *
 * Their own topic since the rules centre exists: the base requirement — a valid
 * licence and a valid identity document — is approved and always true, so this
 * is no longer a subject the assistant has to decline outright. What it must
 * still decline is everything the owner has not switched on, and the handler
 * does that in its closing sentence rather than by refusing the whole question.
 */
const DOCUMENTS_TOPIC: string[] = [
  "jakie dokument",
  "potrzebne dokument",
  "wymagane dokument",
  "jakich dokument",
  "co musze miec ze soba",
  "co trzeba miec ze soba",
  "paszport",
  "dowod osobist",
  "mobywatel",
  "prawo jazdy w telefon",
  "ukrainskie prawo",
  "zagraniczne prawo jazdy",
  "what documents",
  "which documents",
  "what do i need to bring",
  "passport",
  "digital licence",
  "digital license",
];

/**
 * Driver age and licence tenure.
 *
 * Moved out of `AWAITING_POLICY` on 2026-08-20: the owner approved thresholds
 * per class of car, so these questions have an answer now — one that depends
 * on which car is being asked about. "mam 21" stays on the list because it is
 * how the question is usually asked ("mam 21 lat, mogę wynająć?").
 */
const DRIVER_AGE_TOPIC: string[] = [
  "ile lat",
  "ile trzeba miec lat",
  "minimalny wiek",
  "wiek kierowc",
  "wiek minimaln",
  "ile masz lat",
  "mam 18",
  "mam 19",
  "mam 20",
  "mam 21",
  "mam 22",
  "mam 23",
  "mam 24",
  "od ilu lat mozna wynaj",
  "staz prawa jazdy",
  "stazu prawa jazdy",
  "od ilu lat prawo",
  "jak dlugo musze miec prawo jazdy",
  "prawo jazdy od ilu",
  "minimum age",
  "how old",
  "age limit",
  "years of licence",
  "years of license",
  "licence held",
  "license held",
  "how long have i had my licence",
];

const AWAITING_POLICY: string[] = [
  // 1–2 · (moved out 2026-08-20 — driver age and licence tenure are approved
  //        per class of car; see DRIVER_AGE_TOPIC and Admin → Zasady wynajmu)
  // 3–4 · (moved out 2026-08-20 — documents now have an approved base rule;
  //        see DOCUMENTS_TOPIC and Admin → Zasady wynajmu)
  // 5 · insurance excess
  "udzial wlasn",
  "udzialu wlasn",
  "franszyz",
  "excess",
  "deductible",
  // 6 · damage procedure (policy, not an emergency in progress)
  "w przypadku szkod",
  "razie szkod",
  "co ze szkod",
  "kto placi za szkod",
  "if the car is damaged",
  "in case of damage",
  // 7 · lost key
  "zgubi",
  "kluczyk",
  "lost key",
  "lost the key",
  // 8–9 · fines and parking
  "mandat",
  "opłate administracyjn",
  "oplate administracyjn",
  "oplata administracyjn",
  "strefa platn",
  "strefie platn",
  "parkowani",
  "parking ticket",
  "parking fine",
  "speeding",
  "penalty",
  // 10 · fuel and charging
  "pelnym bakiem",
  "pelny bak",
  "oddaje z pelnym",
  "tankowani",
  "zatankowa",
  "ladowani",
  "ladowarki",
  "kto placi za ladowan",
  "full tank",
  "refuel",
  "charging",
  "who pays for charging",
  // 11 · (moved out 2026-08-20 — foreign travel now has an approved rule; see
  //        ABROAD_TOPIC and docs/ZASADY-BIZNESOWE.md)
  // 12 · pets
  "z psem",
  "psa do auta",
  "zwierz",
  "kotem",
  "with a dog",
  "with a pet",
  "pets allowed",
  // 13 · smoking
  "palic w",
  "palenie w",
  "papieros",
  "smoke in",
  "smoking in",
  // 14 · equipment we do not track per car
  "opony zimow",
  "oponach zimow",
  "lancuch",
  "isofix",
  "bagaznik na nart",
  "na narty",
  "relingi",
  "carplay",
  "android auto",
  "winter tyres",
  "winter tires",
  "ski rack",
  // 15 · payment methods
  "gotowk",
  "blik",
  "karta debetow",
  "karte debetow",
  "debetow",
  "kiedy trzeba zaplacic",
  "kiedy place",
  "cash",
  "debit card",
  "when do i pay",
  // 16 · the rental terms document itself
  "regulamin",
  "terms and conditions",
];

/**
 * Does this keyword appear as the start of a word?
 *
 * Plain `includes` was matching keywords inside unrelated words, and the suite
 * caught two: "wiek" (the minimum-driver-age FAQ) fired on "wię**ksze**" after
 * diacritics were stripped, and "tani" (cheap) fired on "py**tani**e". Both
 * turned an ordinary sentence into the wrong intent.
 *
 * Prefix-at-word-boundary is the right shape for Polish: the keywords are
 * stems, so "kaucj" must still match "kaucja" and "kaucji" — only the START has
 * to align with a word. Keywords beginning with punctuation (".env") keep the
 * old substring behaviour, since `\b` does not mean anything useful there.
 */
function hits(text: string, keyword: string): boolean {
  if (!/^[a-z0-9]/.test(keyword)) return text.includes(keyword);
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}`).test(text);
}

const PATTERNS: Pattern[] = [
  /**
   * A car in trouble, right now. Above every other pattern including the
   * refusals: somebody standing on a hard shoulder must not be routed into a
   * discussion about discounts because they used the word "cena" as well.
   */
  {
    intent: "EMERGENCY",
    weight: 12,
    any: [
      "wypadek",
      "wypadk",
      "kolizj",
      "stluczk",
      "zderz",
      "dachowa",
      "rozbil",
      "uderzyl",
      "awari",
      "zepsul",
      "zepsut",
      "nie odpala",
      "nie zapala",
      "nie chce odpalic",
      "nie moge odpalic",
      "nie rusza",
      "holowani",
      "holowan",
      "laweta",
      "pomoc drogow",
      "utknal",
      "utknelam",
      "utknelem",
      "zlapalem gume",
      "zlapalam gume",
      "przebita opon",
      "accident",
      "crashed",
      "crash",
      "collision",
      "broke down",
      "broken down",
      "breakdown",
      "wont start",
      "will not start",
      "does not start",
      "doesnt start",
      "towing",
      "tow truck",
      "flat tyre",
      "flat tire",
      "roadside assistance",
    ],
  },
  /**
   * Topics with no approved A&A answer. Below the refusals, above everything
   * that could guess — the whole point is to reach the customer before the FAQ
   * matcher offers its least-bad entry.
   */
  {
    intent: "NEEDS_STAFF_CONFIRMATION",
    weight: 9,
    any: AWAITING_POLICY,
  },
  /**
   * Weight 8: below the "no approved rule" catch, above everything that could
   * answer. Sitting under NEEDS_STAFF_CONFIRMATION is deliberate — "Czy
   * akceptujecie ukraińskie prawo jazdy?" is a question about documents, not
   * about driving to Ukraine, and the more specific rule has to win.
   */
  {
    intent: "ABROAD",
    weight: 8,
    any: ABROAD_TOPIC,
  },
  /**
   * Weight 9, alongside the "no approved rule" catch rather than below it:
   * a documents question has an approved answer now, and must not be swallowed
   * by a neighbouring keyword on its way to the customer.
   */
  {
    intent: "DOCUMENTS",
    weight: 9,
    any: DOCUMENTS_TOPIC,
  },
  /**
   * Weight 9 for the same reason as documents: there is an approved answer, and
   * it must reach the customer rather than be swallowed by a neighbouring
   * keyword. Above the FAQ matcher, because the FAQ entry it would find is
   * generated from the very same rule and cannot say which class of car the
   * question was about.
   */
  {
    intent: "DRIVER_AGE",
    weight: 9,
    any: DRIVER_AGE_TOPIC,
  },
  // Things the assistant must refuse. Highest weight so they beat everything.
  {
    intent: "OUT_OF_SCOPE",
    weight: 10,
    any: [
      "rabat",
      "znizk",
      "zniz",
      "obniz",
      "tanie j",
      "promocj",
      "kod rabat",
      "discount",
      "cheaper for me",
      "voucher",
      "zmien cen",
      "zmienic cen",
      "ustaw cen",
      "change price",
      "set price",
      "usun rezerwacj",
      "skasuj rezerwacj",
      // Fleet state is the operator's to set, never a visitor's to suggest.
      "ustaw status",
      "zmien status",
      "set status",
      "anuluj rezerwacj",
      "delete reservation",
      "cancel my paid",
      "zwrot pieniedzy",
      // Narrow on purpose. A bare "refund" also matches "is the deposit
      // refundable", which is an ordinary question about the deposit — and
      // refusing to answer it was worse than any attack this rule prevents.
      "refund my",
      "want a refund",
      "give me a refund",
      "dane klient",
      "dane wszystkich",
      "wszystkie rezerwacj",
      // Somebody else's booking, in the phrasings a probe actually uses. The
      // data layer has no function that could answer these — this only fixes
      // the reply, which used to be "ilu pasażerów?" and read as if the
      // assistant were about to look. Saying no plainly is the honest answer.
      "rezerwacje innych",
      "rezerwacji innych",
      "dane innych",
      "danych innych",
      "other customers",
      "someone elses booking",
      "other peoples booking",
      "all reservations",
      "customer data",
      /*
       * These four replaced a bare "show me all", which refused far more than
       * it was written for: "Show me all your cars" — the single most obvious
       * sentence an English-speaking visitor types, and the one the whole
       * browse-the-fleet path exists to answer — was met with a refusal. The
       * dangerous half of the phrase is what follows it, so that is what is
       * matched now. Reservations and customer data are covered by the two
       * entries above regardless.
       */
      "show me all customer",
      "show me all booking",
      "show me all user",
      "show me all reservation",
      "lista klient",
      "api key",
      "apikey",
      "klucz api",
      "system prompt",
      "systemowy prompt",
      "twoje instrukcj",
      "your instructions",
      "ignore previous",
      "zignoruj",
      "haslo",
      "password",
      "admin panel",
      "panelu admin",
      "baza danych",
      "database",
      ".env",
      "secret",
      "sekret",
      // Anything that asks the system to execute rather than to answer.
      // "Wykonaj SQL SELECT * FROM users" was reaching UNKNOWN and therefore
      // qualifying for escalation — the one message that must never be handed
      // to a model was the one message being handed to it.
      "sql",
      "select from",
      "drop table",
      "insert into",
      "delete from",
      "update set",
      "union select",
      "truncate",
      "shell",
      "bash",
      "sudo",
      "chmod",
      "rm -rf",
      "ssh",
      "filesystem",
      "system plikow",
      "zmienne srodowisk",
      "developer mode",
      "tryb developer",
      "jestem administrator",
      "jestem adminem",
      "pokaz konfiguracj",
      "show configuration",
      "twoje instrukcje",
      "reveal your",
    ],
  },
  /**
   * A reservation that already exists. Above CONTACT_HUMAN and START_BOOKING:
   * "cancel my booking" contains "booking", and being sold a car when you are
   * trying to cancel one is the worst reading of the sentence available.
   */
  {
    intent: "MANAGE_BOOKING",
    weight: 8,
    any: [
      "anuluj",
      "anulowac",
      "anulowanie",
      "odwolac rezerwacj",
      "zrezygnowac",
      "rezygnacja",
      "zmienic rezerwacj",
      "zmiana rezerwacji",
      // Polish puts words between the verb and the noun: "zmienić TERMIN
      // rezerwacji" never matched "zmienic rezerwacj" and fell through to an
      // unanswered FAQ.
      "termin rezerwacji",
      "terminu rezerwacji",
      "zmienic termin rezerw",
      "przelozyc rezerwacj",
      "przelozenie rezerwacji",
      "przesunac rezerwacj",
      "moja rezerwacja",
      "mojej rezerwacji",
      "cancel",
      "change my booking",
      "change my reservation",
      "amend",
      "reschedule",
      "my booking",
      "my reservation",
      "existing booking",
    ],
  },
  /**
   * How renting works here, start to finish. Above the FAQ matcher, which used
   * to answer this from whichever entry shared a word with it.
   */
  {
    intent: "HOW_TO_RENT",
    weight: 7,
    any: [
      "jak wynajac",
      "jak moge wynajac",
      "jak mozna wynajac",
      "jak sie wynajmuje",
      "jak wyglada wynajem",
      "jak wyglada proces",
      "jak zarezerwowac",
      "jak moge zarezerwowac",
      "jak to dziala",
      "jak przebiega",
      "co trzeba zrobic zeby wynajac",
      "od czego zaczac",
      "how can i rent",
      "how do i rent",
      "how to rent",
      "how can i book",
      "how do i book",
      "how to book",
      "how does it work",
      "how does the rental work",
      "what is the process",
      "where do i start",
    ],
  },
  /**
   * "Let me look myself." Above FIND_CAR so the menu button stops asking how
   * many passengers are travelling before it will show a single car.
   */
  {
    intent: "BROWSE_FLEET",
    weight: 7,
    any: [
      "pokaz flot",
      "zobacz flot",
      "cala flot",
      "calej floty",
      "wasza flota",
      "waszej floty",
      "jakie macie auta",
      "jakie macie samochod",
      "jakimi autami",
      "wszystkie auta",
      "wszystkie samochody",
      "lista aut",
      "lista samochodow",
      "oferta aut",
      "show the fleet",
      "see the fleet",
      "your fleet",
      "the fleet",
      "whole fleet",
      "entire fleet",
      "all cars",
      "all your cars",
      "all the cars",
      "what cars do you have",
      "which cars do you have",
      "list of cars",
      "browse",
    ],
  },
  {
    intent: "CONTACT_HUMAN",
    weight: 6,
    any: [
      "pracownik",
      "czlowiek",
      "konsultant",
      "doradc",
      "zadzwon",
      "telefon do",
      "kontakt z",
      // "Proszę o kontakt telefoniczny" scored nothing at all and came back as
      // an unanswered FAQ — a request for a person, refused.
      "kontakt telefon",
      "prosze o kontakt",
      "poprosze o kontakt",
      /*
       * Samo „kontakt" — dołożone w 44D, bo „chcę kontakt" i „potrzebuję
       * kontaktu" nie trafiały w ŻADEN z wzorców wyżej i wracały jako UNKNOWN.
       * Klient prosił o kontakt tymi dwoma słowami i dostawał „nie rozumiem".
       *
       * `hits` zakotwicza dopasowanie na granicy słowa (`\bkontakt`), więc
       * „płatność bezkontaktowa" NIE wpada tu przez przypadek — sprawdzone,
       * bo to była jedyna realna obawa przy tak krótkim słowie. Pytanie
       * „do której godziny jest kontakt?" przegrywa z OPENING_HOURS, które ma
       * wagę 7 właśnie po to.
       */
      "kontakt",
      "prosze o telefon",
      "niech ktos zadzwoni",
      "please contact me",
      /*
       * Bez „please" — 44D. Wzorzec wymagał grzecznościowego wstępu, więc samo
       * „contact me", czyli dokładnie to zdanie, które zamówienie tego etapu
       * wymienia z nazwy, wracało jako UNKNOWN.
       */
      "contact me",
      "contact us",
      /*
       * ANGIELSKIE ODPOWIEDNIKI TEGO, CO POLSKI ŁAPIE GOŁYM „kontakt" — 31.08.2026.
       *
       * Polska strona ma wzorzec „kontakt", więc „jak się z wami skontaktować",
       * „proszę o kontakt" i „jaki macie telefon" trafiają do człowieka.
       * Angielska miała tylko „contact me/us", czyli prośbę o ODDZWONIENIE —
       * a pytanie „How can I contact A&A?" nie jest prośbą o oddzwonienie i
       * spadało do FAQ. Tam ginęło: po odsianiu słów-wypełniaczy zostaje samo
       * „contact", jedno słowo obecne w kilkunastu wpisach, więc dopasowywacz
       * słusznie odmawiał odpowiedzi na tak ogólnym sygnale. Efekt: klient
       * angielski nie dostawał numeru telefonu, polski dostawał.
       *
       * Frazy są DWUSŁOWNE i zakotwiczone na granicy słowa. Samo „contact"
       * byłoby tu złym pomysłem — „contact form", „contact page" i „contactless"
       * to nie są prośby o rozmowę. „Opening hours" i tak wygrywa, bo
       * OPENING_HOURS ma wagę 7 przeciwko 6 tutaj.
       */
      "contact you",
      "contact aa",
      "how do i contact",
      "how can i contact",
      "reach you",
      "get hold of",
      "your phone number",
      "your email",
      "want contact",
      "get in contact",
      "get in touch",
      "call me back",
      "porozmawiac z",
      "human",
      "agent",
      "call me",
      "speak to",
      "talk to",
      "someone",
      "operator",
    ],
  },
  {
    intent: "GET_DEPOSIT",
    weight: 6,
    any: ["kaucj", "deposit", "zastaw", "wplata zwrotna"],
  },
  /*
   * Hours. Weight 7 on purpose — one above CONTACT_HUMAN, because "do której
   * mogę zadzwonić?" contains "zadzwoń" and is not a request to be put through
   * to somebody; it is a question about when the phone is answered.
   */
  {
    intent: "OPENING_HOURS",
    weight: 7,
    any: [
      "do ktorej",
      "od ktorej",
      "o ktorej",
      "godziny otwarcia",
      "godzin otwarcia",
      "godziny pracy",
      "godzinach pracy",
      // "W jakich godzinach pracuje biuro?" reached none of the above — the
      // list had "godzinach pracy" and "pracujecie" but not the third-person
      // verb almost everybody actually types. The English side answered the
      // same question correctly all along, which is how the audit found it.
      "jakich godzinach",
      "godzinach pracuje",
      "godzinach dziala",
      "godzinach jest",
      "pracuje biuro",
      "czynne",
      "czynni",
      "otwarci",
      "otwarte jest",
      "pracujecie",
      "dziala biuro",
      "biuro dziala",
      "biuro czynne",
      "w nocy",
      "nocna",
      "po polnocy",
      "polnoc",
      "calodobow",
      "opening hours",
      "office hours",
      "business hours",
      "what time",
      "how late",
      "are you open",
      "when are you open",
      "at night",
      "after midnight",
      "midnight",
      "still open",
    ],
  },
  {
    intent: "GET_MILEAGE_LIMIT",
    weight: 6,
    any: [
      "limit km",
      "limit kilometr",
      "kilometr",
      "ile km",
      "mileage",
      "km limit",
      "przebieg dzienn",
      // Nadprzebieg. Do 01.09.2026 pytanie „ile kosztuje przekroczenie
      // kilometrow" trafialo tu tylko przypadkiem — przez samo slowo
      // „kilometr" — a „ile zaplace za nadprzebieg" nie trafialo wcale.
      "nadprzebieg",
      "przekroczenie limitu",
      "przekrocze limit",
      "ponad limit",
      "dodatkowy kilometr",
      "dodatkowe kilometry",
      "extra mileage",
      "excess mileage",
      "over the limit",
      "above the limit",
      "additional kilometre",
      "additional kilometer",
    ],
  },
  {
    intent: "COMPARE_CARS",
    weight: 6,
    any: [
      "porown",
      "co lepsz",
      "roznic",
      "compare",
      "vs",
      "versus",
      "which is better",
    ],
  },
  {
    /*
     * Waga 8 — WYŻEJ niż B2B (5) i niż wyszukiwanie auta (6), i to jest
     * konieczne, nie kosmetyczne. „Chcę zainwestować w samochód do waszej
     * floty" zawiera „samochód" i „flotę", więc bez przewagi przegrywa
     * z wyszukiwaniem auta; „chcę współpracować z firmą" zawiera „firmą",
     * więc przegrywa z B2B. Zdanie o współpracy ma jednak dokładnie jedno
     * czytelne znaczenie i nie jest pytaniem o ofertę.
     */
    intent: "PARTNERSHIP",
    weight: 8,
    any: [
      "zainwestowa",
      "inwestycj",
      "inwestor",
      "inwestowa",
      "zainwestuj",
      "partnerstw",
      "zostac partner",
      "zostać partner",
      "wspolprac inwestycyj",
      "współprac inwestycyj",
      "wniesc samochod",
      "wnieść samochód",
      "wniesc auto",
      "wnieść auto",
      /*
       * Z ZAIMKIEM: „Mam Porsche Panamerę i chcę WNIEŚĆ JE do waszej floty".
       * Wzorce z rzeczownikiem tego nie łapią, bo auto zostało nazwane zdanie
       * wcześniej — a to jest najbardziej naturalny sposób, w jaki człowiek
       * składa taką ofertę. Sam czasownik „wnieść" wystarczy: w kontekście
       * wynajmu aut nikt nie „wnosi" niczego innego.
       */
      "wniesc je",
      "wnieść je",
      "wniesc go",
      "wnieść go",
      "wniesc ja",
      "wnieść ją",
      "dolaczyc do floty",
      "dołączyć do floty",
      "moje auto do waszej floty",
      "swoje auto do waszej floty",
      "invest",
      "investor",
      "investment",
      "partnership",
      "become a partner",
      "become your partner",
      "add my car to your fleet",
      "put my car in your fleet",
      "join your fleet",
      /*
       * PYTANIE O ZYSK — całymi frazami, nigdy pojedynczym słowem.
       *
       * „Zwrot" w tym systemie znaczy przede wszystkim ODDANIE AUTA („zwrot
       * w innym mieście", „godziny zwrotu"), więc samo to słowo nie może
       * uruchamiać rozmowy o inwestycji — klient pytający, gdzie oddać auto,
       * dostałby wykład o modelach współpracy. Dopiero „stopa zwrotu"
       * i „gwarantujecie zwrot" nie znaczą już nic innego.
       *
       * Trafiają TUTAJ, a nie do FAQ, ponieważ handler partnerstwa jest
       * jedynym miejscem, które odpowiada na nie zgodnie z prawdą: warunki
       * ustala się indywidualnie, a asystent nie podaje żadnej liczby.
       */
      "stopa zwrotu",
      "zwrot z inwestycj",
      "zwrotu z inwestycj",
      "gwarantujecie zwrot",
      "gwarantowany zwrot",
      "ile zarobie",
      "ile zarobię",
      "ile moge zarobic",
      "ile mogę zarobić",
      "rate of return",
      "return on investment",
      "guaranteed return",
      "how much will i earn",
      "what return",
    ],
  },
  {
    intent: "B2B",
    weight: 5,
    any: [
      "dla firm",
      "na firme",
      "dla mojej firmy",
      "firma",
      "firmy",
      "firmowy",
      "firmowe",
      "b2b",
      "faktur",
      "nip",
      "business rental",
      "for business",
      // "We are a company and need three cars for a year" scored
      // CHECK_AVAILABILITY on "need … cars" and asked which car was meant.
      "we are a company",
      "we're a company",
      "our company",
      "our business",
      "on behalf of a company",
      "vat invoice",
      "fleet for our",
      "for company",
      "for my company",
      "company car",
      "corporate",
      "invoice",
      "dla biznesu",
      "biznesow",
      // "Chcemy wynająć flotę dla pracowników" named neither a company nor an
      // invoice and fell through to CONTACT_HUMAN — a fleet for staff is a
      // company enquiry whether or not the word "firma" is in the sentence.
      "dla pracownikow",
      "dla naszych pracownikow",
      "flote dla",
      "flota dla",
      "fleet for",
      "for our employees",
      "for employees",
      "for our staff",
      "for staff",
    ],
  },
  {
    intent: "LONG_TERM",
    weight: 5,
    any: [
      "dlugotermin",
      "dlugi termin",
      "na miesiac",
      "miesieczn",
      "kilka miesiec",
      "pare miesiec",
      "na pol roku",
      "abonament",
      "long term",
      "long-term",
      "monthly rental",
      "monthly",
      "for a month",
      "for months",
      "subscription",
      "na rok",
    ],
  },
  {
    intent: "AIRPORT",
    weight: 5,
    any: [
      "lotnisk",
      // Word-prefix keys, so "chopin" also catches "Chopina"/"Chopinie" and
      // "okeci" catches "Okęcie"/"Okęciu"/"Okęcia". The colloquial name is the
      // one a Varsovian reaches for first, and it was missing here entirely.
      "chopin",
      "okeci",
      "modlin",
      "airport",
      "terminal",
      "samolot",
      "przylot",
      "flight",
    ],
  },
  {
    intent: "CHECK_AVAILABILITY",
    weight: 5,
    any: [
      "dostepn",
      "wolne",
      "wolny",
      // Feminine and genitive. Enumerated rather than stemmed to "woln",
      // because that stem also catches "wolno" — "czy wolno palić?" is a
      // question about what is permitted, not about what is free that week.
      "wolna",
      "wolnych",
      "zajete",
      "czy jest",
      "czy moge wynajac",
      "available",
      "availability",
      "free on",
      // "free" alone is too broad ("free of charge"), so it is only taken as
      // availability when a period follows it.
      "free next",
      "free this",
      "free today",
      "free tomorrow",
      "free from",
      "is it free",
      "is there",
      "czy bedzie",
    ],
  },
  {
    intent: "GET_PRICE",
    weight: 5,
    any: [
      "ile kosztuj",
      "cena",
      // Polish declines it, and the greeting button says "Sprawdź cenę" — the
      // accusative that the bare "cena" above could never match. Listed in full
      // rather than shortened to "cen", which would also fire on "centrum".
      "cene",
      "ceny",
      "cenie",
      "cenach",
      "cenow",
      "cennik",
      "koszt",
      "ile za",
      "ile bedzie",
      "ile to bedzie",
      "ile wyjdzie",
      /*
       * The total, asked the way people actually ask it.
       *
       * These keys are matched as word prefixes against the whole sentence, so
       * "ile wyjdzie" never fired on "ile TO wyjdzie" — the words are not
       * adjacent. "Ile to wszystko wyniesie?", "Ile razem?" and "What is the
       * total?" reached no pattern at all and came back as "nie mam pewnej
       * informacji", one message after the assistant had quoted a price.
       *
       * They resolve to GET_PRICE rather than to a new intent because that is
       * what they are, and its handler already refuses to invent: with no car
       * or no dates it asks for them instead of producing a number.
       */
      "ile to wyjdzie",
      "ile to wszystko",
      "ile to razem",
      "ile razem",
      "ile w sumie",
      "ile lacznie",
      "calkowity koszt",
      "koszt calkowity",
      "laczny koszt",
      "laczna kwota",
      "altogether",
      "in total",
      "total",
      "overall",
      "ile zaplac",
      "ile bym zaplac",
      "ile placi",
      "wycen",
      "stawka",
      "price",
      "cost",
      "how much",
      "rate",
      "quote",
    ],
  },
  {
    intent: "START_BOOKING",
    weight: 5,
    any: [
      "chce zarezerwowac",
      "rezerwuj",
      "zarezerw",
      "booking",
      "book it",
      "book the",
      "book a",
      "reserve",
      "chce wynajac",
      "wynajmuje",
      "i want to rent",
      "i want to book",
      "would like to rent",
      "like to rent",
      "chcialbym wynajac",
      "chce wziac",
    ],
  },
  {
    intent: "FIND_CAR",
    weight: 4,
    any: [
      "szukam",
      "potrzebuj",
      "polec",
      "doradz",
      "jaki samoch",
      "jakie auto",
      "pokaz",
      // The greeting menu's own buttons. "Znajdź samochód" scored nothing and
      // fell through to the FAQ matcher, which answered a question about clean
      // cars — a button the assistant itself offers must always route.
      "znajdz",
      "znajdziesz",
      "dobierz",
      "zaproponuj",
      /*
       * "flot" / "fleet" used to live here, because "Zobacz flotę" had nowhere
       * else to go. They moved to `BROWSE_FLEET` on 2026-08-21 and must not
       * come back: scores accumulate per matched keyword, so "pokaż flotę"
       * scored FIND_CAR twice ("pokaz" + "flot") and beat the very intent
       * written for it — the button went on asking how many passengers were
       * travelling instead of showing the fleet.
       */
      "dla ilu",
      "dla osob",
      // A family holiday is a car search stated as an occasion. Without these
      // it scored nothing and was refused as an unknown question.
      "rodzin",
      "family",
      "na wakacje",
      "na urlop",
      "na wyjazd",
      "holiday",
      "road trip",
      // "Pokaż podobne auta" / "Show similar cars" — the button offered after
      // an unavailable car. The Polish one worked through "pokaz"; the English
      // one matched nothing and landed in the FAQ, which answered a question
      // about something else entirely.
      "podobn",
      "similar",
      "alternatyw",
      "alternative",
      "looking for",
      "recommend",
      "suggest",
      "show me",
      "i need",
      "which car",
      "find",
    ],
  },
  {
    intent: "GREETING",
    weight: 2,
    any: [
      "dzien dobry",
      "czesc",
      "witam",
      "hej",
      "hello",
      "hi ",
      "good morning",
      "good evening",
    ],
  },
];

/**
 * Question-shaped words → FAQ, in two strengths.
 *
 * "Czy" and "how" only mean somebody asked something, and on their own they
 * lose to any real intent — otherwise every question in the suite becomes an
 * FAQ lookup. The strong list names an actual FAQ subject, and those outrank a
 * generic "I need" so that "what documents do I need?" stops being read as a
 * request for a car.
 */
const FAQ_MARKERS_WEAK = [
  "czy",
  "jak",
  "gdzie",
  "kiedy",
  "co jesli",
  "czym",
  "what",
  "how",
  "where",
  "when",
  "zwrot",
  "odbior",
  "return",
  "pickup",
];

const FAQ_MARKERS_STRONG = [
  "jakie dokument",
  "dokument",
  "wymagan",
  "ubezpieczen",
  "granic",
  "za granice",
  "niemiec",
  "dodatkowy kierowc",
  "drugiego kierowc",
  "drugi kierowc",
  "platnosc",
  "zaplac",
  "gotowk",
  "dowod",
  "prawo jazdy",
  "prawa jazdy",
  "ile lat",
  "wiek kierowc",
  "minimalny wiek",
  "fotelik",
  "zwracam",
  "gdzie oddac",
  "gdzie zwrac",
  "where do i return",
  "where to return",
  "insurance",
  "abroad",
  "germany",
  "documents",
  "additional driver",
  "second driver",
  "payment",
  "cash",
  "licence",
  "license",
  "child seat",
  "how old",
];

/* ── Entity extraction ────────────────────────────────────────────────────── */

const MONTHS_PL: Record<string, number> = {
  stycz: 1,
  luty: 2,
  lut: 2,
  marz: 3,
  mar: 3,
  kwiet: 4,
  kwie: 4,
  maj: 5,
  czerw: 6,
  lip: 7,
  sierp: 8,
  wrzes: 9,
  wrze: 9,
  pazdz: 10,
  listop: 11,
  grudn: 12,
  grud: 12,
};
const MONTHS_EN: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

/**
 * Lengths written as words: "na trzy dni", "for five days".
 *
 * Separate from `NUMBER_WORDS` further down because the cases differ — a length
 * takes the plain numeral ("trzy dni"), a headcount takes the genitive ("nas
 * trzech"). One table trying to serve both would match neither well.
 */
const DAY_WORDS: Record<string, number> = {
  jeden: 1,
  dwa: 2,
  trzy: 3,
  cztery: 4,
  piec: 5,
  szesc: 6,
  siedem: 7,
  osiem: 8,
  dziewiec: 9,
  dziesiec: 10,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const isoOf = (d: Date) => iso(d.getFullYear(), d.getMonth() + 1, d.getDate());

/**
 * Dates, in the shapes people actually type.
 *
 * Handles: "20-25.08", "20.08 - 25.08", "od 20 do 25 sierpnia", "2026-08-20",
 * "jutro", "w weekend", "na 5 dni", "for a week". A bare day-and-month with no
 * year resolves to the next occurrence, never to a date in the past — "20
 * sierpnia" typed in December means next August, and offering a rental that
 * already happened is worse than asking.
 *
 * `today` is a parameter rather than `new Date()` so the behaviour is testable.
 */
export function parseDates(
  text: string,
  today: Date,
): { from: string | null; to: string | null; days: number | null } {
  const t = normalize(text);
  const year = today.getFullYear();

  const inFuture = (m: number, d: number): string => {
    const candidate = new Date(year, m - 1, d);
    // Same-day counts as future; yesterday rolls to next year.
    return isoOf(candidate) >= isoOf(today)
      ? iso(year, m, d)
      : iso(year + 1, m, d);
  };

  /**
   * A range whose end is anchored to its own start.
   *
   * `inFuture` is right for one date and wrong for two, because it rolls each
   * end over independently: asked on 21 August for "20–25 sierpnia" it returned
   * 2027-08-20 → 2026-08-25, a range that ends fifteen months before it starts.
   * Everything downstream then compared the two and got nonsense — no
   * availability window, no day count, no price.
   *
   * So the start is resolved first, on its own merits, and the end is placed in
   * the start's year, moving forward a year only if that would put it before
   * the start. A rental cannot end before it begins, whatever the customer
   * typed.
   */
  const futureRange = (
    m1: number,
    d1: number,
    m2: number,
    d2: number,
  ): { from: string; to: string } => {
    const from = inFuture(m1, d1);
    const fromYear = Number(from.slice(0, 4));
    const sameYear = iso(fromYear, m2, d2);
    return {
      from,
      to: sameYear >= from ? sameYear : iso(fromYear + 1, m2, d2),
    };
  };

  // 1. Full ISO dates: 2026-08-20
  const isoAll = [...t.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)];
  if (isoAll.length >= 2) {
    return { from: isoAll[0][0], to: isoAll[1][0], days: null };
  }
  if (isoAll.length === 1) {
    return { from: isoAll[0][0], to: null, days: null };
  }

  // 2. Numeric day.month pairs: "20.08 do 25.08", "20/08-25/08"
  const dm = [...t.matchAll(/\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/g)];
  if (dm.length >= 2) {
    return {
      ...futureRange(
        Number(dm[0][2]),
        Number(dm[0][1]),
        Number(dm[1][2]),
        Number(dm[1][1]),
      ),
      days: null,
    };
  }

  // 3. "od 20 do 25 sierpnia" / "from 20 to 25 august" — one month, two days.
  const monthName = (() => {
    for (const [key, m] of Object.entries(MONTHS_PL)) {
      if (t.includes(key)) return m;
    }
    for (const [key, m] of Object.entries(MONTHS_EN)) {
      if (new RegExp(`\\b${key}`).test(t)) return m;
    }
    return null;
  })();

  /**
   * 3a. English word order: "August 20 to August 25", "from Aug 20 until Aug 25".
   *
   * Pattern 3 below assumes the Polish shape — two numbers sharing one month
   * name at the end ("od 20 do 25 sierpnia"). English puts the month first and
   * repeats it, so the two days never end up adjacent and the range regex there
   * cannot see them: "from August 20 to August 25" parsed as a single 20 August
   * with no end date, the availability check never ran, and the assistant asked
   * how many passengers were travelling instead. That was audit case EN-22.
   *
   * Collected in text order and only used when there really are two, so a
   * one-sided "from August 20" still falls through to the logic below.
   */
  {
    const names = [...Object.entries(MONTHS_PL), ...Object.entries(MONTHS_EN)]
      .map(([k, m]) => [k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), m] as const)
      // Longest first, so "marca" is not shadowed by a shorter key that is its
      // own prefix, and "august" wins over any three-letter abbreviation.
      .sort((a, b) => b[0].length - a[0].length);
    const alt = names.map(([k]) => k).join("|");
    const found: { at: number; month: number; day: number }[] = [];
    // Month before day ("august 20") and day before month ("20 august") both
    // count — the same sentence can legitimately mix them.
    for (const re of [
      new RegExp(`\\b(${alt})\\w*\\s+(\\d{1,2})\\b`, "g"),
      new RegExp(`\\b(\\d{1,2})\\s+(${alt})\\w*`, "g"),
    ]) {
      for (const m of t.matchAll(re)) {
        const monthFirst = Number.isNaN(Number(m[1]));
        const key = monthFirst ? m[1] : m[2];
        const day = Number(monthFirst ? m[2] : m[1]);
        const month = names.find(([k]) => k === key)?.[1];
        if (month && day >= 1 && day <= 31)
          found.push({ at: m.index ?? 0, month, day });
      }
    }
    found.sort((a, b) => a.at - b.at);
    // Deduplicate: the two regexes can both match around the same position.
    const uniq = found.filter(
      (f, i) =>
        i === 0 || f.month !== found[i - 1].month || f.day !== found[i - 1].day,
    );
    if (uniq.length >= 2) {
      return {
        ...futureRange(uniq[0].month, uniq[0].day, uniq[1].month, uniq[1].day),
        days: null,
      };
    }
  }

  if (monthName) {
    /**
     * "20-25 sierpnia", "od 20 do 25 sierpnia" — and "20–25 sierpnia".
     *
     * `normalize` turns an en dash into a space, so by the time we get here the
     * last one reads "20 25 sierpnia" and a separator-requiring pattern misses
     * it. So whitespace counts as a separator here — but SOMETHING must
     * separate the two numbers.
     *
     * Making the separator fully optional looked equivalent and was not: with
     * nothing required between the groups, "22" matches as "2" and "2", and
     * "od 22 sierpnia" silently became a range ending on 2 August. The
     * multi-turn context test caught it. A separator that may be a space is
     * fine; a separator that may be nothing is a bug.
     */
    const range = t.match(
      /\b(\d{1,2})(?:\s*(?:-|do|to|—|–)\s*|\s+)(\d{1,2})\b/,
    );
    if (range) {
      return {
        ...futureRange(
          monthName,
          Number(range[1]),
          monthName,
          Number(range[2]),
        ),
        days: null,
      };
    }
    const single = t.match(/\b(\d{1,2})\b/);
    if (single) {
      return {
        from: inFuture(monthName, Number(single[1])),
        to: null,
        days: null,
      };
    }
  }

  if (dm.length === 1) {
    return {
      from: inFuture(Number(dm[0][2]), Number(dm[0][1])),
      to: null,
      days: null,
    };
  }

  // 4. Relative words. Most specific first: "pojutrze" contains no "jutro"
  // after normalisation, but "day after tomorrow" does contain "tomorrow".
  if (/\bpojutrze\b|\bday after tomorrow\b/.test(t)) {
    const d = isoOf(addDays(today, 2));
    return { from: d, to: d, days: 1 };
  }
  if (/\bjutro\b|\btomorrow\b/.test(t)) {
    const d = isoOf(addDays(today, 1));
    return { from: d, to: d, days: 1 };
  }
  if (/\bdzisiaj\b|\bdzis\b|\btoday\b/.test(t)) {
    const d = isoOf(today);
    return { from: d, to: d, days: 1 };
  }
  /*
    „Za godzinę", „na już", „asap" — czyli DZIŚ, powiedziane zegarem zamiast
    kalendarzem.

    Bez tego zdanie „potrzebuję auta za godzinę" nie niosło ŻADNEJ daty, więc
    asystent odpowiadał tak, jakby termin był dowolny — i nie miał jak wspomnieć
    o minimum trzech godzin, bo nie wiedział, że rozmowa dotyczy dzisiaj.
    Rozpoznajemy tu wyłącznie DZIEŃ; o tym, czy konkretna godzina jest
    dostatecznie daleko, rozstrzyga `lead-time.ts` i nikt poza nim.

    „Za trzy dni" celowo NIE wpada w ten wzorzec: `\d+\s*(godzin|h)` wymaga
    jednostki godzinowej, a dni mają własną gałąź wyżej.
  */
  if (
    /\bza\s+(godzine|godzinke|chwile|momencik|\d+\s*(godzin\w*|h))\b/.test(t) ||
    /\bin\s+(an?\s+hour|\d+\s*(hours?|h))\b/.test(t) ||
    /\bna\s+juz\b|\basap\b|\bnatychmiast\b|\bod\s+reki\b|\bright\s+now\b/.test(
      t,
    )
  ) {
    const d = isoOf(today);
    return { from: d, to: d, days: 1 };
  }
  if (/\bweekend\b/.test(t)) {
    // Friday to Sunday of the coming weekend — or the one after it. Shared with
    // the assistant's "Ten weekend" button, so a click and a sentence cannot
    // resolve to two different weekends.
    const next =
      /\bnastepny weekend\b|\bkolejny weekend\b|\bnext weekend\b/.test(t);
    const { from, to } = weekendRange(today, next);
    return { from, to, days: 3 };
  }

  // 5. A length with no dates: "na 5 dni", "for a week", "na tydzien".
  const nDays = t.match(
    /\b(?:na|for|przez)\s+(\d{1,3})\s*(?:dni|dzien|days?|day)\b/,
  );
  if (nDays) return { from: null, to: null, days: Number(nDays[1]) };
  // "na trzy dni", "for five days" — a spelled-out length is still a length.
  const wordDays = t.match(
    /\b(?:na|for|przez)\s+([a-z]+)\s*(?:dni|dzien|days?|day)\b/,
  );
  if (wordDays && DAY_WORDS[wordDays[1]] !== undefined) {
    return { from: null, to: null, days: DAY_WORDS[wordDays[1]] };
  }
  if (/\b(?:tydzien|tygodnie|week)\b/.test(t)) {
    return { from: null, to: null, days: 7 };
  }
  if (/\b(?:dwa tygodnie|two weeks|fortnight)\b/.test(t)) {
    return { from: null, to: null, days: 14 };
  }
  if (/\bkilka miesiec\w*|\bpare miesiec\w*|\bfew months\b/.test(t)) {
    return { from: null, to: null, days: 90 };
  }
  if (/\bpol roku\b|\bhalf a year\b/.test(t)) {
    return { from: null, to: null, days: 180 };
  }
  if (/\b(?:rok|roku|year)\b/.test(t)) {
    return { from: null, to: null, days: 365 };
  }
  if (/\b(?:miesiac|miesiace|miesiecy|month|months)\b/.test(t)) {
    return { from: null, to: null, days: 30 };
  }

  return { from: null, to: null, days: null };
}

/* ── The search axes, read separately ─────────────────────────────────────── */

/**
 * Axis 1 — body type, matched against `car_models.category`.
 *
 * ## Why these are regexes and not the keyword list they used to be
 *
 * The old list was matched with `hits()`, which anchors the start of a word and
 * lets the end run free — right for Polish inflection ("terenowego" from
 * "terenow"), catastrophic for a three-letter key. `\bbus` matches **business**,
 * `van` sat at the top of the list, and so "a business SUV" was answered with a
 * nine-seat Renault Trafic. Every entry below therefore closes its own end:
 * either an explicit `\b`, or an inflection tail that cannot reach across into
 * another word.
 *
 * Read most-specific-first. `van` stays above `suv` because "minibus" and
 * "9-osobowy" are unambiguous, and nothing in the SUV list can now match them.
 */
const BODY_WORDS: { body: string; test: RegExp }[] = [
  {
    body: "van",
    /*
     * `\bbus\b` and not `\bbus`: the boundary at the END is the entire fix.
     * Bare "busy" is deliberately absent — it is the English adjective far more
     * often than a Polish plural, and "busów"/"busem"/"busa" cover the real
     * queries.
     */
    test: /\b(bus|busa|busem|busie|busow|busik|busika|busiki|van|vana|vanem|vanie|vanow|minibus\w*|mikrobus\w*|minivan\w*|kombivan\w*)\b|\bpeople carrier\b/,
  },
  {
    body: "suv",
    test: /\bsuv\w*|\bterenow\w*|\bcrossover\w*|\b4x4\b|\boff[\s-]?road\w*/,
  },
  {
    /*
     * Only the words that mean the body and nothing else. "Limuzyna" is
     * deliberately absent: in Polish it is a claim about luxury at least as
     * often as about a body shape, and it already reaches the `luxury` shelf.
     */
    body: "sedan",
    test: /\bsedan\w*|\bsaloon\b/,
  },
];

/**
 * A body implied by a headcount, consulted only when no body was NAMED.
 *
 * "Dziewięcioosobowy" describes a vehicle, so it belongs on this axis — but it
 * must never outrank a word the customer actually typed. While it sat in the
 * list above, "Szukam SUV-a dla 9 osób" resolved to `van`, and a customer who
 * had said the word "SUV" was shown a Renault Trafic: the same
 * one-field-two-meanings failure the split was supposed to end, reintroduced
 * one level down. An explicit body always wins; this only fills a gap.
 *
 * The seat COUNT is parsed separately and always applies, so nothing is lost
 * when this matches nothing: "auto dla 9 osób" narrows to nine-seaters through
 * `seats` alone.
 */
const IMPLIED_BODY_WORDS: { body: string; test: RegExp }[] = [
  {
    body: "van",
    test: /\bdziewiecioosobow\w*|\b9[\s-]?(osobow\w*|miejscow\w*)\b|\b(nine|9)[\s-]?(seater|seats?)\b/,
  },
];

/**
 * Axis 2 — the commercial shelf, and nothing else.
 *
 * Three values, matching `COMMERCIAL_SEGMENTS`. What used to be in this list
 * and is not any more, with the reason each one left:
 *
 *   `premium-suv` — an intersection, produced now by a body word AND a shelf
 *                   word appearing in the same sentence, which is what the
 *                   customer actually typed.
 *   `van`         — a body type (axis 1).
 *   `electric`    — a fuel (axis 4), already parsed separately.
 *   `tani`        — a price preference (`wantsCheapest`), not a shelf. It used
 *                   to force `business`, which is why "tani SUV" answered with
 *                   the three most expensive SUVs in the fleet: the price word
 *                   set the segment, the segment excluded every cheap SUV, and
 *                   the sort never got a chance.
 *
 * "business"/"biznes" resolve to the `business` shelf because that is what A&A's
 * own copy calls it — `landing/suv.ts` reads "W klasie business: Volvo XC60,
 * Volkswagen Tiguan Highline i Toyota RAV4 Hybrid". An executive car is reached
 * by "executive" or "służbowy".
 */
const SEGMENT_WORDS: { segment: string; test: RegExp }[] = [
  {
    segment: "luxury",
    /*
     * `\bluxur\w*` rather than `\bluxury\b`: "something luxurious" is the
     * phrasing an English visitor reaches for, and the exact-word version
     * never matched it.
     *
     * "Premium" left this list on the owner's decision of 21.08.2026: the word
     * now resolves to the PREMIUM **driver class**, which is the approved
     * source of truth for it. See `DRIVER_CLASS_WORDS`.
     */
    test: /\bluksus\w*|\bluxur\w*|\blimuzyn\w*|\breprezentac\w*/,
  },
  { segment: "executive", test: /\bexecutive\b|\bsluzbow\w*/ },
  {
    segment: "business",
    test: /\bbusiness\b|\bbiznes\w*|\bekonomicz\w*|\boszczedn\w*|\bbudzet\w*/,
  },
];

/**
 * "Auto rodzinne", "coś większego" — a need, not a class.
 *
 * These used to point at `premium-suv`, which meant a family asking for a
 * family car was shown a Jaguar I-PACE, a Tesla Model X and a Mercedes GLE —
 * the three most expensive cars that happen to be SUVs — while the RAV4, the
 * Tiguan and the XC60 that the question is actually about stayed hidden.
 *
 * There is no approved business definition of "a family car", so none is
 * invented here. The flag carries only what the words literally assert — this
 * group is bigger than a couple — and `deterministic.ts` turns it into the one
 * technical criterion the fleet can answer honestly: enough seats.
 * **The criterion itself awaits the owner's acceptance; see the report.**
 */
const FAMILY_WORDS =
  /\brodzinn\w*|\bdla rodziny\b|\bfamily car\b|\bduze auto\b|\bduzy samoch\w*|\bduzego auta\b|\bwieksze auto\b|\bwiekszy samoch\w*|\b(cos|czegos) wiekszego\b|\bbig(ger)? car\b|\blarger car\b|\bsomething bigger\b/;

/**
 * Axis 3 — the driver-requirement class, which is what "premium" now means.
 *
 * Owner's decision, 21.08.2026: **the car's class is the source of truth for
 * the word "premium", not the `luxury` shelf.** The two are genuinely different
 * questions — `luxury` is where a car is sold, `PREMIUM` is who may drive it —
 * and the fleet already proves they diverge: a Volvo XC60 is `business` on the
 * shelf and `PREMIUM` in the class.
 *
 * "Luksusowy", "limuzyna" and "reprezentacyjny" continue to mean the `luxury`
 * shelf. Only "premium" moved.
 *
 * No model name appears here or anywhere downstream: the answer is whatever
 * carries `driver_class = premium` in the database.
 */
const DRIVER_CLASS_WORDS: { driverClass: string; test: RegExp }[] = [
  { driverClass: "premium", test: /\bpremium\w*/ },
];

/**
 * A budget the customer stated, in grosze per day.
 *
 * Owner's decision, 21.08.2026: no invented price threshold. "Tani" alone only
 * sorts; a NUMBER filters. So this reads the number and nothing else infers one.
 *
 * The three-digit floor is what keeps a date out of the filter: "od 20 do 25
 * sierpnia" carries a "do 25" that is a day of the month, and every rate in
 * this fleet is a three-figure sum. A one- or two-digit amount is therefore
 * only accepted when a currency word makes it unmistakable.
 */
/** The money words, as one alternation reused by every rule below. */
const CURRENCY_WORD = "(zl\\w*|pln|zlot\\w*|euro\\w*|eur)";

/** Which currency a captured word names. Absent capture reads as złoty. */
function currencyOf(word: string | undefined): "pln" | "eur" | null {
  if (!word) return null;
  return /^eur/.test(word) ? "eur" : "pln";
}

/**
 * A stated range: "od 200 do 400 zł", "między 80 a 100 euro", "300-500".
 *
 * Both ends may carry the currency word or neither may; whichever one is
 * present speaks for the pair, because nobody writes "od 200 zł do 400 zł".
 */
const BUDGET_RANGE_PL = new RegExp(
  "\\b(?:od|miedzy|pomiedzy|w przedziale|w granicach)\\s+(\\d{1,6})\\s*" +
    CURRENCY_WORD +
    "?\\s*(?:do|a|-)\\s*(\\d{1,6})\\s*" +
    CURRENCY_WORD +
    "?",
  "g",
);
const BUDGET_RANGE_EN = new RegExp(
  "\\b(?:between|from)\\s+(\\d{1,6})\\s*" +
    CURRENCY_WORD +
    "?\\s*(?:to|and|-)\\s*(\\d{1,6})\\s*" +
    CURRENCY_WORD +
    "?",
  "g",
);

/**
 * Widełki BEZ słowa wiodącego: „70-120 EUR", „300-500 zł dziennie".
 *
 * Najczęstszy zapis w prawdziwej rozmowie i jedyny, którego ten plik nie
 * rozumiał do 02.09.2026 — mimo że komentarz przy `BUDGET_RANGE_PL` wymieniał
 * „300-500" jako przykład, którego żadna reguła nie realizowała. Zamówienie
 * właściciela podało dokładnie tę postać: „Szukam samochodu za 70–120 EUR
 * dziennie".
 *
 * SŁOWO O WALUCIE JEST TU OBOWIĄZKOWE i to jest cała reguła. Widełki
 * z „od…do" mogą się bez niego obejść, bo same słowa mówią, że mowa o zakresie
 * czegoś. Goły myślnik nie mówi nic — a zdanie jest ich pełne: „20-25
 * sierpnia", „2-3 osoby", „10-14 września", „2020-2024". Bez wymogu waluty
 * każde z nich stałoby się filtrem cenowym, i to takim, którego klient nigdy
 * nie zobaczy: liczby powyżej setki przechodzą przez próg dat bez zatrzymania.
 *
 * Dwa warianty, bo waluta może stać przy którymkolwiek końcu; układ grup jest
 * ten sam, co w regułach wyżej, więc czyta je ta sama pętla.
 */
const BUDGET_RANGE_BARE_A = new RegExp(
  "(\\d{1,6})\\s*" +
    CURRENCY_WORD +
    "\\s*-\\s*(\\d{1,6})\\s*" +
    CURRENCY_WORD +
    "?",
  "g",
);
const BUDGET_RANGE_BARE_B = new RegExp(
  "(\\d{1,6})\\s*" + CURRENCY_WORD + "?\\s*-\\s*(\\d{1,6})\\s*" + CURRENCY_WORD,
  "g",
);

/** A ceiling on its own — the rule this file has always had. */
const BUDGET_PL = new RegExp(
  "\\b(?:do|max|maks\\w*|maksymalnie|budzet\\w*|ponizej|w granicach|nie wiecej niz|najwyzej)\\s+(?:okolo\\s+)?(\\d{1,6})\\s*" +
    CURRENCY_WORD +
    "?",
  "g",
);
const BUDGET_EN = new RegExp(
  "\\b(?:under|below|up to|max|maximum|budget(?:\\s+of)?|less than|no more than|within)\\s+(?:about\\s+)?(\\d{1,6})\\s*" +
    CURRENCY_WORD +
    "?",
  "g",
);

/**
 * A budget stated as a possession: "mam 1500 zł na cały wynajem".
 *
 * The currency word is REQUIRED here, and that requirement is the whole rule.
 * "Mam 1500 zł" is a budget; "mam 25 lat" and "mam 5 osób" are an age and a
 * headcount, and the only thing telling the three apart is whether the number
 * is followed by money. Making the currency optional here would turn every
 * sentence about the customer into a price filter.
 */
const BUDGET_HAVE_PL = new RegExp(
  "\\b(?:mam|mamy|dysponuje|dysponujemy|budzet to|budzet wynosi|budzet mam)\\s+(?:okolo\\s+)?(\\d{1,6})\\s*" +
    CURRENCY_WORD,
  "g",
);
const BUDGET_HAVE_EN = new RegExp(
  "\\b(?:i have|we have|got|my budget is|budget is)\\s+(?:about\\s+)?(\\d{1,6})\\s*" +
    CURRENCY_WORD,
  "g",
);

/**
 * A floor on its own — and never from a bare "od".
 *
 * "Od 20 sierpnia" and "od 300 zł" are the same word doing two different jobs,
 * and only one of them is a budget. A lone floor therefore needs a word that
 * cannot be a date ("co najmniej", "at least"); "od" is read as a floor only
 * inside a range, where the "do 400" after it settles the question.
 */
const BUDGET_MIN_PL = new RegExp(
  "\\b(?:co najmniej|minimum|min|przynajmniej|powyzej|nie mniej niz)\\s+(\\d{1,6})\\s*" +
    CURRENCY_WORD +
    "?",
  "g",
);
const BUDGET_MIN_EN = new RegExp(
  "\\b(?:at least|minimum|min|over|above|no less than|starting (?:at|from))\\s+(\\d{1,6})\\s*" +
    CURRENCY_WORD +
    "?",
  "g",
);

/**
 * Is the figure for one day or for the whole rental?
 *
 * "600 zł na cały weekend" and "600 zł za dobę" are three days apart in what
 * they can afford, and the tier table means the total is never the daily rate
 * multiplied out. Per day stays the default, because that is how this fleet's
 * prices are quoted and how every earlier conversation was read.
 */
const BUDGET_TOTAL_WORDS =
  /\b(?:za calosc|za cale|za caly|za cala|na calosc|na caly|na cale|na cala|lacznie|w sumie|w sumie za|calkowicie|calkowity|razem|za wszystko|in total|total|altogether|all in|overall|for the whole|for the entire|for all)\b/;
const BUDGET_DAY_WORDS =
  /\b(?:za dobe|na dobe|za doba|dobowo|dziennie|za dzien|na dzien|per day|a day|per night|daily|za nocleg)\b/;

/** A budget the customer stated, already converted to złoty grosze. */
export type ParsedBudget = {
  /** The floor, or null when only a ceiling was named. */
  minGrosze: number | null;
  /** The ceiling, or null when only a floor was named. */
  maxGrosze: number | null;
  /** What the amounts are a budget FOR. */
  kind: "day" | "total";
  /** The currency the customer named — for answering in the same one. */
  currency: "pln" | "eur";
};

/**
 * A budget the customer stated: one end or both, per day or for the whole
 * rental, in złoty or in euro.
 *
 * Owner's decision, 21.08.2026, still stands: no invented price threshold.
 * "Tani" alone only sorts; a NUMBER filters, and nothing here infers one.
 *
 * ## The three-digit floor, and why the currency word lifts it
 *
 * "Od 20 do 25 sierpnia" carries a "do 25" that is a day of the month, and
 * every złoty rate in this fleet is a three-figure sum — so a bare one- or
 * two-digit number is a date, not a budget. In euro the real amounts ARE
 * two-digit, which is exactly why the currency word is what legitimises them:
 * "do 90 euro" is unmistakable, "do 90" is the 90th of nowhere.
 *
 * ## Euro without a rate is not a filter
 *
 * If the euro amount cannot be converted, nothing is returned. The alternative
 * — guessing a rate, or filtering złoty prices by a euro number — would quietly
 * show the customer the wrong cars. See `lib/currency/rate`.
 */
function budgetOf(t: string, plnPerEur?: number | null): ParsedBudget | null {
  const kind: "day" | "total" = BUDGET_TOTAL_WORDS.test(t)
    ? // An explicit "za dobę" wins over a stray "w sumie": the more specific
      // statement about the same number is the one the customer meant.
      BUDGET_DAY_WORDS.test(t)
      ? "day"
      : "total"
    : "day";

  /*
   * Every rule that could match, in order of how specific it is — and each one
   * validated before the next is given up on.
   *
   * The order alone is not enough, and one real sentence proves it: „szukam
   * SUV-a do 100 zł za dobę od 10 do 14 września". The range rule fires first
   * and matches „od 10 do 14", which is a fortnight in September, not money;
   * both ends are then thrown out as dates. Stopping there would lose the „do
   * 100 zł" that the customer actually said. So a candidate that survives
   * nothing does not end the search — it hands over to the next rule.
   */
  const candidates: {
    min: number | null;
    max: number | null;
    currency: "pln" | "eur" | null;
  }[] = [];

  /*
   * EVERY match of every rule, not the first one of each.
   *
   * The second sentence that proved this: „czy Volvo XC60 jest wolne od 10 do
   * 14 września, budżet mam do 800 zł za dobę". The ceiling rule reads „do", and
   * the FIRST „do" in that sentence belongs to the date — „do 14". Taking one
   * match per rule threw away the „do 800 zł" standing eight words later, which
   * is the only money in the sentence. So the rules are global and every hit
   * becomes a candidate; validation below picks the first that is money rather
   * than a day of the month.
   */
  for (const re of [
    BUDGET_RANGE_PL,
    BUDGET_RANGE_EN,
    BUDGET_RANGE_BARE_A,
    BUDGET_RANGE_BARE_B,
  ]) {
    for (const m of t.matchAll(re)) {
      candidates.push({
        min: Number(m[1]),
        max: Number(m[3]),
        currency: currencyOf(m[2]) ?? currencyOf(m[4]),
      });
    }
  }
  for (const re of [BUDGET_PL, BUDGET_EN, BUDGET_HAVE_PL, BUDGET_HAVE_EN]) {
    for (const m of t.matchAll(re)) {
      candidates.push({
        min: null,
        max: Number(m[1]),
        currency: currencyOf(m[2]),
      });
    }
  }
  for (const re of [BUDGET_MIN_PL, BUDGET_MIN_EN]) {
    for (const m of t.matchAll(re)) {
      candidates.push({
        min: Number(m[1]),
        max: null,
        currency: currencyOf(m[2]),
      });
    }
  }

  const ok = (n: number | null): n is number =>
    n !== null && Number.isFinite(n) && n > 0;

  let found: (typeof candidates)[number] | null = null;
  let min: number | null = null;
  let max: number | null = null;

  for (const c of candidates) {
    // Without a currency word, only a sum too large to be a date is a budget.
    const dated = (n: number) => c.currency === null && n < 100;
    const cMin = ok(c.min) && !dated(c.min) ? c.min : null;
    const cMax = ok(c.max) && !dated(c.max) ? c.max : null;
    if (cMin === null && cMax === null) continue;
    found = c;
    min = cMin;
    max = cMax;
    break;
  }

  if (!found) return null;
  const currency = found.currency ?? "pln";

  if (currency === "eur") {
    if (!plnPerEur || !Number.isFinite(plnPerEur) || plnPerEur <= 0)
      return null;
    if (min !== null) min *= plnPerEur;
    if (max !== null) max *= plnPerEur;
  }

  // Two numbers typed in the order they were thought of, not a request for
  // nothing — the same reading the fleet filter gives a backwards range.
  let minGrosze = min === null ? null : Math.round(min * 100);
  let maxGrosze = max === null ? null : Math.round(max * 100);
  if (minGrosze !== null && maxGrosze !== null && minGrosze > maxGrosze) {
    [minGrosze, maxGrosze] = [maxGrosze, minGrosze];
  }

  return { minGrosze, maxGrosze, kind, currency };
}

function driverClassOf(t: string): string | null {
  return DRIVER_CLASS_WORDS.find((d) => d.test.test(t))?.driverClass ?? null;
}

function bodyTypeOf(t: string): string | null {
  return (
    BODY_WORDS.find((b) => b.test.test(t))?.body ??
    IMPLIED_BODY_WORDS.find((b) => b.test.test(t))?.body ??
    null
  );
}

function segmentOf(t: string): string | null {
  return SEGMENT_WORDS.find((s) => s.test.test(t))?.segment ?? null;
}

/**
 * Numbers written as words.
 *
 * "Jest nas sześciu" is how people actually count themselves, and a digit-only
 * rule reads it as no information at all. Polish forms are listed in the cases
 * that appear after "nas"/"dla"/"w" — the genitive is what a group uses about
 * itself.
 */
const NUMBER_WORDS: Record<string, number> = {
  jeden: 1,
  jedna: 1,
  dwa: 2,
  dwie: 2,
  dwoje: 2,
  dwoch: 2,
  dwojka: 2,
  trzy: 3,
  troje: 3,
  trzech: 3,
  trojka: 3,
  cztery: 4,
  czworo: 4,
  czterech: 4,
  piec: 5,
  pieciu: 5,
  pieciro: 5,
  szesc: 6,
  szesciu: 6,
  szescioro: 6,
  siedem: 7,
  siedmiu: 7,
  siedmioro: 7,
  osiem: 8,
  osmiu: 8,
  osmioro: 8,
  dziewiec: 9,
  dziewieciu: 9,
  // "jedziemy w ósemkę" — a group counting itself by the collective noun.
  dwojke: 2,
  trojke: 3,
  czworke: 4,
  piatke: 5,
  szostke: 6,
  siodemke: 7,
  osemke: 8,
  dziewiatke: 9,
  piatka: 5,
  szostka: 6,
  siodemka: 7,
  osemka: 8,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
};

function extractSeats(t: string): number | null {
  // "dla 5 osob", "5 osobowy", "for 5 people", "5 passengers", "na 7 osob"
  const m = t.match(
    /\b(\d{1,2})\s*(?:osob\w*|-?osobow\w*|people|persons?|passengers?|pax|seats?|miejsc\w*)\b/,
  );
  if (m) return Number(m[1]);

  // "jest nas sześciu", "dla czterech osób", "for six people", "we are five"
  const worded = t.match(
    /\b(?:nas|dla|for|w|jest nas|jestesmy|we are|there are|party of)\s+([a-z]+)\b/,
  );
  if (worded && NUMBER_WORDS[worded[1]] !== undefined) {
    return NUMBER_WORDS[worded[1]];
  }
  const beforePeople = t.match(
    /\b([a-z]+)\s+(?:osob\w*|people|persons?|passengers?)\b/,
  );
  if (beforePeople && NUMBER_WORDS[beforePeople[1]] !== undefined) {
    return NUMBER_WORDS[beforePeople[1]];
  }
  /*
   * "dla 5" — a bare number after a preposition, which usually means people.
   *
   * Usually. "na 6 miesięcy" has the same shape and means a period, and
   * reading it as six passengers is not a harmless slip: a company asking
   * about a six-month contract was answered with the nine-seat van, because
   * six seats had quietly become a search criterion. The unit that follows the
   * number is what settles it, so it is checked right there rather than by
   * asking whether the word "dni" appears anywhere in the sentence — which
   * also wrongly threw away the 5 in "dla 5 na 3 dni".
   */
  const m2 = t.match(
    /\b(?:dla|for|na)\s+(\d{1,2})\b(?!\s*(?:dni\b|dzien\w*|dob\w*|tyg\w*|mies\w*|lat\w*|rok\w*|godz\w*|days?\b|weeks?\b|months?\b|years?\b|hours?\b|nights?\b))/,
  );
  if (m2) {
    const n = Number(m2[1]);
    if (n >= 1 && n <= 9) return n;
  }
  if (/\brodzin\w*|\bfamily\b/.test(t)) return null; // deliberately vague → ask
  return null;
}

/**
 * "Prawo jazdy mam od roku", "how long must I have held my licence".
 *
 * Kept beside `extractStatedAge` because the two are asked in the same breath
 * and answered by the same handler — but they are different requirements, and
 * A&A can verify only one of them today.
 */
const LICENCE_TENURE_QUESTION =
  /\bstaz\w*\s+(?:prawa\s+)?jazdy\b|\bprawo\s+jazdy\s+(?:mam\s+)?od\b|\bod\s+(?:ilu|jak\s+dawna)\b|\bjak\s+dlugo\s+(?:musze|trzeba|mam)\b|\blicen[cs]e\s+for\b|\bheld\s+(?:my|a)\s+licen[cs]e\b|\bhow\s+long\s+.{0,20}licen[cs]e\b|\bdriving\s+experience\b/;

/**
 * The driver's own age, when they volunteer it.
 *
 * Requires a first-person opener or an age adjective, and a year word after the
 * number. Both guards earn their place: "mam 3 walizki" is not an age, and
 * "auto z 2019" is not one either.
 */
function extractStatedAge(t: string): number | null {
  const m = t.match(
    /\b(?:mam|mialem|mialam|skonczylem|skonczylam|jestem|i am|i'?m|im)\s+(\d{2})\b(?=\s*(?:lat\w*|rok\w*|years?\b|yo\b|$|[,.?!]))|\b(\d{2})\s*[- ]?(?:letni\w*|year[- ]old)\b/,
  );
  const n = Number(m?.[1] ?? m?.[2]);
  return Number.isFinite(n) && n >= 16 && n <= 99 ? n : null;
}

/**
 * Cars named in the sentence.
 *
 * Matches on model name first ("xc60", "rav4"), then on brand alone ("bmw").
 * A brand match is weaker — "jaka jest kaucja za BMW" is answerable only if the
 * fleet has exactly one BMW; the caller checks that and asks when it does not.
 */
function extractCars(
  t: string,
  vocab: Vocabulary,
): { ids: string[]; precise: boolean; replaced: boolean } {
  const found: { id: string; at: number }[] = [];
  const matchedBrands = new Set<string>();
  // A model-name hit ("XC60") is evidence; a brand-only hit ("BMW") is a guess
  // that happens to be safe because the brand has one car. The difference
  // matters to the confidence score, so it is tracked rather than flattened.
  let precise = false;

  /**
   * How many models share each first word.
   *
   * "RAV4 Hybrid" can safely answer to "rav4", but "Model S" must not answer to
   * "model" — "Model X" starts the same way, so the short form identifies a
   * Tesla without saying which, and asking beats picking. Only heads that are
   * unique across the fleet are usable as shortcuts.
   */
  const headCount = new Map<string, number>();
  for (const car of vocab.cars) {
    const head = normalize(car.model).split(" ")[0];
    if (head) headCount.set(head, (headCount.get(head) ?? 0) + 1);
  }

  /** "RAV4 Hybrid" also answers to "rav4"; "xc60" to "xc 60" and "xc-60". */
  const keysFor = (model: string): string[] => {
    const full = normalize(model);
    const head = full.split(" ")[0];
    const usable =
      head && head !== full && head.length >= 3 && headCount.get(head) === 1;
    return usable ? [full, head] : [full];
  };

  /**
   * Polish inflects car names: "tiguana", "panamerę", "Teslę".
   *
   * A trailing-letter allowance handles the first; dropping a final vowel
   * before it handles the second, because "panamera" and "panamerę" only agree
   * up to "panamer". Names ending in a digit ("RAV4", "XC60") are left alone —
   * nobody declines those, and trimming would make "xc6" match things it should
   * not.
   */
  const inflected = (key: string): string => {
    const escaped = key.replace(/(\D)(\d)/g, "$1[\\s-]?$2");
    if (/\d$/.test(key)) return `${escaped}\\b`;
    const stemmed = /[aeiouy]$/.test(escaped) ? escaped.slice(0, -1) : escaped;
    return `${stemmed}\\w{0,3}\\b`;
  };

  for (const car of vocab.cars) {
    for (const key of keysFor(car.model)) {
      const idx = t.search(new RegExp(`\\b${inflected(key)}`));
      if (idx >= 0) {
        found.push({ id: car.modelId, at: idx });
        matchedBrands.add(normalize(car.brand));
        precise = true;
        break;
      }
    }
  }

  /**
   * Brands, for the customer who writes "kaucja za BMW" without a model.
   *
   * Only when the brand has exactly ONE model in the fleet. Two Teslas and a
   * message saying "tesla" is genuinely ambiguous, and the honest response is
   * to let the caller ask which one rather than to pick the first row. Brands
   * already pinned down by a model match are skipped so "porównaj RAV4 i Volvo"
   * does not add the Toyota twice.
   */
  for (const car of vocab.cars) {
    const brand = normalize(car.brand);
    if (brand.length < 3 || matchedBrands.has(brand)) continue;
    const sameBrand = vocab.cars.filter((c) => normalize(c.brand) === brand);
    if (sameBrand.length !== 1) continue;
    // "Mercedes-Benz" is written "mercedes" by every customer who ever typed
    // it, so the first part of a hyphenated brand counts as the brand.
    const short = brand.split("-")[0];
    const idx = t.search(new RegExp(`\\b${brand}\\b|\\b${short}\\w{0,2}\\b`));
    if (idx >= 0) {
      found.push({ id: car.modelId, at: idx });
      matchedBrands.add(brand);
    }
  }

  const ids = dropRejectedCars(t, found);
  return {
    ids,
    precise,
    // The sentence rejected one car and named another. Read by `wantsSimilar`:
    // "zamiast X poproszę Y" is a replacement, not a request for suggestions.
    replaced: ids.length < new Set(found.map((f) => f.id)).size,
  };
}

/**
 * "Jednak nie BMW, tylko Volvo." — one car named to be rejected, one to replace
 * it.
 *
 * Without this the parser returns both, which is not a smaller mistake than it
 * sounds: two cars in one message is how the assistant recognises a comparison,
 * so a customer changing their mind was answered with a side-by-side table of
 * the car they had just refused and the car they wanted. The whole
 * conversation then continued about both.
 *
 * The construction is narrow on purpose, because the cost of over-reading it is
 * silently dropping a car the customer did want. Three conditions, all
 * required:
 *
 *   1. a negation immediately before the name — "nie BMW", "zamiast BMW",
 *      at most one word in between ("nie chcę BMW");
 *   2. a contrast elsewhere in the sentence — "tylko", "wolę", "but", "rather"
 *      — or a negation that is inherently a replacement ("zamiast",
 *      "instead of"). This is what separates "nie BMW, tylko Volvo" from
 *      "nie macie BMW ani Volvo?", where nothing is being rejected;
 *   3. something left afterwards. A message that rejects every car it names is
 *      not a replacement, and answering it with no car at all would be worse
 *      than answering it with the wrong one.
 */
function dropRejectedCars(
  t: string,
  found: { id: string; at: number }[],
): string[] {
  const ordered = [
    ...new Set(found.sort((a, b) => a.at - b.at).map((f) => f.id)),
  ];
  if (ordered.length < 2) return ordered;

  const REPLACEMENT = /\b(zamiast|instead\s+of)\b/;
  const NEGATION =
    /\b(nie|zamiast|not|instead\s+of|rather\s+than)\b(?:\s+\w+)?\s*$/;
  const CONTRAST =
    /\b(tylko|ale|lecz|wole|wolalbym|wolalabym|raczej|jednak|but|rather|prefer|prefers?|instead)\b/;

  const rejected = new Set<string>();
  const kept = new Set<string>();
  for (const f of found) {
    const before = t.slice(Math.max(0, f.at - 40), f.at);
    const neg = NEGATION.exec(before);
    if (neg && (REPLACEMENT.test(neg[0]) || CONTRAST.test(t)))
      rejected.add(f.id);
    else kept.add(f.id);
  }

  // A car named twice, once rejected and once not, is not rejected: "nie to
  // BMW, tamto BMW" is one car with a qualifier, not a refusal.
  for (const id of kept) rejected.delete(id);
  if (rejected.size === 0 || rejected.size === ordered.length) return ordered;

  return ordered.filter((id) => !rejected.has(id));
}

/**
 * What kind of rental this is, worked out rather than looked for.
 *
 * A company invoice makes it `business` whatever the length; failing that, a
 * month or more is `long_term`; a stated length or date range under that is
 * `short`. Silence stays silence — guessing "short" for a message that never
 * mentioned time would put a value in a slot the customer never filled.
 */
function inferRentalType(
  t: string,
  intent: Intent,
  days: number | null,
  from: string | null,
  to: string | null,
): "short" | "long_term" | "business" | null {
  if (intent === "B2B" || /\bfaktur\w*|\bnip\b|\binvoice\b|\bb2b\b/.test(t)) {
    return "business";
  }
  const span =
    days ??
    (from && to
      ? Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1
      : null);
  if (intent === "LONG_TERM") return "long_term";
  if (span === null) return null;
  return span >= 28 ? "long_term" : "short";
}

/**
 * Aliases per pickup point, keyed by slug.
 *
 * Only ever applied to slugs that actually exist in the database — an alias for
 * a location A&A does not operate resolves to nothing rather than to a
 * plausible-looking wrong answer.
 */
const LOCATION_ALIASES: Record<string, string[]> = {
  /*
   * Chopin. Polish declines place names, and the aliases are matched as plain
   * substrings — so every case a customer actually writes has to be here or the
   * airport simply is not found. "Odbiór na Okęciu" resolved to nothing at all,
   * because the only spelling listed was the nominative "okecie".
   *
   * "chopin" covers "chopina", "chopinie" and "Chopin Airport" on its own;
   * "okeci" would not work here, because these are substring tests rather than
   * the word-prefix matcher used for intent keywords.
   *
   * Modlin is NOT here and must not be: it is a different airport with its own
   * slug, its own fee and its own drive from the city.
   */
  airport: [
    "chopin",
    "okecie",
    "okeciu",
    "okecia",
    "waw",
    "warsaw airport",
    "warszawa airport",
    "warsaw chopin",
  ],
  "airport-gdansk": [
    "gdansk",
    "gdanska",
    "gdansku",
    "gdn",
    "rebiechowo",
    "walesy",
  ],
  "airport-modlin": ["modlin", "modlinie", "wmi"],
  office: ["biuro", "biurze", "biura", "office", "salon", "siedzib"],
  delivery: [
    "dostaw",
    "podstawien",
    "podstaw",
    "pod adres",
    "pod wskazany adres",
    "delivery",
    "deliver",
    "dowoz",
    "przywiez",
  ],
};

/**
 * Miejsce, które klient nazwał, a którego NIE obsługujemy.
 *
 * `matchLocation` chodzi po `vocab.locations`, czyli po miejscach istniejących
 * w bazie. Aliasy slugów, których w bazie nie ma, nie są przez nią w ogóle
 * czytane — więc zdanie „jednak odbiór na lotnisku Modlin" nie dopasowywało
 * NICZEGO i slot cichaczem zostawał na poprzedniej wartości. Klient prosił
 * o zmianę, dostawał odpowiedź o dostępności i wychodził w przekonaniu, że
 * Modlin jest ustalony.
 *
 * `LOCATION_ALIASES` ma wpis `airport-modlin` z komentarzem „to osobne
 * lotnisko z własnym slugiem i własną opłatą" — czyli ktoś to przewidział,
 * ale wiersza w `pickup_locations` nigdy nie utworzono. 31.08.2026 właściciel
 * potwierdził, że Modlina NIE obsługujemy: landing SEO został zdjęty (adresy
 * idą 308 na Chopina), a teksty przestały go wymieniać. Alias zostaje mimo to
 * — pytanie „a Modlin?" nadal pada, tyle że teraz przychodzi z zewnątrz, i ma
 * dostać uczciwą odpowiedź zamiast ciszy.
 *
 * Flota ma już dokładnie tę zasadę dla AUT: samochód nazwany po imieniu,
 * którego nie mamy, dostaje uczciwe „tego nie mamy" zamiast ciszy. Miejsca
 * dostają ją tutaj. Zwracamy slug, nie zdanie — treść należy do warstwy,
 * która mówi do klienta, a ta zna język rozmowy.
 */
export function unservedLocationSlug(
  normalized: string,
  vocab: Vocabulary,
): string | null {
  const served = new Set(vocab.locations.map((l) => l.slug));
  let best: { slug: string; len: number } | null = null;
  for (const [slug, aliases] of Object.entries(LOCATION_ALIASES)) {
    if (served.has(slug)) continue;
    for (const alias of aliases) {
      // Ten sam test co w `matchLocation` — podciąg na tekście znormalizowanym.
      if (!normalized.includes(alias)) continue;
      // Dłuższy alias jest bardziej konkretny; „modlin" bije „wmi".
      if (!best || alias.length > best.len) best = { slug, len: alias.length };
    }
  }
  return best?.slug ?? null;
}

/** "Somewhere with runways", without saying which one. */
const AIRPORT_WORDS = [
  "lotnisk",
  "airport",
  "terminal",
  "przylot",
  "samolot",
  "flight",
  "ladujemy",
  "laduje",
  "przylatuj",
  "wyladuj",
];

/**
 * Words that appear in a location's NAME but identify nothing.
 *
 * "Odbiór w biurze" and "Dostawa pod wskazany adres" both start with a word
 * longer than four letters, and the old first-match loop happily returned the
 * office for "czy odbiorę auto w Gdańsku". Every airport shares the head word
 * "lotnisko" too, so Gdańsk could never win against Chopin. Both bugs were the
 * same bug: matching on a word that does not distinguish anything.
 */
const UNDISTINCTIVE = new Set([
  "lotnisko",
  "airport",
  "odbior",
  "odbior.",
  "dostawa",
  "delivery",
  "adres",
  "address",
  "wskazany",
  "your",
  "pickup",
  "twoj",
  // Both the office and Chopin are in Warsaw, so the city name settles nothing.
  "warszawa",
  "warsaw",
]);

export type LocationMatch = {
  id: string | null;
  /** 0 = nothing found, 1 = named outright, 0.6 = inferred from context. */
  strength: number;
  /** Two places fit equally well — the caller should ask rather than pick. */
  ambiguous: boolean;
};

/**
 * Which pickup point the customer means.
 *
 * Scored across every active location instead of returning the first hit, so a
 * specific name always beats a generic one. When two locations tie, the answer
 * is "ask" rather than a coin toss.
 */
export function matchLocation(t: string, vocab: Vocabulary): LocationMatch {
  const scores = new Map<string, number>();
  const bump = (id: string, by: number) =>
    scores.set(id, (scores.get(id) ?? 0) + by);

  let namedAirport = false;

  for (const loc of vocab.locations) {
    for (const alias of LOCATION_ALIASES[loc.slug] ?? []) {
      if (t.includes(alias)) {
        // Longer aliases are more specific; "warsaw airport" outranks "waw".
        bump(loc.id, 4 + alias.length / 20);
        if (loc.slug.startsWith("airport")) namedAirport = true;
      }
    }
    // Admin-added locations we know nothing about still work, via their name.
    for (const source of [loc.name, loc.nameEn ?? ""]) {
      for (const word of normalize(source).split(" ")) {
        if (word.length >= 4 && !UNDISTINCTIVE.has(word) && t.includes(word)) {
          bump(loc.id, 3);
        }
      }
    }
  }

  /**
   * "Na lotnisko" with no city named.
   *
   * The airports are the only candidates from here on — a message about landing
   * is not about the office, whatever else it happens to mention. When exactly
   * one airport is on the list it wins outright; when several are and none was
   * named, the honest answer is that we do not know which.
   */
  const airportish = vocab.locations.filter((l) =>
    l.slug.startsWith("airport"),
  );
  /*
   * A named airport beats the delivery verb that brought the car to it.
   *
   * "Czy dowozicie auto na Okęcie?" resolved to NO location at all: "dowoz" is
   * an alias of `delivery` and "okecie" of `airport`, the two scored within
   * 0.05 of each other, and the tie-break below reads a near-tie as "we do not
   * know which" and returns null. With no location resolved there was no
   * airport evidence for the intent either, so the question came back as "nie
   * mam pewnej informacji" — about a service we sell and price.
   *
   * The two are not rival readings. "Dowozicie" is a verb about getting the car
   * somewhere; "Okęcie" is the somewhere. Airport delivery is exactly the
   * service being asked about, and its pickup point is the airport. Same shape
   * as the rule below, which already clears non-airport places when a sentence
   * mentions airports generically.
   */
  if (namedAirport) {
    const delivery = vocab.locations.find((l) => l.slug === "delivery");
    if (delivery) scores.delete(delivery.id);
  }
  /**
   * Lotnisko NAZWANE, którego nie obsługujemy, nie jest „lotniskiem bez
   * podanego miasta".
   *
   * Bez tego „odbiór na lotnisku Modlin" wchodziło w gałąź niżej jako zdanie
   * o lotnisku w ogóle i dostawało Chopina: +2 dla kanonicznego, +1,5 dla
   * Gdańska, a próg remisu to `< 0.5` — czyli różnica 0,5 przechodziła
   * DOKŁADNIE o włos i slot cicho wskakiwał na inne lotnisko, z własną
   * dopłatą 200 zł, którego klient nigdy nie wybrał.
   *
   * To ta sama szkoda co usterka, którą naprawił etap 44A, tylko odwrotną
   * stroną: tam slot zostawał na starej wartości, tu wskakuje na cudzą.
   * Uczciwa odpowiedź brzmi „nie wiem, które" — i wtedy pyta, zamiast zgadywać.
   */
  const unservedAirport =
    unservedLocationSlug(t, vocab)?.startsWith("airport") ?? false;

  if (
    !namedAirport &&
    !unservedAirport &&
    AIRPORT_WORDS.some((w) => t.includes(w))
  ) {
    for (const l of vocab.locations) {
      if (!l.slug.startsWith("airport")) scores.delete(l.id);
    }
    if (airportish.length === 1) {
      bump(airportish[0].id, 4);
    } else {
      // "airport" is the canonical one (Chopin); prefer it, but only just, so a
      // later mention of another city still overturns the guess.
      const canonical = airportish.find((l) => l.slug === "airport");
      if (canonical) bump(canonical.id, 2);
      for (const l of airportish) if (l.id !== canonical?.id) bump(l.id, 1.5);
    }
  }

  let bestId: string | null = null;
  let best = 0;
  let runnerUp = 0;
  for (const [id, value] of scores) {
    if (value > best) {
      runnerUp = best;
      best = value;
      bestId = id;
    } else if (value > runnerUp) {
      runnerUp = value;
    }
  }

  if (best === 0) return { id: null, strength: 0, ambiguous: false };
  const ambiguous = best - runnerUp < 0.5;
  return {
    id: ambiguous ? null : bestId,
    strength: ambiguous ? 0 : Math.min(1, best / 4),
    ambiguous,
  };
}

/* ── The parser ───────────────────────────────────────────────────────────── */

export function parse(
  input: string,
  vocab: Vocabulary,
  today: Date,
  fallbackLocale: Locale = "pl",
): Parsed {
  const normalized = normalize(input);
  const locale = detectLocale(input, fallbackLocale);

  /*
    Kilometry z pytania: „przejade 1000 km", „dodatkowe 100 km", „1 000 km".

    Czytane TUTAJ, przed punktacja intencji, a nie razem z reszta encji na
    koncu — bo regula `MILEAGE_TOPIC` nizej musi je widziec: „ile doplace za
    1000 km" jest pytaniem o nadprzebieg wlasnie dlatego, ze niesie liczbe
    kilometrow, a nie dlatego, ze pada w nim jakiekolwiek slowo kluczowe.

    Wyraznie WYKLUCZONE sa liczby opisujace limit („limit 300 km"): pytajacy
    cytuje wtedy nasza wlasna liczbe, a nie swoj przejazd — policzenie z niej
    doplaty dawaloby zawsze zero i wygladalo jak odpowiedz.

    Spacja i twarda spacja jako separator tysiecy, bo tak pisze polski klient
    i tak pisze ta strona („3 000 km").
  */
  const kmMatch = normalized.match(
    /(?<!limit\s)(?<!limicie\s)\b(\d{1,3}(?:[ \u00a0]\d{3}|\d{0,4})?)\s*(?:km|kilometr\w*|kilometre?s?)\b/,
  );
  const km = kmMatch
    ? Number(kmMatch[1].replace(/[ \u00a0]/g, "")) || null
    : null;

  // Score every intent, take the best.
  const scores = new Map<Intent, number>();
  for (const p of PATTERNS) {
    for (const kw of p.any) {
      if (hits(normalized, kw)) {
        scores.set(p.intent, (scores.get(p.intent) ?? 0) + p.weight);
      }
    }
  }
  /**
   * "Kaucja" names what is being asked about; "ile kosztuje" only says that a
   * number is wanted.
   *
   * A pattern's weight is added once per MATCHING KEYWORD, not once per
   * pattern — so "Ile kosztuje kaucja?" handed `GET_PRICE` two hits ("ile
   * kosztuj" and "koszt") for ten points against `GET_DEPOSIT`'s single six,
   * and a plain question about the deposit came back as "O który samochód
   * chodzi?" on the price path. The customer then never got a deposit answer at
   * all, because the follow-up stayed in the pricing conversation.
   *
   * Fixed here rather than by raising `GET_DEPOSIT`'s weight: the weight is not
   * what is wrong, the arithmetic of accumulation is, and any number chosen
   * would be beaten again by a sentence that happens to carry a third price
   * word. This states the rule instead — a deposit word outranks the generic
   * price question, whatever the tally says — and leaves every other intent
   * untouched. `GET_DEPOSIT` still loses to the refusals and to `EMERGENCY`,
   * which sit far above both.
   */
  if (
    /\bkaucj\w*|\bdeposit\w*|\bzastaw\w*|\bwplata zwrotna\b/.test(normalized)
  ) {
    const price = scores.get("GET_PRICE") ?? 0;
    const deposit = scores.get("GET_DEPOSIT") ?? 0;
    scores.set("GET_DEPOSIT", Math.max(deposit, price + 1));
  }

  // A question-shaped sentence with no stronger signal is an FAQ lookup.
  if (FAQ_MARKERS_WEAK.some((m) => hits(normalized, m))) {
    scores.set("FAQ", (scores.get("FAQ") ?? 0) + 3);
  }
  if (FAQ_MARKERS_STRONG.some((m) => hits(normalized, m))) {
    scores.set("FAQ", (scores.get("FAQ") ?? 0) + 5);
  }

  const dates = parseDates(input, today);
  const carMatch = extractCars(normalized, vocab);
  const cars = carMatch.ids;
  const place = matchLocation(normalized, vocab);
  const seats = extractSeats(normalized);

  /*
   * Two facts about the driver, hoisted here because they decide the INTENT as
   * well as filling a slot.
   *
   * "Prawo jazdy mam od roku, co mogę wynająć?" contains none of the phrases in
   * `DRIVER_AGE_TOPIC` — it is a statement, not a question about a threshold —
   * so it fell through to the FAQ matcher and came back as "nie mam pewnej
   * informacji". Recognising the shape rather than adding another literal
   * string is what makes the next phrasing work too.
   */
  const statedAge = extractStatedAge(normalized);
  const asksLicenceTenure = LICENCE_TENURE_QUESTION.test(normalized);
  // Two axes, read independently and both kept. "Luksusowy SUV" fills both;
  // each on its own fills one; neither can erase the other.
  const bodyType = bodyTypeOf(normalized);
  const segment = segmentOf(normalized);
  const driverClass = driverClassOf(normalized);
  // One reading of the money in the sentence: both ends, the unit and the
  // currency together, so they cannot come to disagree downstream.
  const budget = budgetOf(normalized, vocab.plnPerEur);
  // Hoisted out of the entities object below so the intent rules can see them:
  // "a diesel SUV" is a car search precisely because it names a fuel and a body.
  const gearboxWord: "automatic" | "manual" | null =
    /\bautomat\w*|\bautomac\w*|\bautomatic\b/.test(normalized)
      ? "automatic"
      : /\bmanual\w*|\breczn\w*|\bmanualn\w*/.test(normalized)
        ? "manual"
        : null;
  const wantsCheapestWord =
    /\bnajtan\w*|\btani\w*|\bbudzet\w*|\bcheap\w*|\blowest price\b|\beconom\w*/.test(
      normalized,
    );
  const fuelWord: "petrol" | "diesel" | "hybrid" | "electric" | null =
    // "Na prąd" is how half of Polish customers say "electric", and it used to
    // be matched only by the old segment list. When `electric` moved onto the
    // fuel axis the phrase had nowhere to land, and "Auto na prąd poproszę"
    // stopped resolving to anything at all.
    /\belektry\w*|\belectric\b|\bna prad\b/.test(normalized)
      ? "electric"
      : /\bhybryd\w*|\bhybrid\b/.test(normalized)
        ? "hybrid"
        : /\bdiesel\w*|\bdiesl\w*|\bropa\b|\bropie\b/.test(normalized)
          ? "diesel"
          : /\bbenzyn\w*|\bpetrol\b|\bgasoline\b/.test(normalized)
            ? "petrol"
            : null;

  // Naming a car and a period but no verb is still an availability question —
  // "Volvo na 5 dni" is a sentence a customer really types, and a length counts
  // as a period just as much as a date range does.
  if (cars.length > 0 && (dates.from || dates.days)) {
    scores.set(
      "CHECK_AVAILABILITY",
      (scores.get("CHECK_AVAILABILITY") ?? 0) + 5,
    );
  }
  // A car and nothing else: the customer is shopping for that car.
  if (cars.length > 0 && scores.size === 0) {
    scores.set("FIND_CAR", 4);
  }

  /**
   * A car DESCRIBED rather than named, and nothing else in the sentence.
   *
   * "A diesel SUV", "I want an electric car", "coś elektrycznego dla pięciu
   * osób" — a specification with no verb and no question word. Every slot in it
   * resolved correctly; what was missing was an intent, so the sentence scored
   * nothing, came back `UNKNOWN`, and a fully-understood request was answered
   * with "nie rozumiem". The English side suffered most, because Polish
   * "szukam"/"potrzebuję" carry the intent in a word that English drops.
   *
   * Same weight and same reasoning as the rule above it: naming the properties
   * of a car you want is shopping for a car.
   */
  const describesCar =
    bodyType !== null ||
    segment !== null ||
    driverClass !== null ||
    budget !== null ||
    seats !== null ||
    gearboxWord !== null ||
    fuelWord !== null ||
    // "Coś taniego, byle jeździło" describes a car by the only property that
    // visitor cares about. It stopped being a segment when `tani` moved off
    // the shelf axis, so it has to count as a description here or the sentence
    // resolves to nothing.
    wantsCheapestWord;
  if (describesCar && scores.size === 0) {
    scores.set("FIND_CAR", 4);
  }

  /**
   * A resolved pickup point is evidence about the intent, not just a slot.
   *
   * "Czy odbiorę auto w Gdańsku?" was landing in FAQ, because "czy" and "odbior"
   * are question-shaped words and nothing pushed back. Naming an airport is a
   * strong signal that the question is about airport pickup, so it gets a vote
   * — enough to beat the generic FAQ nudge, not enough to override an explicit
   * price or deposit question.
   */
  const isAirport =
    place.id !== null &&
    (vocab.locations
      .find((l) => l.id === place.id)
      ?.slug.startsWith("airport") ??
      false);
  if (isAirport) {
    scores.set("AIRPORT", (scores.get("AIRPORT") ?? 0) + 4);
  }
  // A bare "Okęcie" or "dostawa pod adres" is a request, not a mystery.
  if (place.id && scores.size === 0) {
    scores.set(isAirport ? "AIRPORT" : "FIND_CAR", 4);
  }
  /*
   * The customer is talking about WHERE they collect the car, and did not name
   * a place we recognise: "jednak odbiór w centrum", "skąd odbieram auto".
   *
   * Only when nothing resolved. A message that names Okęcie has already scored
   * AIRPORT and a message that names the office has already scored a location,
   * and this must not outrank either — the point is to catch the case that
   * otherwise falls through to the FAQ matcher and comes back as "nie mam
   * pewnej informacji" about our own pickup points.
   */
  if (
    place.id === null &&
    !AIRPORT_WORDS.some((w) => normalized.includes(w)) &&
    /\bodbior\w*|\bodebra\w*|\bodbierz\w*|\bodbieram\b|\bpodstawien\w*|\bpick[- ]?up\b|\bcollect\w*/.test(
      normalized,
    )
  ) {
    scores.set("PICKUP_POINT", (scores.get("PICKUP_POINT") ?? 0) + 5);
  }
  /*
   * A driver who states their age or their licence tenure is asking whether
   * they qualify, whatever the rest of the sentence looks like. Weighted level
   * with the keyword rule above it, so "mam 23 lata, czy mogę wynająć
   * Panamerę?" is a requirements question and not a search for a Panamera.
   */
  if (statedAge !== null || asksLicenceTenure) {
    scores.set("DRIVER_AGE", (scores.get("DRIVER_AGE") ?? 0) + 9);
  }
  /**
   * Two cars named in one sentence is a comparison even without "porównaj".
   *
   * Weighted heavily because naming two of our cars together has essentially
   * one meaning. It has to outrank the FIND_CAR nudge below, or "które auto
   * jest większe, Trafic czy GLE?" gets read as a request for a big car — the
   * word "większe" is doing that, and it is the least informative word in the
   * sentence.
   */
  if (cars.length >= 2) {
    scores.set("COMPARE_CARS", (scores.get("COMPARE_CARS") ?? 0) + 6);
  }
  /**
   * A segment or a seat count means somebody is choosing a car.
   *
   * This used to apply only when nothing else scored, which left "czy macie
   * busa dla dziewięciu osób" classified as an FAQ lookup — the "czy" beat a
   * sentence that names a vehicle class AND a headcount. Describing the car you
   * want is a stronger signal than phrasing it as a question, so it now counts
   * even when other intents scored.
   */
  // "automacie" is the locative of "automat" and Polish swaps the t for a c in
  // it, so an "automat"-prefixed pattern never sees the most natural way to ask:
  // "szukam auta NA AUTOMACIE".
  const saidGearbox =
    /\bautomat\w*|\bautomac\w*|\bautomatic\b|\bmanual\w*|\breczn\w*/.test(
      normalized,
    );
  if (segment || seats !== null || saidGearbox) {
    scores.set("FIND_CAR", (scores.get("FIND_CAR") ?? 0) + 4);
  }
  // A date and nothing else: "dzisiaj", "anything free today?"
  if ((dates.from || dates.days) && scores.size === 0) {
    scores.set("CHECK_AVAILABILITY", 4);
  }

  /**
   * A clock time inside a "can I / how can I" question is about our hours.
   *
   * "Czy mogę zadzwonić o 23:30?" scores CONTACT_HUMAN on the word "zadzwonić",
   * and answering it with a phone number instead of a time is answering a
   * different question. "Jest 00:30, jak mogę się skontaktować?" scores nothing
   * at all and used to end in "nie rozumiem".
   *
   * Both halves are required. The clock alone would catch "zadzwońcie do mnie o
   * 15:00", which is a request for a callback and not a question about
   * anything; the question marker alone would catch half the conversation.
   */
  // Read off the RAW text: `normalize` drops the colon, so "23:30" reaches the
  // normalised string as "23 30" and no clock pattern can see it.
  const saysClock =
    /\b([01]?\d|2[0-4])[:.][0-5]\d\b/.test(input.toLowerCase()) ||
    /\bo \d{1,2} (w nocy|nad ranem|rano|wieczorem|po poludniu)\b/.test(
      normalized,
    ) ||
    // "at 2 am", "at 11 pm" — the English half of the same sentence.
    /\b(at )?\d{1,2}\s?(am|pm)\b/.test(normalized);
  const asksPossibility =
    /\bczy (moge|mozna|jest|bedzie)\b|\bjak (moge|mozna|sie)\b|\bdo ktorej\b|\bcan i\b|\bis it possible\b|\bhow (can|do) i\b|\bwhat time\b|\bare you\b/.test(
      normalized,
    );
  if (saysClock && asksPossibility) {
    scores.set("OPENING_HOURS", (scores.get("OPENING_HOURS") ?? 0) + 8);
  }

  /**
   * "Is the RAV4 free?" — a named car and a bare "free".
   *
   * `free` cannot be an availability keyword on its own: "is delivery free?"
   * and "free of charge" are about money, and the keyword list says so. But
   * with one of OUR cars named in the same sentence and no money word beside
   * it, there is nothing else it can mean — and without this the question came
   * back as a generic search, or as an FAQ entry about something adjacent.
   */
  const asksFreeAboutCar =
    cars.length > 0 &&
    /\bfree\b/.test(normalized) &&
    !/\bfree of charge\b|\bfor free\b|\bfree delivery\b|\bfree cancel/.test(
      normalized,
    );
  if (asksFreeAboutCar) {
    scores.set(
      "CHECK_AVAILABILITY",
      (scores.get("CHECK_AVAILABILITY") ?? 0) + 6,
    );
  }

  /**
   * „Nadprzebieg" nazywa TEMAT; „ile kosztuje" mówi tylko, że chodzi o liczbę.
   *
   * Dokładnie ten sam problem co przy kaucji dwa akapity wyżej i rozwiązany
   * tym samym sposobem — bo to nie waga jest zła, tylko arytmetyka sumowania.
   * Zmierzone 01.09.2026 na trzech pytaniach wprost z zamówienia:
   *
   *   „Ile kosztuje przekroczenie kilometrów w BMW 740d?"  → GET_PRICE
   *   „Ile zapłacę za dodatkowe 100 km w RAV4?"            → GET_PRICE
   *   „Mam BMW na 3 dni i przejadę 1000 km, ile dopłacę?"  → CHECK_AVAILABILITY
   *
   * Każde z nich niosło po dwa–trzy trafienia w słowa cenowe albo terminowe
   * („ile kosztuj", „koszt", „na 3 dni") i przegrywało z jednym trafieniem
   * w „kilometr". Klient dostawał cenę doby albo pytanie o termin zamiast
   * odpowiedzi o stawkę za kilometr.
   *
   * DWA SYGNAŁY, nie jeden. Pierwszy to nazwa tematu wprost. Drugi jest
   * KSZTAŁTEM zdania, nie kolejnym literałem: liczba kilometrów plus czasownik
   * płacenia to pytanie „ile zapłacę za tyle a tyle kilometrów", niezależnie od
   * tego, jak zostanie sformułowane następnym razem. Sam czasownik płacenia bez
   * liczby kilometrów NIE wystarcza — „ile zapłacę za wynajem" zostaje pytaniem
   * o cenę.
   *
   * Bije GET_PRICE i CHECK_AVAILABILITY, bo tylko z nimi przegrywało. Odmowy
   * i EMERGENCY stoją wyżej i zostają nietknięte.
   *
   * STOI NA KOŃCU, tuż przed wyborem zwycięzcy, i to jest część rozwiązania,
   * a nie kwestia porządku w pliku. Postawiona wyżej — obok reguły kaucji —
   * przegrywała ponownie, bo „auto + okres" dokłada CHECK_AVAILABILITY pięć
   * punktów DOPIERO po rozpoznaniu encji: zdanie „Mam BMW na 3 dni i przejadę
   * 1000 km" jest jednocześnie autem z terminem i pytaniem o nadprzebieg,
   * a wygrać ma to drugie, bo o to klient pyta wprost.
   */
  const nazwaTematu =
    /\bnadprzebieg\w*|\bprzekrocz\w*\s+(?:\w+\s+)?(?:limit\w*|kilometr\w*|km)\b|\bponad\s+limit\w*|\bpowyzej\s+limit\w*|\bdodatkow\w*\s+(?:kilometr\w*|km)\b|\bextra\s+mileage\b|\bexcess\s+mileage\b|\b(?:over|above)\s+the\s+(?:limit|mileage)\b|\badditional\s+(?:kilometre|kilometer)\w*\b/.test(
      normalized,
    );
  const ksztaltPytaniaOKoszt =
    km !== null &&
    /\bdoplac\w*|\bdoplat\w*|\bzaplac\w*|\bile\s+kosztuj\w*|\bhow\s+much\b|\bcharge\w*/.test(
      normalized,
    );
  if (nazwaTematu || ksztaltPytaniaOKoszt) {
    const konkurenci = Math.max(
      scores.get("GET_PRICE") ?? 0,
      scores.get("CHECK_AVAILABILITY") ?? 0,
    );
    const przebieg = scores.get("GET_MILEAGE_LIMIT") ?? 0;
    scores.set("GET_MILEAGE_LIMIT", Math.max(przebieg, konkurenci + 1));
  }

  /**
   * „Anulowanie" nazywa TEMAT; „za 20 godzin" mówi tylko, kiedy.
   *
   * Trzecia reguła tego kształtu w tym pliku — po kaucji i po nadprzebiegu —
   * i z tego samego powodu: waga jest w porządku, psuje się arytmetyka
   * sumowania. Zmierzone 01.09.2026 na pytaniach wprost z zamówienia:
   *
   *   „Odbieram samochód za 20 godzin, ile zapłacę za anulowanie?"
   *   „Nie pojawiłem się po samochód, co teraz?"
   *
   * Obie niosły określenie czasu albo słowo „samochód", wygrywała więc ścieżka
   * rezerwowania i asystent odpowiadał, że najwcześniejszy odbiór jest za trzy
   * godziny — na pytanie o opłatę za anulowanie. Słowo nazywające temat bije
   * tu określenie czasu, bo to ono mówi, o CO klient pyta.
   *
   * STOI NA KOŃCU, tuż przed wyborem zwycięzcy, dokładnie jak reguła
   * nadprzebiegu: bonusy od rozpoznanych encji („auto + termin") dochodzą
   * dopiero po parsowaniu i regułę postawioną wyżej po prostu przykrywają.
   *
   * NIE rusza odmów: `REFUSAL` i `EMERGENCY` stoją wyżej i nie są tu wymienione.
   * „Anuluj rezerwację klienta X" nadal trafia tam, gdzie trafiało.
   */
  const tematAnulowania =
    /\banulow\w*|\banuluj\w*|\bodwolac\s+rezerwacj\w*|\brezygnacj\w*|\bzrezygnowac\b|\bno[\s-]?show\b|\bnie\s+(?:pojawi\w*|zjawi\w*|odebra\w*|stawi\w*)\b|\bcancel\w*|\bdid\s+not\s+(?:show|collect)\b|\bno\s+longer\s+need\b/.test(
      normalized,
    );
  if (tematAnulowania) {
    const konkurenci = Math.max(
      scores.get("GET_PRICE") ?? 0,
      scores.get("CHECK_AVAILABILITY") ?? 0,
      scores.get("START_BOOKING") ?? 0,
      scores.get("FIND_CAR") ?? 0,
      scores.get("FAQ") ?? 0,
    );
    const zarzadzanie = scores.get("MANAGE_BOOKING") ?? 0;
    scores.set("MANAGE_BOOKING", Math.max(zarzadzanie, konkurenci + 1));
  }

  let intent: Intent = "UNKNOWN";
  let best = 0;
  let runnerUp = 0;
  for (const [key, value] of scores) {
    if (value > best) {
      runnerUp = best;
      best = value;
      intent = key;
    } else if (value > runnerUp) {
      runnerUp = value;
    }
  }

  /**
   * Confidence.
   *
   * `confident` needs a clear winner: a decent score AND a margin over the
   * runner-up. Two intents tied at the top is exactly the case where a bot
   * should ask instead of picking — "ile kosztuje kaucja" is not a price
   * question and not quite a deposit question until somebody says which.
   */
  const confidence: Confidence =
    best === 0
      ? "none"
      : best >= 5 && best - runnerUp >= 2
        ? "confident"
        : "unsure";

  /**
   * The numeric score, and why it is built this way.
   *
   * Two thirds of it is about the intent, because that is what routing depends
   * on: a clear winner with daylight behind it earns most of the score, a tie
   * earns very little. The rest rewards the sentence resolving into real slots
   * — a message where the car, the dates and the pickup point all landed is one
   * the rules genuinely understood, not one they merely bucketed.
   *
   * Ambiguity subtracts. A location that tied with another, or a brand that
   * matched without a model, is exactly the case worth escalating, so it must
   * not be allowed to look confident.
   */
  const dateStrength =
    dates.from && dates.to ? 1 : dates.from || dates.days ? 0.6 : 0;
  const slotsFilled = [
    cars.length > 0,
    segment !== null,
    seats !== null,
    dates.from !== null || dates.days !== null,
    place.id !== null,
  ].filter(Boolean).length;
  const conflicts = (place.ambiguous ? 1 : 0) + (cars.length > 2 ? 1 : 0);

  const intentPart =
    best === 0
      ? 0
      : Math.min(0.45, best / 12) +
        Math.min(0.2, Math.max(0, best - runnerUp) / 10);
  const slotPart =
    Math.min(0.2, slotsFilled * 0.05) +
    (carMatch.precise ? 0.05 : 0) +
    place.strength * 0.05 +
    dateStrength * 0.05;
  const confidenceScore = Math.max(
    0,
    Math.min(1, intentPart + slotPart - conflicts * 0.15),
  );

  const signals: ConfidenceSignals = {
    intentScore: best,
    intentMargin: best - runnerUp,
    slotsFilled,
    carPrecise: carMatch.precise,
    locationStrength: place.strength,
    dateStrength,
    conflicts,
  };

  return {
    intent,
    confidence,
    confidenceScore,
    signals,
    locale,
    normalized,
    entities: {
      carModelIds: cars,
      bodyType: bodyType as ParsedEntities["bodyType"],
      segment,
      driverClass,
      budgetGrosze: budget?.maxGrosze ?? null,
      budgetMinGrosze: budget?.minGrosze ?? null,
      budgetKind: budget?.kind ?? null,
      budgetCurrency: budget?.currency ?? null,
      seats,
      dateFrom: dates.from,
      dateTo: dates.to,
      days: dates.days,
      km,
      locationId: place.id,
      rentalType: inferRentalType(
        normalized,
        intent,
        dates.days,
        dates.from,
        dates.to,
      ),
      gearbox: gearboxWord,
      fuel: fuelWord,
      wantsCheapest: wantsCheapestWord,
      /*
       * Rejection of a price, not a standing preference. Requires a comparative
       * ("tańszego", "cheaper") or an explicit complaint ("za drogie", "too
       * expensive") — a bare "tanie auto" is `wantsCheapest` and nothing more.
       */
      wantsCheaper:
        /\btansz\w*|\bza drog\w*|\bzbyt drog\w*|\bcheaper\b|\bless expensive\b|\btoo expensive\b|\bout of my budget\b/.test(
          normalized,
        ),
      /*
       * The mirror of `wantsCheaper`. The leading `\b` is what keeps the
       * superlative out: "najdroższy" normalises to "najdrozszy", which has no
       * word boundary before "drozsz", so it falls through to `superlative`
       * below — a different question with a different answer.
       */
      wantsPricier:
        /\bdrozsz\w*|\bbardziej ekskluzyw\w*|\bwyzsza polka\b|\bmore expensive\b|\bpricier\b|\bstep up\b|\bsomething nicer\b/.test(
          normalized,
        ),
      /*
       * A gearbox QUESTION — an interrogative AND a gearbox word.
       *
       * Both halves are load-bearing. Without the interrogative, "szukam auta z
       * automatyczną skrzynią" reads as a question and the gearbox stops
       * filtering, so the manual Trafic reappears in a search for automatics.
       * Without the gearbox word, every "czy macie…" would qualify.
       */
      asksGearbox:
        /\b(czy|jaka|jaki|jakie|jaka|does|do|is|has|have|what|which)\b/.test(
          normalized,
        ) &&
        /\bskrzyni\w*|\bbiegow\b|\bbiegi\b|\bgearbox\b|\btransmission\b|\bautomat\w*|\bmanual\w*|\breczn\w*/.test(
          normalized,
        ),
      familyHint: FAMILY_WORDS.test(normalized),
      /*
       * "Zamiast" is two different requests, and the difference is whether a
       * replacement was named.
       *
       *   "zamiast RAV4 coś innego?"        → suggest something similar
       *   "zamiast RAV4 poproszę Tiguana"   → give me the Tiguan
       *
       * Reading the second as the first is not a near miss: the handler for
       * suggestions unpins the car and answers with alternatives to the very
       * car the customer just asked for. `replaced` is the parser's own record
       * that a rejection had an answer in the same sentence.
       */
      wantsSimilar:
        !carMatch.replaced &&
        /\bpodobn\w*|\balternatyw\w*|\bzamiast\b|\bw zamian\b|\bcos innego\b|\binnego\b|\bsimilar\b|\balternative\w*|\banything else\b|\bsomething else\b|\binstead\b/.test(
          normalized,
        ),
      /*
       * A question that ranks named cars against each other, rather than
       * asking for a different one. Two shapes:
       *
       *   "który/which …"  — picks one of them
       *   "różnica w …"    — asks for the gap between them
       *
       * The attribute has to be present too. "Który?" alone is a choice
       * between things, not a comparison of an attribute, and is answered
       * elsewhere.
       */
      statedAge,
      asksLicenceTenure,
      extraTopic:
        /\bdodatkow\w*\s+kierowc\w*|\bdrugi\s+kierowc\w*|\bextra\s+driver\b|\badditional\s+driver\b|\bsecond\s+driver\b/.test(
          normalized,
        )
          ? "extra_driver"
          : /\bfotelik\w*|\bchild\s+seat\b|\bbaby\s+seat\b|\bbooster\b/.test(
                normalized,
              )
            ? "child_seat"
            : /\bbez\s+kaucji\b|\bno[- ]deposit\b|\bwithout\s+(?:a\s+)?deposit\b/.test(
                  normalized,
                )
              ? "no_deposit"
              : /\bpakiet\w*\s+ochronn\w*|\bprotection\s+package\b|\bubezpieczenie\s+dodatkow\w*/.test(
                    normalized,
                  )
                ? "protection_package"
                : // Dostawa TYLKO wtedy, gdy pada słowo o cenie — samo „dostawa
                  // pod adres" to prośba o miejsce odbioru, nie o cennik, i ma
                  // trafić do gałęzi lokalizacji tak jak dotąd.
                  //
                  // I NIGDY, gdy w zdaniu pada lotnisko. „Ile kosztuje dostawa na
                  // Lotnisko Chopina?" to pytanie o dopłatę lotniskową, choć ma
                  // w środku słowo „dostawa" — klient nazwał miejsce, więc to
                  // miejsce jest odpowiedzią, a nie ogólny cennik podstawienia.
                  !/\blotnisk\w*|\bokeci\w*|\bchopin\w*|\bmodlin\w*|\bgdansk\w*|\bairport\b/.test(
                      normalized,
                    ) &&
                    /\b(?:dostaw\w*|podstawien\w*|pod adres|pod wskazany adres|delivery|deliver)\b/.test(
                      normalized,
                    ) &&
                    /\bile\s+kosztuj\w*|\bjaka\s+(?:jest\s+)?(?:cena|oplata|doplata)|\bkoszt\w*|\bcena\b|\bhow much\b|\bcost\b|\bprice\b|\bfee\b/.test(
                      normalized,
                    )
                  ? "delivery"
                  : null,
      comparisonAspect: (() => {
        const asksRanking =
          /\bktor\w*\b|\bwhich\b|\broznic\w*|\bdifference\b|\bwiecej\b|\bmniej\b|\bmore\b|\bless\b|\bfewer\b/.test(
            normalized,
          );
        if (!asksRanking) return null;
        if (/\bkaucj\w*|\bdeposit\b/.test(normalized)) return "deposit";
        if (
          /\bmiejsc\w*|\bosob\w*|\bpasazer\w*|\bseats?\b|\bpassengers?\b/.test(
            normalized,
          )
        )
          return "seats";
        if (/\bkilometr\w*|\blimit\w*|\bmileage\b|\bkm\b/.test(normalized))
          return "mileage";
        if (
          /\btansz\w*|\bdrozsz\w*|\bcen\w*|\bkosztuj\w*|\bcheaper\b|\bpricier\b|\bexpensive\b|\bcosts?\b|\bprice\b/.test(
            normalized,
          )
        )
          return "price";
        return null;
      })(),
      superlative:
        /\bnajdrozsz\w*|\bnajlepiej wyposaz\w*|\bmost expensive\b|\bpriciest\b|\bdearest\b|\btop of the range\b/.test(
          normalized,
        )
          ? "priciest"
          : /\bnajtansz\w*|\bnajtaniej\b|\bcheapest\b|\bleast expensive\b/.test(
                normalized,
              )
            ? "cheapest"
            : null,
    },
  };
}

/** Coarse bucket for the unanswered-questions list. */
export function categorise(p: Parsed): string {
  switch (p.intent) {
    case "GET_PRICE":
      return "cena";
    case "CHECK_AVAILABILITY":
      return "dostepnosc";
    case "GET_DEPOSIT":
      return "kaucja";
    case "GET_MILEAGE_LIMIT":
      return "limit km";
    case "OPENING_HOURS":
      return "godziny";
    case "FIND_CAR":
    case "COMPARE_CARS":
    case "BROWSE_FLEET":
      return "dobor auta";
    case "HOW_TO_RENT":
      return "jak wynajac";
    case "MANAGE_BOOKING":
      return "rezerwacja klienta";
    case "AIRPORT":
      return "lotnisko";
    case "B2B":
      return "firmy";
    case "LONG_TERM":
      return "dlugoterminowy";
    case "FAQ":
      return "faq";
    default:
      return "inne";
  }
}
