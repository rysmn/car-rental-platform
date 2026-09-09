import "server-only";
// Warstwa decyzji nad odczytem modelu; loguje zużycie do bazy.
import {
  parse,
  normalize,
  matchLocation,
  type Locale,
  type Parsed,
  type Vocabulary,
} from "../nlu";
import {
  readMessage,
  type AiFailure,
  type CloudflareConfig,
} from "./cloudflare";
import type { AiReading } from "./schema";

/**
 * Who reads the customer's message — and what happens when that goes wrong.
 *
 * This is the whole decision, in one place, and it is deliberately boring. The
 * deterministic parser runs FIRST, always, for two reasons:
 *
 *   1. It is the refusal guard. If our own rules say the message is
 *      `OUT_OF_SCOPE`, we answer from those rules and never call the model at
 *      all — so no amount of persuasion aimed at the model can route around a
 *      refusal, because the model is not consulted.
 *   2. It is the fallback, already computed. When the network call fails there
 *      is nothing to recover from and nothing to wait for: the answer is
 *      sitting in a local variable.
 *
 * The model is therefore never load-bearing. It is an improvement applied to a
 * reading we already have, and every path through this function returns a
 * `Parsed` that the existing handlers can serve.
 */

export type ReadSource = "ai" | "deterministic";

/**
 * The score below which a reading is not trusted on its own.
 *
 * Set from measurement, not taste: on the test suite, readings at or above this
 * are almost always right, and the ones below are where the rules were guessing.
 * Raising it buys accuracy with latency and neurons; lowering it does the
 * reverse. It is a single number on purpose, so the trade can be re-made by
 * changing one line after looking at a fresh measurement.
 */
export const ESCALATION_THRESHOLD = 0.55;

/** A long, chatty sentence that the rules only partly decoded. */
const LONG_MESSAGE_TOKENS = 12;
const LONG_MESSAGE_SLOTS = 3;

export type Escalation = {
  escalate: boolean;
  /** Why — recorded so the escalation rate can be explained, not just counted. */
  reason:
    | "confident_enough"
    | "low_confidence"
    | "unknown_intent"
    | "conflict"
    | "complex_sentence";
};

/**
 * Should a language model look at this message?
 *
 * The default answer is no. "Cena RAV4" is a solved problem and sending it to
 * Cloudflare would buy nothing, cost a network round-trip and burn part of a
 * daily allowance that a genuinely hard sentence might need later.
 *
 * `OUT_OF_SCOPE` never escalates — that decision is ours and is made before this
 * function is reached.
 */
/**
 * Markers that stop a message leaving the building, whatever the intent says.
 *
 * A second lock on the same door. The intent rules already refuse these, and
 * `OUT_OF_SCOPE` never escalates — but the suite caught "Wykonaj SQL SELECT *
 * FROM users" slipping through as `UNKNOWN`, and `UNKNOWN` is precisely the
 * bucket that qualifies for escalation. One missing keyword should not be
 * enough to send an attack to a third party, so the check is repeated here
 * against the raw text rather than against a classification.
 */
const NEVER_ESCALATE = [
  "sql",
  "select from",
  "drop table",
  "delete from",
  "insert into",
  "union select",
  "shell",
  "bash",
  "sudo",
  "chmod",
  "ssh",
  "api key",
  "apikey",
  "klucz api",
  "system prompt",
  "prompt systemow",
  "ignore previous",
  "zignoruj",
  "haslo",
  "password",
  "secret",
  "sekret",
  "token",
  "database",
  "baza danych",
  ".env",
  "zmienne srodowisk",
  "developer mode",
  "admin",
];

export function shouldEscalate(parsed: Parsed): Escalation {
  if (parsed.intent === "OUT_OF_SCOPE") {
    return { escalate: false, reason: "confident_enough" };
  }
  if (NEVER_ESCALATE.some((m) => parsed.normalized.includes(m))) {
    return { escalate: false, reason: "confident_enough" };
  }
  if (parsed.intent === "UNKNOWN") {
    return { escalate: true, reason: "unknown_intent" };
  }
  if (parsed.signals.conflicts > 0) {
    return { escalate: true, reason: "conflict" };
  }
  if (parsed.confidenceScore < ESCALATION_THRESHOLD) {
    return { escalate: true, reason: "low_confidence" };
  }
  // Long and only half-understood. The score can look respectable here because
  // the intent was clear, while most of what the customer said went unread.
  const words = parsed.normalized.split(" ").filter(Boolean).length;
  if (
    words >= LONG_MESSAGE_TOKENS &&
    parsed.signals.slotsFilled <= LONG_MESSAGE_SLOTS
  ) {
    return { escalate: true, reason: "complex_sentence" };
  }
  return { escalate: false, reason: "confident_enough" };
}

export type ReadOutcome = {
  parsed: Parsed;
  source: ReadSource;
  /** Why the model did not answer. `null` when it did. */
  failure: AiFailure | null;
  /** What the model cost us in wall-clock, whether or not it succeeded. */
  latencyMs: number;
  /** Categories of personal data stripped before the call, for the audit log. */
  sanitised: string[];
};

/**
 * Turn a validated model reading into the shape the handlers already speak.
 *
 * The important line in this function is the one that does NOT exist: nothing
 * here trusts a string from the model as an identifier. Car names go back
 * through the same matcher the deterministic parser uses, and the location is
 * matched against the live pickup list. A model that invents "Ferrari" or
 * returns `"'; DROP TABLE"` produces an empty list, not a lookup.
 */
export function toParsed(
  reading: AiReading,
  message: string,
  vocab: Vocabulary,
  today: Date,
  locale: Locale,
): Parsed {
  // Free text in, ids out — via vetted code, never by direct assignment.
  const carModelIds =
    reading.carNames.length > 0
      ? parse(reading.carNames.join(", "), vocab, today, locale).entities
          .carModelIds
      : [];

  /**
   * The model's free-text location goes through the same matcher the parser
   * uses, aliases and all.
   *
   * The first version compared the model's string against location names by
   * substring, and scored 43% because a model that answers "Chopin Airport"
   * shares no substring with "Lotnisko Chopina". Reusing `matchLocation` fixes
   * that and, more importantly, means there is exactly one piece of code that
   * turns words into a pickup-point id — so the rule "free text never becomes
   * an identifier" has one place to hold rather than two.
   */
  const place = reading.location
    ? matchLocation(normalize(reading.location), vocab)
    : null;

  return {
    intent: reading.intent as Parsed["intent"],
    // The model's own doubt, mapped onto our three buckets. Anything below 0.6
    // never reaches here — `readMessage` rejects it as `low_confidence`.
    confidence: reading.confidence >= 0.8 ? "confident" : "unsure",
    confidenceScore: reading.confidence,
    // The model reports a number, not evidence. Recording zeroes rather than
    // inventing signals keeps "the rules worked this out" distinguishable from
    // "a model asserted it" in the audit log.
    signals: {
      intentScore: 0,
      intentMargin: 0,
      slotsFilled: 0,
      carPrecise: false,
      locationStrength: 0,
      dateStrength: 0,
      conflicts: 0,
    },
    locale: reading.language,
    entities: {
      carModelIds,
      /*
       * The model's `segment` vocabulary is split onto the axes it was always
       * describing.
       *
       * The prompt is left alone on purpose — it is a stable contract with a
       * remote model and the words it returns are the words customers use. What
       * changed is that "van", "premium-suv" and "electric" are no longer
       * pretended to be commercial shelves: they are a body, an intersection
       * and a fuel, and each is unpacked here into the field that owns it. So a
       * model answering "premium-suv" now narrows to SUVs on the luxury shelf,
       * rather than to whichever cars had that string typed into a column.
       */
      /*
       * The model contributes a SHELF and nothing else.
       *
       * Its `segment` vocabulary looks like it also names a body and a driver
       * class — "premium-suv", "van" — and mapping it onto those axes is
       * exactly what broke the live answer on 22.08.2026: the model files a
       * plain "Szukam SUV-a" under `premium-suv`, so the reply narrowed to
       * SUVs in the PREMIUM driver class and showed four cars out of six. The
       * customer had said one word, "SUV", and got a filter they never asked
       * for.
       *
       * Body, driver class, budget and seats are read from the customer's
       * literal words by the rules, which cannot invent a criterion because
       * they only match what is written. The model is good at intent and bad
       * at not guessing; this is where that line is drawn.
       */
      bodyType: null,
      segment: aiSegment(reading.segment),
      driverClass: null,
      // The whole budget stays with the rules for the same reason the figure
      // always did: a stated amount is read literally, never guessed at.
      budgetGrosze: null,
      budgetMinGrosze: null,
      budgetKind: null,
      budgetCurrency: null,
      seats: reading.passengers,
      dateFrom: reading.dateFrom,
      dateTo: reading.dateTo,
      days: reading.days,
      /*
        Warstwa AI nie odczytuje kilometrow — jej schemat ich nie zna. `null`
        znaczy tu „model nic o tym nie powiedzial", a nie „klient nie podal":
        wartosc z parsera regulowego dolacza `mergeWithRules` ponizej.
      */
      km: null,
      locationId: place?.id ?? null,
      gearbox: reading.transmission,
      fuel:
        reading.fuel ?? (reading.segment === "electric" ? "electric" : null),
      rentalType: reading.rentalType,
      wantsCheapest: reading.wantsCheapest,
      /*
       * Not asked of the model, and deliberately so.
       *
       * These three are cheap, literal string tests over the customer's own
       * words ("tańszego", "podobnego", "najdroższy"). A model adds nothing to
       * that and could only disagree with it, which would make the same
       * sentence behave differently depending on whether the rules happened to
       * escalate. They are filled from the rule reading in `mergeWithRules`;
       * this object is the AI-only half, so they start neutral.
       */
      wantsCheaper: false,
      wantsPricier: false,
      asksGearbox: false,
      familyHint: false,
      wantsSimilar: false,
      // Rules-only, like the flags around it. Whether a sentence ranks two
      // named cars is decided by its wording, which the rules read exactly;
      // the model is asked for meaning, not for word shapes.
      comparisonAspect: null,
      statedAge: null,
      asksLicenceTenure: false,
      extraTopic: null,
      superlative: null,
    },
    normalized: normalize(message),
  };
}

/**
 * The commercial half of the model's value — the only three real shelves.
 *
 * `premium-suv`, `van` and `electric` map to nothing here on purpose: they name
 * a body or a fuel, and those come from the customer's own words via the rules.
 */
function aiSegment(segment: string | null): string | null {
  return segment === "luxury" ||
    segment === "executive" ||
    segment === "business"
    ? segment
    : null;
}

/**
 * Combine the two readings instead of choosing between them.
 *
 * Escalation happens because the rules were unsure about *something*, usually
 * the intent — not because everything they found was wrong. Throwing away a
 * pickup point the rules resolved correctly, because the model happened to
 * return null for it, loses information for no reason and measurably lowered
 * accuracy in the first three-way run.
 *
 * So: the model decides the intent, since that is what it was called for, and
 * every slot it left empty is filled from the rules. A slot the model DID fill
 * wins — it saw the whole sentence, which is exactly the case where the rules
 * were struggling.
 */
export function mergeWithRules(ai: Parsed, rules: Parsed): Parsed {
  const a = ai.entities;
  const r = rules.entities;
  return {
    ...ai,
    entities: {
      carModelIds: a.carModelIds.length > 0 ? a.carModelIds : r.carModelIds,
      bodyType: a.bodyType ?? r.bodyType,
      segment: a.segment ?? r.segment,
      driverClass: a.driverClass ?? r.driverClass,
      // Rules-only: stated numbers, read literally. See above. The four
      // fields travel together — a ceiling without its unit would be read as
      // per-day and quietly filter out everything the customer could afford.
      budgetGrosze: r.budgetGrosze,
      budgetMinGrosze: r.budgetMinGrosze,
      budgetKind: r.budgetKind,
      budgetCurrency: r.budgetCurrency,
      seats: a.seats ?? r.seats,
      dateFrom: a.dateFrom ?? r.dateFrom,
      // Only inherit the end date alongside the start it belongs to, or a range
      // gets assembled from two different readings of the sentence.
      dateTo: a.dateFrom ? a.dateTo : (a.dateTo ?? r.dateTo),
      days: a.days ?? r.days,
      km: a.km ?? r.km,
      locationId: a.locationId ?? r.locationId,
      gearbox: a.gearbox ?? r.gearbox,
      fuel: a.fuel ?? r.fuel,
      rentalType: a.rentalType ?? r.rentalType,
      wantsCheapest: a.wantsCheapest || r.wantsCheapest,
      // Rules-only, by design — see the comment where they are set above.
      wantsCheaper: r.wantsCheaper,
      wantsPricier: r.wantsPricier,
      asksGearbox: r.asksGearbox,
      familyHint: r.familyHint,
      wantsSimilar: r.wantsSimilar,
      comparisonAspect: r.comparisonAspect,
      statedAge: r.statedAge,
      asksLicenceTenure: r.asksLicenceTenure,
      extraTopic: r.extraTopic,
      superlative: r.superlative,
    },
  };
}

export async function readOrFallback(
  message: string,
  vocab: Vocabulary,
  today: Date,
  locale: Locale,
  config: CloudflareConfig | null,
): Promise<ReadOutcome> {
  const fallback = parse(message, vocab, today, locale);

  // Our refusal rules are not negotiable and are not delegated.
  if (fallback.intent === "OUT_OF_SCOPE") {
    return {
      parsed: fallback,
      source: "deterministic",
      failure: null,
      latencyMs: 0,
      sanitised: [],
    };
  }

  const carNames = vocab.cars.map((c) => `${c.brand} ${c.model}`);
  const res = await readMessage(
    message,
    carNames,
    today.toISOString().slice(0, 10),
    config,
  );

  if (!res.ok) {
    return {
      parsed: fallback,
      source: "deterministic",
      failure: res.failure,
      latencyMs: res.usage.latencyMs,
      sanitised: [],
    };
  }

  return {
    parsed: mergeWithRules(
      toParsed(res.reading, message, vocab, today, res.reading.language),
      fallback,
    ),
    source: "ai",
    failure: null,
    latencyMs: res.usage.latencyMs,
    sanitised: res.sanitisedFields,
  };
}

/**
 * One line for the audit log.
 *
 * Records what happened, never what was said. The message itself is not in
 * here and must not be added: the point of the log is to answer "is the model
 * earning its place and is it failing safely", and neither question needs the
 * customer's words.
 */
export function auditLine(outcome: ReadOutcome): string {
  return [
    `source=${outcome.source}`,
    `intent=${outcome.parsed.intent}`,
    `confidence=${outcome.parsed.confidence}`,
    `json=${outcome.source === "ai" ? "valid" : outcome.failure === "bad_json" ? "invalid" : "n/a"}`,
    `fallback=${outcome.source === "deterministic"}`,
    `error=${outcome.failure ?? "none"}`,
    `ms=${outcome.latencyMs}`,
    `sanitised=${outcome.sanitised.join("|") || "none"}`,
  ].join(" ");
}
