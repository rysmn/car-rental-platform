import { z } from "zod";
import { INTENTS } from "../nlu";

/**
 * The only shape a language model is allowed to return.
 *
 * Everything here is a CLOSED set or a strictly formatted primitive. The model
 * cannot invent an intent, cannot name a segment we do not sell, and cannot
 * return a price — there is no field for one. Anything that fails this schema
 * is discarded and the deterministic parser answers instead; a malformed
 * reading is treated exactly like no reading at all.
 *
 * This is the second half of the containment. The first half is that the model
 * is never given a tool: it produces a description of the question and nothing
 * else, and every number the customer sees is fetched afterwards by code that
 * has never seen the model's output.
 */

/** `INTENTS` minus the six the model has no business choosing. */
const MODEL_INTENTS = INTENTS.filter(
  (i) =>
    i !== "UNKNOWN" &&
    i !== "OUT_OF_SCOPE" &&
    // Added 2026-08-20. Both are decided by our own keywords before the model
    // is ever consulted, and both exist to STOP an answer being produced. A
    // model that could select them could also decline to, which would hand a
    // language model the say over whether a crash gets routed to a human.
    i !== "EMERGENCY" &&
    i !== "NEEDS_STAFF_CONFIRMATION" &&
    // Foreign travel is a company rule, not a reading of a sentence. A model
    // that could pick this intent could also decline to, and consent to drive
    // abroad is not a decision a language model gets to influence.
    i !== "ABROAD" &&
    i !== "DOCUMENTS" &&
    // Same reasoning for driver age (2026-08-20): the answer is a company rule
    // read from the panel, chosen by our own keywords. A model able to select
    // this intent could also decline to select it, and the question "can I
    // rent at 21?" must not depend on that.
    i !== "DRIVER_AGE" &&
    // Added 2026-08-21, same reasoning again: an existing reservation is the
    // one subject the assistant is structurally unable to read, so this intent
    // exists only to stop an answer and route to a person. A model that could
    // select it could also decline to, and "cancel my booking" would go back to
    // being answered with a list of cars for sale.
    i !== "MANAGE_BOOKING",
) as unknown as [string, ...string[]];

/**
 * `UNKNOWN` is excluded on purpose: a model that is unsure should say so
 * through `confidence`, not by picking a bucket. `OUT_OF_SCOPE` is excluded
 * because refusal decisions stay with our own rules — a model persuaded to
 * classify "daj mi rabat" as `FAQ` must not thereby route around the refusal.
 * The deterministic keyword check for out-of-scope requests runs regardless of
 * what the model returns.
 */
/**
 * Where strictness belongs, and where it does not.
 *
 * `intent` decides what happens next, so it stays absolute: anything outside
 * the closed list rejects the whole reading and the deterministic parser
 * answers. Every other field is a slot the customer may or may not have filled,
 * and there the right response to nonsense is to forget that slot — not to
 * throw away a correct intent along with it.
 *
 * The first run of the suite made the case. The model was told to write `null`
 * for anything unstated, `z.boolean()` rejects `null`, and 29 of 45
 * otherwise-good readings were discarded over the `wantsCheapest` field. That
 * measured our schema, not the model.
 *
 * Coercion always runs toward "we did not learn anything", never toward a
 * guess, so nothing a model invents can survive as a value.
 */
// The cast restores the literal union that `preprocess` widens to `string`.
// Runtime behaviour is unchanged — `z.enum` is still the thing deciding.
// `const T` keeps the literal members: without it TypeScript widens the tuple
// to `string[]` and every caller loses its union.
const oneOfOrNull = <const T extends readonly [string, ...string[]]>(
  values: T,
) =>
  z.preprocess(
    (v) => (typeof v === "string" && values.includes(v) ? v : null),
    z.enum(values).nullable(),
  ) as unknown as z.ZodType<T[number] | null>;

const isoDateOrNull = z.preprocess(
  (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null),
  z.string().nullable(),
);

const intInRangeOrNull = (min: number, max: number) =>
  z.preprocess(
    (v) =>
      typeof v === "number" && Number.isInteger(v) && v >= min && v <= max
        ? v
        : null,
    z.number().nullable(),
  );

export const aiReadingSchema = z
  .object({
    intent: z.enum(MODEL_INTENTS),
    /**
     * How sure the model is. Below `0.6` we ask rather than act — and a model
     * that omits the field is treated as unsure, so silence costs it the turn
     * rather than winning one.
     */
    confidence: z.preprocess(
      (v) => (typeof v === "number" ? Math.max(0, Math.min(1, v)) : 0.5),
      z.number(),
    ),
    language: z.preprocess(
      (v) => (v === "en" ? "en" : "pl"),
      z.enum(["pl", "en"]),
    ),
    /** Free text as the customer wrote it — matched against the live fleet later. */
    carNames: z.preprocess(
      (v) =>
        Array.isArray(v)
          ? v
              .filter((x): x is string => typeof x === "string")
              .slice(0, 3)
              .map((s) => s.slice(0, 40))
          : [],
      z.array(z.string()),
    ),
    segment: oneOfOrNull([
      "luxury",
      "executive",
      "premium-suv",
      "electric",
      "business",
      "van",
    ]),
    passengers: intInRangeOrNull(1, 9),
    dateFrom: isoDateOrNull,
    dateTo: isoDateOrNull,
    /** Length in days when stated without dates ("na tydzień"). */
    days: intInRangeOrNull(1, 365),
    /** Free text — resolved against active pickup points, never trusted as an id. */
    location: z.preprocess(
      (v) => (typeof v === "string" && v.trim() ? v.slice(0, 60) : null),
      z.string().nullable(),
    ),
    transmission: oneOfOrNull(["automatic", "manual"]),
    fuel: oneOfOrNull(["petrol", "diesel", "hybrid", "electric"]),
    rentalType: oneOfOrNull(["short", "long_term", "business"]),
    /** Only an explicit `true` counts; anything else means "not stated". */
    wantsCheapest: z.preprocess((v) => v === true, z.boolean()),
  })
  // A range that runs backwards is a misreading, not a booking. Rejecting it
  // here sends the turn to the deterministic parser rather than quoting a
  // negative number of days.
  .refine((d) => !d.dateFrom || !d.dateTo || d.dateTo >= d.dateFrom, {
    path: ["dateTo"],
  });

export type AiReading = z.infer<typeof aiReadingSchema>;

/**
 * The JSON Schema handed to Workers AI in `response_format`.
 *
 * Kept flat and small on purpose: Cloudflare warns that complex or deeply
 * nested schemas may be rejected outright, and this one has to survive on an
 * 8B model. It mirrors the zod schema above, but zod remains the authority —
 * Cloudflare states it cannot guarantee the model honours the schema, so the
 * output is validated again on our side no matter what came back.
 */
export const AI_JSON_SCHEMA = {
  type: "object",
  properties: {
    intent: { type: "string", enum: MODEL_INTENTS },
    confidence: { type: "number" },
    language: { type: "string", enum: ["pl", "en"] },
    carNames: { type: "array", items: { type: "string" } },
    segment: {
      type: ["string", "null"],
      enum: [
        "luxury",
        "executive",
        "premium-suv",
        "electric",
        "business",
        "van",
        null,
      ],
    },
    passengers: { type: ["integer", "null"] },
    dateFrom: { type: ["string", "null"] },
    dateTo: { type: ["string", "null"] },
    days: { type: ["integer", "null"] },
    location: { type: ["string", "null"] },
    transmission: {
      type: ["string", "null"],
      enum: ["automatic", "manual", null],
    },
    fuel: {
      type: ["string", "null"],
      enum: ["petrol", "diesel", "hybrid", "electric", null],
    },
    rentalType: {
      type: ["string", "null"],
      enum: ["short", "long_term", "business", null],
    },
    wantsCheapest: { type: "boolean" },
  },
  required: ["intent", "confidence", "language"],
} as const;

/**
 * The same contract, expressed without union types.
 *
 * `type: ["string", "null"]` is legal JSON Schema, but Workers AI's grammar
 * compiler is not a full JSON Schema implementation and small models handle
 * unions badly even when it accepts them. This variant says "omit the field
 * instead of nulling it", which every model understands, and the zod schema
 * turns an absent key into `null` through its defaults — so both variants
 * produce exactly the same `AiReading`.
 *
 * Which one we ship is a measurement, not a preference: the test harness runs
 * both and we keep whichever returns valid JSON more often.
 */
export const AI_JSON_SCHEMA_SIMPLE = {
  type: "object",
  properties: {
    intent: { type: "string", enum: MODEL_INTENTS },
    confidence: { type: "number" },
    language: { type: "string", enum: ["pl", "en"] },
    carNames: { type: "array", items: { type: "string" } },
    segment: {
      type: "string",
      enum: [
        "luxury",
        "executive",
        "premium-suv",
        "electric",
        "business",
        "van",
      ],
    },
    passengers: { type: "integer" },
    dateFrom: { type: "string" },
    dateTo: { type: "string" },
    days: { type: "integer" },
    location: { type: "string" },
    transmission: { type: "string", enum: ["automatic", "manual"] },
    fuel: { type: "string", enum: ["petrol", "diesel", "hybrid", "electric"] },
    rentalType: { type: "string", enum: ["short", "long_term", "business"] },
    wantsCheapest: { type: "boolean" },
  },
  required: ["intent", "confidence", "language"],
} as const;
