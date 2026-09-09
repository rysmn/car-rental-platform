import "server-only";
import { z } from "zod";
import {
  DRIVER_CLASSES,
  type DriverClass,
} from "@/lib/fleet/driver-class";
import {
  FALLBACK_MIN_AGE,
  LICENCE_TENURE_ENFORCEABLE,
} from "@/lib/booking/driver-age-floor";

export {
  FALLBACK_MIN_AGE,
  LICENCE_TENURE_ENFORCEABLE,
} from "@/lib/booking/driver-age-floor";

/**
 * The rental rules, as the company has decided them — and, just as importantly,
 * as it has NOT yet decided them.
 *
 * This module exists because the audit of 2026-08-20 found the same rule living
 * in four places at once: a sentence in the marketing FAQ, a different sentence
 * generated for the assistant, a keyword list in the parser, and a constant the
 * booking form validates against. That is how customers were told a child seat
 * costs 30 zł while the form charged 40. One rule, one home, four readers.
 *
 * The direction of travel is fixed and has no exceptions:
 *
 *     Admin  →  site_settings.rentalRules  →  FAQ page
 *                                          →  assistant
 *                                          →  (later) Voice
 *
 * Nothing downstream carries its own copy of a rule. A handler asks what the
 * status is and either gets approved words or gets nothing — and "nothing" is a
 * complete, safe answer: refer the customer to a person.
 */

/* ── Status ──────────────────────────────────────────────────────────────── */

/**
 * Three states, and the middle one is the reason this file exists.
 *
 * `active` — the owner approved wording; the assistant may state it.
 * `needs_decision` — nobody has decided; the assistant must not guess.
 * `disabled` — deliberately switched off; the assistant must not state it, and
 *   must not state the opposite either.
 *
 * Note what `disabled` is NOT. It does not mean "the answer is no". The owner
 * set this out on 2026-08-20: OFF means "do not confirm this, refer to A&A".
 * A bot that turned OFF into "we do not accept mObywatel" would be inventing a
 * company policy from a switch, which is the exact failure this whole exercise
 * removed.
 */
export const RULE_STATUSES = ["active", "needs_decision", "disabled"] as const;
export type RuleStatus = (typeof RULE_STATUSES)[number];

export const STATUS_LABEL: Record<RuleStatus, string> = {
  active: "AKTYWNA",
  needs_decision: "WYMAGA DECYZJI",
  disabled: "WYŁĄCZONA",
};

/* ── Shapes ──────────────────────────────────────────────────────────────── */

/** Who changed a rule and when. Kept per rule, not per settings row. */
const stampSchema = z.object({
  updatedAt: z.string().nullable().default(null),
  updatedBy: z.string().max(200).nullable().default(null),
});

/**
 * A switch that answers "may we say this?", never "is this true?".
 *
 * Off is the safe default for every one of them, because an unset switch and a
 * deliberately-off switch lead to the same behaviour: say nothing, refer.
 */
const toggleSchema = stampSchema.extend({
  enabled: z.boolean().default(false),
});

const documentsSchema = z.object({
  mobywatel: toggleSchema.default({
    enabled: false,
    updatedAt: null,
    updatedBy: null,
  }),
  cardInDriverName: toggleSchema.default({
    enabled: false,
    updatedAt: null,
    updatedBy: null,
  }),
  nonEuLicence: toggleSchema
    .extend({ notes: z.string().max(2000).default("") })
    .default({ enabled: false, notes: "", updatedAt: null, updatedBy: null }),
});

/**
 * One requirement, one switch, one number.
 *
 * `required` answers "does this requirement apply?", which is NOT what the
 * switches in the documents section answer ("may we say this?"). The two
 * semantics sit on the same page, so the field is deliberately not called
 * `enabled` and the panel labels it OBOWIĄZUJE / NIE OBOWIĄZUJE rather than
 * ON / OFF.
 *
 * `years` keeps its value while the switch is off. The number is then a
 * proposal an administrator can edit, not a rule: nothing outside the panel
 * ever reads it, because every reader goes through `effectiveDriverLimits`,
 * which ignores a requirement that is switched off.
 */
const ageRequirementSchema = stampSchema.extend({
  required: z.boolean().default(false),
  years: z.number().int().min(16).max(99).nullable().default(null),
});

const licenceRequirementSchema = stampSchema.extend({
  required: z.boolean().default(false),
  years: z.number().int().min(0).max(50).nullable().default(null),
});

const driverClassRuleSchema = z.object({
  /** Shown in the panel and quoted to customers — editable, unlike the key. */
  label: z.string().max(80),
  /** Display order in the panel. */
  order: z.number().int().min(1).max(99),
  minAge: ageRequirementSchema.default(() => ageRequirementSchema.parse({})),
  licence: licenceRequirementSchema.default(() =>
    licenceRequirementSchema.parse({}),
  ),
});

export type DriverClassRule = z.infer<typeof driverClassRuleSchema>;

const classDefault = (
  label: string,
  order: number,
  age: number | null,
  licence: number | null,
) => ({
  label,
  order,
  minAge: { required: age !== null, years: age, updatedAt: null, updatedBy: null },
  licence: {
    required: licence !== null,
    years: licence,
    updatedAt: null,
    updatedBy: null,
  },
});

/**
 * The three classes and the values the owner approved on 2026-08-21.
 *
 * Age: Standard 21, Premium 25, Van / Bus 25 — all three switched on.
 *
 * Licence tenure: OFF in every class, with no number at all. The owner's
 * instruction of 2026-08-21, and the reason is worth keeping next to the code:
 * the booking form does not collect the date a licence was issued, so a tenure
 * rule cannot be verified by anything except a member of staff at handover.
 * Announcing it on the site while the system cannot check it is exactly the
 * gap between what we say and what we do that this whole module exists to
 * close. See `LICENCE_TENURE_ENFORCEABLE` below.
 *
 * These are defaults in the schema, not constants in the code: the moment an
 * administrator saves the section, the stored row wins and this block is never
 * read again. They exist so a fresh database starts in the state the owner
 * approved rather than in an empty one — and so nothing downstream ever has to
 * invent a number when a key is missing.
 */
const driverClassesSchema = z.object({
  standard: driverClassRuleSchema.default(() =>
    classDefault("Standard", 1, 21, null),
  ),
  premium: driverClassRuleSchema.default(() =>
    classDefault("Premium", 2, 25, null),
  ),
  van_bus: driverClassRuleSchema.default(() =>
    classDefault("Van / Bus", 3, 25, null),
  ),
});

/**
 * The one switch that decides whether class thresholds ABOVE the safety floor
 * reach the booking form.
 *
 * Separate from the per-class switches, and separate on purpose: stating a rule
 * on the site is one level of risk, refusing a reservation because of it is
 * another. What it can never do is switch the age check off — see
 * `FALLBACK_MIN_AGE`. Off means "21 everywhere, exactly as the form behaved
 * before this module existed"; on means "each class applies its own number,
 * never lower than 21".
 */
const enforcementSchema = stampSchema.extend({
  inBookingForm: z.boolean().default(false),
});

const driverAgeSchema = stampSchema.extend({
  classes: driverClassesSchema.default(() => driverClassesSchema.parse({})),
  enforcement: enforcementSchema.default(() => enforcementSchema.parse({})),
  notes: z.string().max(2000).default(""),
});

const abroadSchema = stampSchema.extend({
  /**
   * Approved by the owner on 2026-08-20 and recorded as Z-1 in
   * `docs/ZASADY-BIZNESOWE.md`. Read-only in the panel: the wording is the
   * decision, and an editable field here would invite it to drift from the
   * document that records it.
   */
  status: z.enum(RULE_STATUSES).default("active"),
});

const excessSchema = stampSchema.extend({
  status: z.enum(RULE_STATUSES).default("needs_decision"),
  /** Grosze, like every other amount in this codebase. Null = not decided. */
  amountGrosze: z.number().int().min(0).nullable().default(null),
  /** "per model", "flat", "tied to the deposit" — free text until decided. */
  scope: z.string().max(200).default(""),
  notes: z.string().max(2000).default(""),
});

const emergencySchema = stampSchema.extend({
  status: z.enum(RULE_STATUSES).default("needs_decision"),
  phone: z.string().max(40).nullable().default(null),
  phoneAlt: z.string().max(40).nullable().default(null),
  procedure: z.string().max(4000).default(""),
});

/**
 * Every section defaults to "the empty version of itself", built by running the
 * section's own schema over `{}` so each field's default applies. Spelling the
 * defaults out a second time here would be two places to keep in step, and the
 * second one would be the one that rots.
 */
export const rentalRulesSchema = z.object({
  documents: documentsSchema.default(() => documentsSchema.parse({})),
  driverAge: driverAgeSchema.default(() => driverAgeSchema.parse({})),
  abroad: abroadSchema.default(() => abroadSchema.parse({})),
  excess: excessSchema.default(() => excessSchema.parse({})),
  emergency: emergencySchema.default(() => emergencySchema.parse({})),
});

export type RentalRules = z.infer<typeof rentalRulesSchema>;

export const RENTAL_RULES_DEFAULT: RentalRules = rentalRulesSchema.parse({});

/* ── The rule that is always on ──────────────────────────────────────────── */

/**
 * True whatever the switches say, which is why it is a constant and not a row.
 *
 * There is no configuration in which a driver may collect a car without a
 * licence and something that proves who they are, so there is nothing here for
 * an administrator to get wrong.
 */
export const DOCUMENTS_BASE_RULE = {
  pl: "Przy odbiorze pojazdu kierowca musi posiadać ważne prawo jazdy odpowiedniej kategorii oraz ważny dokument tożsamości.",
  en: "When collecting the vehicle, the driver must hold a valid driving licence of the appropriate category and a valid identity document.",
} as const;

/**
 * Rule Z-1, worded once.
 *
 * Imported by the FAQ builder, by the assistant's `abroad` handler and by the
 * panel, so all three quote the same sentence. Before this constant existed the
 * wording lived in two files and had already drifted once — the FAQ said "Tak,
 * po wcześniejszym uzgodnieniu", which reads as consent already given, while
 * the rule says the opposite.
 *
 * There is no list of permitted countries here, and there must never be one.
 * The owner's decision is that no destination is approved in advance; a list in
 * the code would eventually be read as one.
 */
export const ABROAD_RULE = {
  pl: {
    short:
      "Pojazd A&A Corporation przeznaczony jest do użytkowania na terytorium Polski. Wyjazd za granicę wymaga uprzedniej, wyraźnej pisemnej zgody A&A Corporation, udzielonej przed wyjazdem i wpisanej do umowy najmu albo do aneksu podpisanego przed przekroczeniem granicy. Bez takiej zgody wyjazd jest zabroniony — dotyczy to każdego kraju.",
    faq: "Pojazd przeznaczony jest do użytkowania na terytorium Polski. Wyjazd za granicę wymaga uprzedniej, wyraźnej pisemnej zgody A&A Corporation oraz spełnienia warunków wskazanych przez A&A dla konkretnego pojazdu i najmu, w tym wynikających z zakresu ubezpieczenia i Assistance. Zgodę uzyskasz, kontaktując się z nami przed wynajmem — wyjazd zostaje wtedy wpisany do umowy najmu albo do aneksu podpisanego przed przekroczeniem granicy. Zgoda ustna, sama rozmowa telefoniczna ani brak odpowiedzi z naszej strony nie oznaczają zgody.",
    noConsent:
      "Nie mogę udzielić takiej zgody ani potwierdzić żadnego kierunku. Skontaktuj się z A&A — opiekun ustali warunki, a udzielona zgoda zostaje wpisana do umowy najmu albo do aneksu podpisanego przed przekroczeniem granicy.",
    silence:
      "Ważne: brak odpowiedzi ze strony A&A, zgoda ustna ani sama rozmowa telefoniczna nie oznaczają zgody na wyjazd.",
    question: "Czy mogę wyjechać za granicę?",
  },
  en: {
    short:
      "An A&A Corporation vehicle is intended for use within Poland. Travel abroad requires A&A Corporation's prior express written consent, given before departure and recorded in the rental agreement or in an annex signed before the border is crossed. Without such consent, travel abroad is not permitted — this applies to every country.",
    faq: "The vehicle is intended for use within Poland. Travel abroad requires A&A Corporation's prior express written consent and compliance with the conditions A&A sets for the specific vehicle and rental, including those arising from the scope of insurance and Assistance. Contact us before the rental to obtain it — the trip is then recorded in the rental agreement or in an annex signed before the border is crossed. Oral consent, a phone call on its own, or no reply from us does not mean consent has been given.",
    noConsent:
      "I cannot grant that consent or confirm any destination. Please contact A&A — someone will agree the terms, and any consent given is recorded in the rental agreement or in an annex signed before the border is crossed.",
    silence:
      "Important: no reply from A&A, oral consent, or a phone call on its own does not mean consent has been given.",
    question: "Can I take the car abroad?",
  },
} as const;

/* ── Driver age and licence tenure ───────────────────────────────────────── */

/**
 * The thresholds that actually apply to a car, after every switch and floor.
 *
 * `minAge` is never null: there is always a minimum, because there is always
 * the floor. `minLicenceYears` is null while tenure cannot be verified, and
 * null means "no requirement" — never zero, and never "anyone may drive".
 */
export type DriverLimits = {
  minAge: number;
  minLicenceYears: number | null;
};

const configured = (r: unknown): number | null => {
  if (!r || typeof r !== "object") return null;
  const { required, years } = r as { required?: unknown; years?: unknown };
  if (required !== true) return null;
  return typeof years === "number" && Number.isFinite(years) ? years : null;
};

/**
 * What the panel has stored for one class, before the floor is applied.
 *
 * For the panel only — it is what an administrator typed, which is not the
 * same thing as what the system does. Everything outside the panel reads
 * `effectiveDriverLimits`.
 */
export function configuredLimits(
  rules: RentalRules,
  cls: DriverClass,
): { minAge: number | null; minLicenceYears: number | null } {
  const rule = rules.driverAge.classes[cls];
  return {
    minAge: configured(rule?.minAge),
    minLicenceYears: configured(rule?.licence),
  };
}

/**
 * What applies to a car of this class — the single reader for every consumer.
 *
 * Booking form, FAQ, landing pages and the assistant all come through here, so
 * a switch cannot mean one thing in the form and another in the chat, and the
 * site cannot advertise a threshold the backend does not apply.
 *
 * Written to survive nonsense rather than to trust its input. `rules` is typed,
 * but it arrives from a JSONB column that a bad migration, a hand-edited row or
 * a future schema change could leave in any shape at all; `getSetting` returns
 * defaults instead of throwing, which means a malformed row reaches this
 * function looking ordinary. Every path that cannot produce a number produces
 * `FALLBACK_MIN_AGE`, and an unassigned car (`cls === null`) is one of them:
 * a car nobody classified is not a car with no rules.
 */
export function effectiveDriverLimits(
  rules: RentalRules | null | undefined,
  cls: DriverClass | null,
): DriverLimits {
  const floor: DriverLimits = {
    minAge: FALLBACK_MIN_AGE,
    minLicenceYears: null,
  };
  try {
    if (!rules?.driverAge) return floor;
    if (rules.driverAge.enforcement?.inBookingForm !== true) return floor;
    if (!cls) return floor;

    const { minAge, minLicenceYears } = configuredLimits(rules, cls);
    return {
      // Never below the floor, whatever the panel holds.
      minAge: Math.max(FALLBACK_MIN_AGE, minAge ?? 0),
      minLicenceYears: LICENCE_TENURE_ENFORCEABLE ? minLicenceYears : null,
    };
  } catch {
    return floor;
  }
}

/** Are class thresholds above the floor reaching the booking form? */
export const driverRulesEnforced = (rules: RentalRules): boolean =>
  rules.driverAge.enforcement.inBookingForm === true;

/**
 * Do the classes actually differ in what they demand?
 *
 * Used to decide whether a general page says one number or names the classes.
 * With enforcement off they never differ — every class is at the floor.
 */
export function driverClassesDiffer(rules: RentalRules): boolean {
  const ages = DRIVER_CLASSES.map((c) => effectiveDriverLimits(rules, c).minAge);
  return new Set(ages).size > 1;
}

/**
 * Derived, not stored.
 *
 * Always active: there is always a minimum age, because there is always the
 * floor. A stored status field would be a second switch next to real ones, and
 * the first thing to fall out of step with them.
 */
export function driverAgeStatus(): RuleStatus {
  return "active";
}

/** "21 lat", "22 lata" — Polish needs the plural to agree with the number. */
function lataPl(n: number): string {
  const last = n % 10;
  const teen = n % 100 >= 12 && n % 100 <= 14;
  return !teen && last >= 2 && last <= 4 ? "lata" : "lat";
}

/**
 * One set of limits, in words. Exported for the assistant, which resolves a
 * car to its limits first and only then needs a sentence — an unassigned car
 * sits at the floor, and quoting a class it does not belong to would be a
 * different number from the one the form would apply.
 */
export function driverLimitsSentence(
  limits: DriverLimits,
  locale: string,
): string {
  return oneClassSentence(limits, pick(locale));
}

function oneClassSentence(l: DriverLimits, lang: Lang): string {
  if (lang === "en") {
    return l.minLicenceYears !== null
      ? `The minimum driver age is ${l.minAge}, with a driving licence held for at least ${l.minLicenceYears} year${l.minLicenceYears === 1 ? "" : "s"}.`
      : `The minimum driver age is ${l.minAge}.`;
  }
  return l.minLicenceYears !== null
    ? `Minimalny wiek kierowcy to ${l.minAge} ${lataPl(l.minAge)}, a prawo jazdy trzeba mieć od co najmniej ${l.minLicenceYears} ${lataPl(l.minLicenceYears)}.`
    : `Minimalny wiek kierowcy to ${l.minAge} ${lataPl(l.minAge)}.`;
}

function classClause(
  cls: DriverClass,
  l: DriverLimits,
  rules: RentalRules,
  lang: Lang,
): string {
  const label = rules.driverAge.classes[cls]?.label ?? cls;
  const parts: string[] =
    lang === "en"
      ? [`${l.minAge} years of age`]
      : [`ukończone ${l.minAge} ${lataPl(l.minAge)}`];
  if (l.minLicenceYears !== null) {
    parts.push(
      lang === "en"
        ? `a licence held for at least ${l.minLicenceYears} year${l.minLicenceYears === 1 ? "" : "s"}`
        : `prawo jazdy od co najmniej ${l.minLicenceYears} ${lataPl(l.minLicenceYears)}`,
    );
  }
  return `${label} — ${parts.join(lang === "en" ? " and " : " i ")}`;
}

/**
 * The lowest age that applies anywhere in the fleet, or the age for one class.
 *
 * The number a landing page prints. Always a number, never null — see
 * `FALLBACK_MIN_AGE` — so copy can put it mid-sentence without a branch for
 * "no rule", a state that cannot occur.
 */
export function driverMinAge(
  rules: RentalRules,
  scope: DriverClass | "all" = "all",
): number {
  if (scope !== "all") return effectiveDriverLimits(rules, scope).minAge;
  return Math.min(
    ...DRIVER_CLASSES.map((c) => effectiveDriverLimits(rules, c).minAge),
  );
}

/**
 * The one sentence about driver age, written once and read by the landing
 * pages, the FAQ and the assistant.
 *
 * `scope` is a class when the page or the question is about one kind of car,
 * and "all" when it is not. When every class sits at the same number the
 * sentence is short; when they differ it names the classes rather than quoting
 * the lowest number and letting a customer discover the rest at the counter.
 *
 * Reads `effectiveDriverLimits`, which is the whole point: the sentence a
 * customer reads is generated from the same value the booking form refuses on,
 * so the site cannot promise 21 while the form demands 25, nor advertise 25
 * while the form lets a 22-year-old through.
 */
export function driverAgeSentence(
  rules: RentalRules,
  locale: string,
  scope: DriverClass | "all" = "all",
): string {
  const lang = pick(locale);

  if (scope !== "all") {
    return oneClassSentence(effectiveDriverLimits(rules, scope), lang);
  }

  if (!driverClassesDiffer(rules)) {
    return oneClassSentence(effectiveDriverLimits(rules, "standard"), lang);
  }

  const clauses = DRIVER_CLASSES.map((c) =>
    classClause(c, effectiveDriverLimits(rules, c), rules, lang),
  );
  return lang === "en"
    ? `The requirements depend on the class of car: ${clauses.join("; ")}.`
    : `Wymagania zależą od klasy samochodu: ${clauses.join("; ")}.`;
}

/**
 * The extra sentence a GENERAL page needs when the classes differ.
 *
 * A page about the whole fleet prints the lowest age (`driverMinAge`) inside
 * its own prose; on its own that would be true for a RAV4 and false for a
 * Panamera. This adds the missing half. Empty when every class sits at the
 * same number — then the page is already complete and a second sentence would
 * invent a distinction that does not exist.
 */
export function driverAgeNote(rules: RentalRules, locale: string): string {
  if (!driverClassesDiffer(rules)) return "";
  const lang = pick(locale);
  const base = driverMinAge(rules, "all");
  const higher = DRIVER_CLASSES.filter(
    (c) => effectiveDriverLimits(rules, c).minAge > base,
  ).map((c) => {
    const label = rules.driverAge.classes[c]?.label ?? c;
    return `${label} — ${effectiveDriverLimits(rules, c).minAge}`;
  });
  return lang === "en"
    ? ` A higher minimum applies to some classes of car: ${higher.join(", ")}.`
    : ` Przy części klas samochodów obowiązuje wyższy próg: ${higher.join(", ")}.`;
}

/* ── Reading rules ───────────────────────────────────────────────────────── */

type Lang = "pl" | "en";
const pick = (locale: string): Lang => (locale === "en" ? "en" : "pl");

/** A switch is only "yes" when it is on AND somebody turned it on. */
const on = (t: { enabled: boolean }) => t.enabled === true;

/**
 * What the assistant may say about documents, in order.
 *
 * The base rule always leads. Each switch adds a sentence only when it is on;
 * an off switch adds nothing at all — not a denial, not a hedge, nothing. What
 * the customer then does with a question the list does not cover is the
 * caller's business, and every caller sends them to a person.
 */
export function documentsStatements(
  rules: RentalRules,
  locale: string,
): string[] {
  const lang = pick(locale);
  const out: string[] = [DOCUMENTS_BASE_RULE[lang]];
  const d = rules.documents;

  if (on(d.mobywatel)) {
    out.push(
      lang === "en"
        ? "A digital identity document in the mObywatel app is accepted as proof of identity."
        : "Dokument tożsamości w aplikacji mObywatel jest akceptowany.",
    );
  }
  if (on(d.cardInDriverName)) {
    out.push(
      lang === "en"
        ? "A payment card issued in the driver's name is required."
        : "Wymagana jest karta płatnicza wystawiona na imię i nazwisko kierowcy.",
    );
  }
  if (on(d.nonEuLicence)) {
    const extra = d.nonEuLicence.notes.trim();
    out.push(
      lang === "en"
        ? `A driving licence issued outside the EU is accepted.${extra ? ` ${extra}` : ""}`
        : `Prawo jazdy wydane poza Unią Europejską jest akceptowane.${extra ? ` ${extra}` : ""}`,
    );
  }
  return out;
}

/** Is there anything approved to say about documents beyond the base rule? */
export function hasDocumentDetail(rules: RentalRules): boolean {
  const d = rules.documents;
  return on(d.mobywatel) || on(d.cardInDriverName) || on(d.nonEuLicence);
}

/**
 * The FAQ entries the rules produce — the fourth source merged by
 * `getMergedFaq`, alongside the static entries, the price-backed ones and
 * anything an administrator has published.
 *
 * Only `active` rules contribute. A rule awaiting a decision produces no entry
 * rather than an entry saying "we don't know", because the FAQ page is read by
 * people who are not asking a question and have no use for a list of gaps.
 */
export function rulesToFaq(
  rules: RentalRules,
  locale: string,
): { q: string; a: string }[] {
  const lang = pick(locale);
  const out: { q: string; a: string }[] = [];

  out.push({
    q: lang === "en" ? "What documents do I need?" : "Jakie dokumenty są potrzebne?",
    a: documentsStatements(rules, locale).join(" "),
  });

  if (rules.abroad.status === "active") {
    out.push({
      q: ABROAD_RULE[lang].question,
      a: ABROAD_RULE[lang].faq,
    });
  }

  /**
   * One entry for driver age and licence tenure, covering every class that has
   * a requirement switched on. Nothing at all when nothing is switched on —
   * an FAQ that says "the minimum age has not been decided" would be worse
   * than no entry, and the assistant would then quote it.
   */
  const ageSentence = driverAgeSentence(rules, locale, "all");
  if (ageSentence) {
    const extra = rules.driverAge.notes.trim();
    out.push({
      q:
        lang === "en"
          ? "What is the minimum age to rent?"
          : "Ile trzeba mieć lat, żeby wynająć auto?",
      a: ageSentence + (extra ? ` ${extra}` : ""),
    });
  }

  if (rules.excess.status === "active" && rules.excess.amountGrosze !== null) {
    const amount = new Intl.NumberFormat(lang === "en" ? "en-GB" : "pl-PL").format(
      Math.round(rules.excess.amountGrosze / 100),
    );
    const extra = rules.excess.notes.trim();
    out.push({
      q:
        lang === "en"
          ? "What is the insurance excess?"
          : "Jaki jest udział własny w szkodzie?",
      a:
        (lang === "en"
          ? `The excess is ${amount} zł.`
          : `Udział własny wynosi ${amount} zł.`) + (extra ? ` ${extra}` : ""),
    });
  }

  return out;
}

/* ── Panel summary ───────────────────────────────────────────────────────── */

export type RuleSummary = {
  key: string;
  title: string;
  status: RuleStatus;
  detail: string;
};

/** One line per section, for the counters at the top of the panel. */
export function summarise(rules: RentalRules): RuleSummary[] {
  const d = rules.documents;
  const switches = [d.mobywatel, d.cardInDriverName, d.nonEuLicence].filter(on)
    .length;
  return [
    {
      key: "documents",
      title: "Dokumenty kierowcy",
      // The base rule is always in force, so this section is never "undecided".
      status: "active",
      detail:
        switches === 0
          ? "Zasada podstawowa obowiązuje. Żaden z trzech przełączników nie jest włączony."
          : `Zasada podstawowa obowiązuje. Włączone przełączniki: ${switches} z 3.`,
    },
    {
      key: "driverAge",
      title: "Wiek kierowcy i staż prawa jazdy",
      status: driverAgeStatus(),
      detail: driverRulesEnforced(rules)
        ? `Progi klas egzekwowane w formularzu: ${DRIVER_CLASSES.map(
            (c) =>
              `${rules.driverAge.classes[c]?.label ?? c} ${effectiveDriverLimits(rules, c).minAge}`,
          ).join(", ")} lat.`
        : `Formularz odrzuca poniżej ${FALLBACK_MIN_AGE} lat (próg bezpieczeństwa). Progi klas nie są jeszcze egzekwowane.`,
    },
    {
      key: "abroad",
      title: "Wyjazdy zagraniczne",
      status: rules.abroad.status,
      detail: "Zasada Z-1, zatwierdzona 20.08.2026. Bez listy krajów dozwolonych.",
    },
    {
      key: "excess",
      title: "Udział własny / szkody",
      status: rules.excess.status,
      detail:
        rules.excess.amountGrosze === null
          ? "Brak zatwierdzonej kwoty."
          : `Zatwierdzone: ${Math.round(rules.excess.amountGrosze / 100)} zł.`,
    },
    {
      key: "emergency",
      title: "Wypadek i awaria",
      status: rules.emergency.status,
      detail: rules.emergency.phone
        ? `Numer: ${rules.emergency.phone}`
        : "Brak numeru pomocy drogowej i procedury.",
    },
  ];
}
