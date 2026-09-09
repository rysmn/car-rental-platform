import { normalize } from "./nlu";
import type { Parsed, Vocabulary } from "./nlu";

/**
 * What the customer was asking for — read from the sentence, whether or not
 * A&A owns such a car.
 *
 * Why this is a separate module from the NLU. `lib/chat/nlu` matches against a
 * vocabulary built from the LIVE FLEET: that is the right rule for answering,
 * because the assistant must never offer a car that does not exist. It is
 * exactly the wrong rule for demand, because a fleet-only vocabulary is
 * structurally incapable of seeing the one thing this report is for — the car
 * A&A does not have. "Macie Porsche Cayenne?" resolves, in the parser, to no
 * car at all, which is indistinguishable from "macie coś?".
 *
 * So this reads the sentence a second time with a different question: not
 * "which of our cars is this", but "what is being described". It never feeds an
 * answer. Nothing here can put a car in front of a customer or price one — its
 * whole output is a row in a table an administrator reads.
 */

export type DemandKind = "model" | "brand" | "segment";

export type Demand = {
  kind: DemandKind;
  brand: string | null;
  model: string | null;
  segment: string | null;
  seats: number | null;
  gearbox: string | null;
  fuel: string | null;
  /** Display line: "Porsche Cayenne", "Mercedes", "PREMIUM SUV · 5 osób". */
  label: string;
  /** Grouping and dedup key. */
  normalized: string;
};

/* ── Brands ──────────────────────────────────────────────────────────────── */

/**
 * Marques a Polish customer might name, fleet or no fleet.
 *
 * A list rather than a clever heuristic: "any capitalised word could be a car
 * brand" turns "Macie coś w Warszawie" into demand for a Warszawa, and a demand
 * report that invents cars is worse than one that misses a few. The cost of a
 * list is that a brand nobody thought of is missed once — and it shows up in
 * `chat_unanswered` anyway, where somebody can read it and add a line here.
 *
 * Written as the customer types them, lowercase and without diacritics, since
 * that is what `normalize()` produces. Multi-word marques carry their spoken
 * short form too, because nobody types "Mercedes-Benz".
 */
const BRANDS: { canonical: string; keys: string[] }[] = [
  { canonical: "Audi", keys: ["audi"] },
  { canonical: "BMW", keys: ["bmw"] },
  { canonical: "Mercedes", keys: ["mercedes", "mercedes-benz", "merc"] },
  { canonical: "Volkswagen", keys: ["volkswagen", "vw"] },
  { canonical: "Porsche", keys: ["porsche"] },
  { canonical: "Toyota", keys: ["toyota"] },
  { canonical: "Lexus", keys: ["lexus"] },
  { canonical: "Volvo", keys: ["volvo"] },
  { canonical: "Tesla", keys: ["tesla"] },
  { canonical: "Škoda", keys: ["skoda"] },
  // SEAT the marque is deliberately absent: "seat" is also the English word
  // in "a car with 7 seats", and a brand list that turns seat counts into
  // demand for a Leon is worse than one that misses a marque nobody here
  // rents. Cupra, which is unambiguous, stands in for the group.
  { canonical: "Cupra", keys: ["cupra"] },
  { canonical: "Ford", keys: ["ford"] },
  { canonical: "Opel", keys: ["opel"] },
  { canonical: "Renault", keys: ["renault"] },
  { canonical: "Peugeot", keys: ["peugeot"] },
  { canonical: "Citroën", keys: ["citroen", "citroën"] },
  { canonical: "Dacia", keys: ["dacia"] },
  { canonical: "Fiat", keys: ["fiat"] },
  { canonical: "Alfa Romeo", keys: ["alfa romeo", "alfa"] },
  { canonical: "Jeep", keys: ["jeep"] },
  { canonical: "Land Rover", keys: ["land rover", "range rover", "landrover"] },
  { canonical: "Jaguar", keys: ["jaguar"] },
  { canonical: "Mini", keys: ["mini cooper"] },
  { canonical: "Mazda", keys: ["mazda"] },
  { canonical: "Honda", keys: ["honda"] },
  { canonical: "Nissan", keys: ["nissan"] },
  { canonical: "Mitsubishi", keys: ["mitsubishi"] },
  { canonical: "Suzuki", keys: ["suzuki"] },
  { canonical: "Subaru", keys: ["subaru"] },
  { canonical: "Hyundai", keys: ["hyundai"] },
  { canonical: "Kia", keys: ["kia"] },
  { canonical: "Chevrolet", keys: ["chevrolet"] },
  { canonical: "Dodge", keys: ["dodge"] },
  { canonical: "Chrysler", keys: ["chrysler"] },
  { canonical: "Cadillac", keys: ["cadillac"] },
  { canonical: "Maserati", keys: ["maserati"] },
  { canonical: "Ferrari", keys: ["ferrari"] },
  { canonical: "Lamborghini", keys: ["lamborghini"] },
  { canonical: "Bentley", keys: ["bentley"] },
  { canonical: "Rolls-Royce", keys: ["rolls royce", "rolls-royce"] },
  { canonical: "Aston Martin", keys: ["aston martin"] },
  { canonical: "Genesis", keys: ["genesis"] },
  { canonical: "Iveco", keys: ["iveco"] },
  { canonical: "Man", keys: ["man tge"] },
];

/**
 * Words that follow a brand but are not a model.
 *
 * Without this, "macie jakieś BMW na weekend" is recorded as demand for a
 * "BMW Na" — and once a nonsense model is in the table, the report that ranks
 * models by frequency puts it near the top, because the filler words people
 * type are the most frequent words there are.
 */
const NOT_A_MODEL = new Set([
  "na",
  "do",
  "od",
  "za",
  "w",
  "we",
  "z",
  "ze",
  "i",
  "lub",
  "albo",
  "ale",
  "jest",
  "sa",
  "ma",
  "macie",
  "maja",
  "czy",
  "to",
  "jakis",
  "jakies",
  "jakas",
  "jaka",
  "jaki",
  "jakie",
  "cos",
  "moze",
  "prosze",
  "chce",
  "chcialbym",
  "chcialabym",
  "potrzebuje",
  "szukam",
  "interesuje",
  "mnie",
  "dla",
  "przez",
  "dostepne",
  "dostepny",
  "dostepna",
  "wolne",
  "wolny",
  "wolna",
  "auto",
  "samochod",
  "samochodu",
  "auta",
  "wynajem",
  "wynajac",
  "rezerwacja",
  "the",
  "a",
  "an",
  "any",
  "some",
  "for",
  "with",
  "and",
  "or",
  "is",
  "are",
  "have",
  "do",
  "you",
  "got",
  "car",
  "rent",
  "rental",
  "available",
  "book",
  "looking",
  "need",
  "want",
  "please",
  "week",
  "weekend",
  "days",
  "day",
  "tydzien",
  "weekendu",
  "dni",
  "dzien",
  "miesiac",
  "jutro",
  "dzis",
]);

/**
 * Second word of a model name, when it is one people actually say.
 *
 * "Model S" and "V-Class" are two words or they are nothing; "Cayenne Turbo"
 * is a Cayenne. Keeping the list short is the point — a permissive rule
 * splinters one car into a dozen trim levels and the count that matters ends
 * up spread across all of them.
 */
const MODEL_SECOND_WORD =
  /^(s|x|y|3|klasa|class|coupe|cabrio|kombi|estate|sportback|avant|touring|gt|gts|turbo|hybrid|electric|ev|awd|4x4|xdrive|quattro)$/;

/* ── Segments, for the customer who names a need instead of a car ────────── */

/**
 * Read most-specific-first, which is the opposite order from the answering
 * parser and deliberately so.
 *
 * `lib/chat/nlu` puts `luxury` above `premium-suv` because for FINDING a car,
 * "luksusowy SUV" should reach the luxury shelf. For RECORDING demand the
 * operator needs the more specific of the two — "premium SUV" is a purchase
 * decision, "luxury" is a shelf — so the combination is checked before either
 * word alone. Two readings of one sentence, each right for its own job; the
 * answering path is untouched.
 */
const DEMAND_SEGMENTS: { segment: string; label: string; test: RegExp }[] = [
  {
    segment: "premium-suv",
    label: "PREMIUM SUV",
    test: /(luksus|premium|luxury|drogi|reprezentac)\w*[\s\S]{0,20}(suv|terenow|crossover)|(suv|terenow|crossover)\w*[\s\S]{0,20}(luksus|premium|luxury|reprezentac)/,
  },
  {
    segment: "van",
    label: "VAN / BUS",
    /*
     * Each alternative closes its own end.
     *
     * This pattern used to open with `\b(bus|…` and no boundary after it, so
     * every "business" in a message — the commonest English word a company
     * customer types — was recorded as demand for a nine-seat bus. The demand
     * report is the one place in the system that is supposed to be pure signal,
     * and it was counting corporate enquiries as minibus enquiries. Same defect
     * as the one in the answering parser, and it has to be fixed in both: they
     * read the same sentences for different purposes, so a fix in one leaves
     * the other lying about the same customer.
     */
    test: /\b(bus|busa|busem|busie|busow|van|vana|vanem|vanie|vanow|minibus\w*|minivan\w*|mikrobus\w*)\b|\b9[\s-]?(osob\w*|miejsc\w*)\b|\b(siedmioosob\w*|dziewiecioosob\w*)\b|\bpeople carrier\b/,
  },
  {
    segment: "electric",
    label: "ELEKTRYCZNY",
    test: /\b(elektryk|elektryczn|ev\b|na prad|electric)/,
  },
  {
    segment: "luxury",
    label: "LUKSUSOWY",
    test: /\b(luksus|luxury|limuzyn|reprezentac|premium)/,
  },
  {
    segment: "executive",
    label: "KLASA BIZNES",
    test: /\b(executive|sluzbow)/,
  },
  {
    segment: "premium-suv",
    label: "SUV",
    test: /\b(suv|terenow|crossover|4x4)/,
  },
  {
    segment: "business",
    label: "EKONOMICZNY",
    test: /\b(ekonomicz|oszczedn|budzet|tani|tanie|taniego|cheap|budget|business\b|biznes)/,
  },
];

const GEARBOX_WORDS: { value: string; label: string; test: RegExp }[] = [
  {
    value: "automatic",
    label: "AUTOMAT",
    test: /\b(automat|automatyczn|bezstopniow|automatic)/,
  },
  {
    value: "manual",
    label: "MANUAL",
    test: /\b(manual|reczn|manualn|stick shift)/,
  },
];

/* ── Reading a sentence ──────────────────────────────────────────────────── */

function titleCaseModel(raw: string): string {
  // "cayenne" → "Cayenne"; "xc60" → "XC60"; "v-class" → "V-Class".
  return raw
    .split(/([\s-])/)
    .map((part) =>
      /^[a-z]/.test(part)
        ? /\d/.test(part)
          ? part.toUpperCase()
          : part[0].toUpperCase() + part.slice(1)
        : part,
    )
    .join("");
}

/**
 * The brand named in the sentence, with where it was found and how long the
 * match ran.
 *
 * The length matters: Polish declines marques — "Mercedesa", "Teslę",
 * "Porschem" — so a key of eight characters can match nine, and slicing the
 * rest of the sentence by the KEY length would leave the inflection behind and
 * read it as the model name. Short keys ("bmw", "kia") get no such allowance,
 * because two free letters on a three-letter key matches far too much.
 */
function findBrand(
  t: string,
): { canonical: string; at: number; len: number } | null {
  let best: { canonical: string; at: number; len: number; key: number } | null =
    null;
  for (const b of BRANDS) {
    for (const key of b.keys) {
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      /*
       * Polish declines brand names, and it declines the LAST letter.
       *
       * `toyota\\w{0,2}` looks tolerant and is not: "Macie Toyotę Land
       * Cruiser?" normalises to "toyote", which is "toyot" + "e" — the literal
       * "toyota" the pattern insists on is never there, the brand was never
       * found, and an enquiry about a car we do not rent came back as "nie mam
       * pewnej informacji na ten temat". So for a long key ending in a vowel
       * the final vowel is dropped and a short tail allowed in its place.
       * Only for keys of five characters or more, where the stem is still long
       * enough to be unmistakable — "alfa" and "ford" stay exact.
       */
      const declinable = key.length >= 5 && /[aeiouy]$/.test(key);
      const stem = declinable ? escaped.slice(0, -1) : escaped;
      const pattern =
        key.length >= 5 ? `\\b${stem}\\w{0,3}\\b` : `\\b${escaped}\\b`;
      const m = t.match(new RegExp(pattern));
      if (m && m.index !== undefined) {
        // Longest key wins, so "alfa romeo" is not recorded as "alfa".
        if (!best || key.length > best.key) {
          best = {
            canonical: b.canonical,
            at: m.index,
            len: m[0].length,
            key: key.length,
          };
        }
      }
    }
  }
  return best
    ? { canonical: best.canonical, at: best.at, len: best.len }
    : null;
}

/** Whatever follows the brand and looks like a model name. */
function modelAfter(
  t: string,
  brand: { at: number; len: number },
): string | null {
  const rest = t.slice(brand.at + brand.len).trim();
  if (!rest) return null;
  const words = rest.split(/\s+/);
  const first = words[0]?.replace(/[^a-z0-9-]/g, "");
  if (!first || first.length < 2 || NOT_A_MODEL.has(first)) return null;
  // A bare number is a date or a passenger count far more often than a model.
  if (/^\d+$/.test(first) && first.length <= 2) return null;

  const second = words[1]?.replace(/[^a-z0-9-]/g, "");
  if (second && MODEL_SECOND_WORD.test(second)) return `${first} ${second}`;
  return first;
}

function segmentOf(t: string): { segment: string; label: string } | null {
  for (const s of DEMAND_SEGMENTS) if (s.test.test(t)) return s;
  return null;
}

function gearboxOf(t: string): { value: string; label: string } | null {
  for (const g of GEARBOX_WORDS) if (g.test.test(t)) return g;
  return null;
}

const FUEL_LABEL: Record<string, string> = {
  petrol: "BENZYNA",
  diesel: "DIESEL",
  hybrid: "HYBRYDA",
  electric: "ELEKTRYCZNY",
};

/**
 * Read the demand out of one message.
 *
 * Returns `null` when the sentence describes no car at all — which is most
 * sentences. "Ile kosztuje kaucja" is not demand for anything, and a row for
 * it would be noise in the one report that is supposed to be signal.
 *
 * The rule the spec is emphatic about, and the one enforced here: **never
 * invent a model the customer did not say.** "Potrzebuję dużego auta dla 7
 * osób" produces a segment row (`VAN · 7 osób`) and no model, because the
 * customer named a need. Turning that into "Mercedes V-Class" would put a
 * purchase recommendation in the table that nobody ever asked for.
 */
export function detectDemand(
  message: string,
  parsed: Parsed,
  vocab: Vocabulary,
  /** Label of what this conversation was already about, if anything. */
  previous?: string | null,
): Demand | null {
  const t = normalize(message);
  if (!t) return null;

  const e = parsed.entities;
  const seats = e.seats;
  const fuel = e.fuel;

  /* 1. A car the customer named. */
  const brand = findBrand(t);
  if (brand) {
    const model = modelAfter(t, brand);
    if (model) {
      const pretty = titleCaseModel(model);
      return {
        kind: "model",
        brand: brand.canonical,
        model: pretty,
        segment: segmentOf(t)?.segment ?? null,
        seats,
        gearbox: gearboxOf(t)?.value ?? null,
        fuel,
        label: `${brand.canonical} ${pretty}`,
        normalized: normalize(`${brand.canonical} ${pretty}`),
      };
    }
    return {
      kind: "brand",
      brand: brand.canonical,
      model: null,
      segment: segmentOf(t)?.segment ?? null,
      seats,
      gearbox: gearboxOf(t)?.value ?? null,
      fuel,
      label: brand.canonical,
      normalized: normalize(brand.canonical),
    };
  }

  /* 2. A car in the fleet, named without its brand ("RAV4 nie jest wolna"). */
  //
  // Only when the parser matched a MODEL NAME. Its brand-only rule is a
  // convenience for answering — "macie jakiegoś Mercedesa" resolves to the one
  // Mercedes in the fleet so the assistant can talk about it — and borrowing
  // that here would file the enquiry as demand for a "Mercedes-Benz GLE 350",
  // a car the customer never mentioned. The spec is explicit: do not invent a
  // model. Brand-only enquiries are handled by branch 1 as brand demand.
  if (e.carModelIds.length > 0 && parsed.signals.carPrecise) {
    const car = vocab.cars.find((c) => c.modelId === e.carModelIds[0]);
    if (car) {
      const label = `${car.brand} ${car.model}`;
      return {
        kind: "model",
        brand: car.brand,
        model: car.model,
        segment: segmentOf(t)?.segment ?? null,
        seats,
        gearbox: gearboxOf(t)?.value ?? null,
        fuel,
        label,
        normalized: normalize(label),
      };
    }
  }

  /* 3. A need, with no name attached. */
  const seg = segmentOf(t);
  const gear = gearboxOf(t);
  if (seg || seats || fuel || gear) {
    const parts = [
      seg?.label,
      seats ? `${seats} osób` : null,
      fuel && !seg ? FUEL_LABEL[fuel] : null,
      gear?.label,
    ].filter(Boolean) as string[];
    if (parts.length === 0) return null;
    const label = parts.join(" · ");
    return {
      kind: "segment",
      brand: null,
      model: null,
      segment: seg?.segment ?? null,
      seats,
      gearbox: gear?.value ?? null,
      fuel,
      label,
      normalized: normalize(label),
    };
  }

  /**
   * 4. A follow-up about the car we are already discussing.
   *
   * "A Cayenne S?" carries no brand and matches no fleet car, so every branch
   * above passes on it — and the visitor gets "nie rozumiem" one message after
   * being told, correctly, that we have no Cayenne. If a distinctive word from
   * what they last asked about is in the sentence, this is that same request.
   *
   * Words of four letters or more only: "s" and "gt" would match half the
   * language, and matching the wrong conversation is worse than missing this
   * one. The recursive call passes no `previous`, so it cannot loop.
   */
  if (previous) {
    const words = normalize(previous)
      .split(/\s+/)
      .filter((w) => w.length >= 4);
    if (words.some((w) => t.includes(w))) {
      return detectDemand(previous, parsed, vocab);
    }
  }

  return null;
}

/**
 * Does the live fleet contain what was asked for?
 *
 * Brand and model are compared after normalisation because "V-Class" and
 * "v class" are the same car, and because the fleet writes model names the way
 * a catalogue does while customers write them the way people do.
 */
export function isInFleet(demand: Demand, vocab: Vocabulary): boolean {
  if (demand.kind === "segment") {
    // A need is "in fleet" when some car could plausibly serve it. Seats are
    // checkable; a segment is what the fleet itself declares it belongs to.
    return vocab.cars.some(
      (c) =>
        (!demand.seats || c.seats >= demand.seats) &&
        (!demand.segment || c.segments.includes(demand.segment)),
    );
  }
  // "Mercedes" and "Mercedes-Benz" are one marque; so are "VW" and
  // "Volkswagen" once the canonical name is used on both sides. Compared as
  // prefixes with separators removed, because the fleet writes catalogue names
  // and customers write spoken ones.
  const flat = (v: string) => normalize(v).replace(/[^a-z0-9]/g, "");
  const brand = flat(demand.brand ?? "");
  if (!brand) return false;
  const sameBrand = vocab.cars.filter((c) => {
    const f = flat(c.brand);
    return f === brand || f.startsWith(brand) || brand.startsWith(f);
  });
  if (sameBrand.length === 0) return false;
  if (demand.kind === "brand" || !demand.model) return true;

  const model = normalize(demand.model);
  return sameBrand.some((c) => {
    const fleet = normalize(c.model);
    return (
      fleet === model || fleet.startsWith(model) || model.startsWith(fleet)
    );
  });
}
