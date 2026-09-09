import "server-only";
// Składa czytanie modelu z odpowiedzią deterministyczną i sięga po
// `cloudflare.ts` — patrz bariera tam.
import { parse, type Locale, type Parsed, type Vocabulary } from "../nlu";
import {
  readMessage,
  neuronsFor,
  configFromEnv,
  DEFAULT_MODEL,
  type AiFailure,
  type CloudflareConfig,
} from "./cloudflare";
import { mergeWithRules, shouldEscalate, toParsed } from "./reader";
import { reserve, settle, release, ESTIMATED_NEURONS_PER_CALL } from "./budget";
import type { Database } from "@/lib/db";

/**
 * The hybrid reader: rules first, a model only when the rules are unsure.
 *
 * Everything that can go wrong here has the same consequence — the
 * deterministic parser's reading is used — and that reading is computed BEFORE
 * anything else happens. There is no path through this function that can fail
 * to produce an answer, because the answer already exists by line three.
 *
 * ## What the model is, and is not
 *
 * It is handed one sanitised sentence and returns one JSON object of a closed
 * shape. It has no tools, no database client, no HTTP client of its own, no
 * environment, no filesystem. There is nothing to allow-list because there is
 * nothing to call. Every number the customer eventually sees is fetched
 * afterwards by code that never saw the model's output.
 *
 * ## Order of the gates
 *
 * 1. The rules parse the message. If they refuse it, we stop — refusals are not
 *    delegated, and an attack never reaches a third party.
 * 2. Escalation is considered. Four messages in five stop here.
 * 3. The daily budget is claimed atomically. No room means no call.
 * 4. Only now does anything leave the building.
 */

export type HybridOptions = {
  /** `false` puts every message through the parser. The kill switch. */
  aiEnabled: boolean;
  /** Injected so the caller owns the connection; also makes this testable. */
  db: Database;
  config?: CloudflareConfig | null;
  model?: string;
};

export type HybridOutcome = {
  parsed: Parsed;
  source: "deterministic" | "ai";
  /** Why the model was or was not consulted. */
  reason:
    | "confident_enough"
    | "low_confidence"
    | "unknown_intent"
    | "conflict"
    | "complex_sentence"
    | "ai_disabled"
    | "no_credentials"
    | "daily_cap"
    | "refused";
  failure: AiFailure | null;
  latencyMs: number;
  neurons: number;
};

export async function readHybrid(
  message: string,
  vocab: Vocabulary,
  today: Date,
  locale: Locale,
  options: HybridOptions,
): Promise<HybridOutcome> {
  const rules = parse(message, vocab, today, locale);

  const stop = (
    reason: HybridOutcome["reason"],
    failure: AiFailure | null = null,
  ): HybridOutcome => ({
    parsed: rules,
    source: "deterministic",
    reason,
    failure,
    latencyMs: 0,
    neurons: 0,
  });

  // 1. Our own refusals, made by us.
  if (rules.intent === "OUT_OF_SCOPE") return stop("refused");

  // 2. Is this message worth a model at all?
  const decision = shouldEscalate(rules);
  if (!decision.escalate) return stop(decision.reason);

  // 3. The switch, then the credentials.
  if (!options.aiEnabled) return stop("ai_disabled");
  const config = options.config ?? configFromEnv();
  if (!config) return stop("no_credentials");

  // 4. Claim the budget before spending it. A refusal here is not an error —
  // it is the cap doing its job, and the customer never learns it happened.
  const claim = await reserve(options.db, ESTIMATED_NEURONS_PER_CALL);
  if (!claim.granted) return stop("daily_cap");

  const model = options.model ?? config.model ?? DEFAULT_MODEL;
  const res = await readMessage(
    message,
    vocab.cars.map((c) => `${c.brand} ${c.model}`),
    today.toISOString().slice(0, 10),
    { ...config, model, schemaVariant: "json_object" },
  );

  const neurons =
    res.usage.promptTokens !== null
      ? (neuronsFor(
          model,
          res.usage.promptTokens ?? 0,
          res.usage.completionTokens ?? 0,
        ) ?? null)
      : null;

  if (!res.ok) {
    // Nothing left this process for these two, so the room goes back.
    if (res.failure === "disabled") {
      await release(options.db, claim.reserved, true);
      return stop("no_credentials", res.failure);
    }
    await settle(options.db, claim.reserved, neurons, true);
    return {
      parsed: rules,
      source: "deterministic",
      reason: decision.reason,
      failure: res.failure,
      latencyMs: res.usage.latencyMs,
      neurons: neurons ?? claim.reserved,
    };
  }

  await settle(options.db, claim.reserved, neurons, false);

  return {
    // The model decides the intent it was called for; slots it left empty are
    // filled from the rules, so escalating never loses what was already known.
    parsed: mergeWithRules(
      toParsed(res.reading, message, vocab, today, res.reading.language),
      rules,
    ),
    source: "ai",
    reason: decision.reason,
    failure: null,
    latencyMs: res.usage.latencyMs,
    neurons: neurons ?? claim.reserved,
  };
}

/**
 * One line for the log. Technical facts only.
 *
 * What is NOT here is the point: no message text, no customer details, no
 * token, no header, no account id. Everything below is either a number or a
 * value from a closed set, so there is no field through which something
 * personal could arrive by accident. Analytics needs "did the model earn its
 * place and did it fail safely" — neither question needs the customer's words.
 */
export function aiLogLine(outcome: HybridOutcome, model: string): string {
  return [
    `provider=${outcome.source}`,
    `model=${outcome.source === "ai" ? model : "-"}`,
    `intent=${outcome.parsed.intent}`,
    `confidence=${outcome.parsed.confidenceScore.toFixed(2)}`,
    `reason=${outcome.reason}`,
    `result=${outcome.source === "ai" ? "success" : "fallback"}`,
    `error=${outcome.failure ?? "none"}`,
    `latency_ms=${outcome.latencyMs}`,
    `neurons=${outcome.neurons.toFixed(1)}`,
  ].join(" ");
}
