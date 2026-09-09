/**
 * What leaves our server, and what does not.
 *
 * The assistant's job for the AI layer is to work out what the customer MEANT.
 * That never requires a phone number, an e-mail address or a licence number, so
 * none of them go. This runs on every message before the network call, and it
 * is deliberately blunt: a false positive costs the model a little context, a
 * false negative sends somebody's personal data to a third party.
 *
 * Pure and dependency-free so it can be tested directly — see
 * `scripts/test-sanitize.ts`, which asserts both halves of the job: that the
 * personal data goes, and that the enquiry survives.
 *
 * Note what is NOT here, because it does not need to be: existing customer
 * records, reservation contents and admin data. The AI layer is only ever
 * handed the visitor's own typed message — there is no code path that could
 * put a stored customer into a prompt.
 */

export type Sanitised = {
  text: string;
  /** Which categories were found — logged as counts only, never the values. */
  removed: string[];
};

/**
 * Polish and international phone numbers as people actually type them:
 * "600 100 200", "+48 600-100-200", "600100200", "(22) 123 45 67".
 *
 * Seven digits is the floor. Below that a run of digits is far more likely to
 * be a date, a price or a car model than a phone number, and eating those would
 * blind the parser to the very things it needs.
 */
const PHONE_RE =
  /(?:(?:\+|00)\d{1,3}[\s.-]?)?(?:\(\d{1,4}\)[\s.-]?)?\d(?:[\s.-]?\d){6,}/g;

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

/** PESEL — exactly eleven digits standing alone. */
const PESEL_RE = /\b\d{11}\b/g;

/** Polish ID / passport / driving licence: three letters then six digits. */
const DOCUMENT_RE = /\b[A-Z]{2,3}\s?\d{5,7}\b/g;

/** Card-like: 13–19 digits in groups. Never legitimate in a chat message. */
const CARD_RE = /\b(?:\d[ -]?){13,19}\b/g;

/** IBAN, Polish and general. */
const IBAN_RE = /\b[A-Z]{2}\d{2}(?:[ ]?\d{4}){2,7}\b/g;

/**
 * Street addresses — "ul. Marszałkowska 12/34", "al. Jerozolimskie 5".
 *
 * Only the number is dropped, not the street word: a customer writing "odbiór
 * na Marszałkowskiej" is telling us something useful about pickup, and cutting
 * the street name would lose it. A flat number tells us nothing.
 */
const ADDRESS_RE =
  /\b(?:ul\.?|ulica|al\.?|aleja|os\.?|osiedle|pl\.?|plac)\s+[\p{L}.-]+\s+\d+[a-z]?(?:\/\d+[a-z]?)?/giu;

/**
 * Credentials somebody pasted into a chat box.
 *
 * Two shapes: a prefixed key ("sk-…", "Bearer …", "api_key=…") and a bare
 * opaque string — twenty-four characters or more containing letters AND digits,
 * which is what a token looks like and what no Polish word or car name ever
 * does. Requiring both classes is what keeps "Highline" and "Marszałkowska"
 * out of it.
 */
const API_KEY_RE =
  /\b(?:sk|pk|rk|api[_-]?key|apikey|token|bearer|secret)[-_= ]?[A-Za-z0-9_-]{16,}\b/gi;

const OPAQUE_SECRET_RE =
  /\b(?=[A-Za-z0-9_-]*[A-Za-z])(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{24,}\b/g;

/**
 * A name, but only where the sentence says it is one.
 *
 * The blunt version of this rule — "any capitalised word" — would eat "Volvo",
 * "Gdańsku" and "Model X", which is why it was left out originally. The
 * contextual version is safe because the trigger phrase does the identifying:
 * after "nazywam się" comes a name, never a car. The trigger itself survives so
 * the model still sees that an introduction happened.
 *
 * Case is spelled out per letter rather than using the `i` flag on purpose:
 * with `i`, `\p{Lu}` stops meaning "uppercase" in JavaScript and the rule would
 * match lowercase words too.
 *
 * The trigger accepts "sie" as well as "się". Half of Polish visitors type
 * without diacritics — this file's neighbours say so about every other rule —
 * and "Nazywam sie Jan Kowalski" was sailing through untouched, into the
 * transcript and into the model prompt, while the spelling with the ogonek was
 * caught. A privacy rule that only works for people who type carefully is not
 * a privacy rule.
 */
const NAME_RE =
  /\b(nazywam si[eę]|Nazywam si[eę]|mam na imi[eę]|Mam na imi[eę]|jestem|Jestem|my name is|My name is|i am|I am|i'm|I'm|this is|This is)\s+(\p{Lu}\p{Ll}+(?:\s+\p{Lu}\p{Ll}+)?)/gu;

const RULES: { label: string; re: RegExp; token: string }[] = [
  // Order matters: e-mail before phone, or the digits inside an address like
  // "jan.kowalski7@…" would be mangled first and the address left behind.
  { label: "email", re: EMAIL_RE, token: "[e-mail]" },
  // Keys before every digit rule: a token containing a 13-digit run must be
  // masked as a key, not chopped up as a card number and left half-readable.
  { label: "klucz", re: API_KEY_RE, token: "[klucz]" },
  { label: "klucz", re: OPAQUE_SECRET_RE, token: "[klucz]" },
  { label: "iban", re: IBAN_RE, token: "[numer konta]" },
  { label: "karta", re: CARD_RE, token: "[numer karty]" },
  { label: "pesel", re: PESEL_RE, token: "[numer]" },
  { label: "adres", re: ADDRESS_RE, token: "[adres]" },
  { label: "telefon", re: PHONE_RE, token: "[telefon]" },
  { label: "dokument", re: DOCUMENT_RE, token: "[dokument]" },
  // Last: the name rule keeps its trigger phrase ("$1"), and running it after
  // the digit rules means "Jestem Jan, tel 600100200" has already lost the
  // number by the time we get here.
  { label: "imię", re: NAME_RE, token: "$1 [imię]" },
];

/**
 * Dates, in every shape a visitor writes them.
 *
 * These are pulled out of harm's way before anything else runs and put back
 * afterwards. Without this, "2026-09-01" is eight digits with separators —
 * exactly what a phone number looks like — and the date the whole booking
 * depends on would be masked away. Protecting them here beats teaching every
 * other rule what a date is.
 *
 * Found by the test suite, not by reading the code: the phone rule had been
 * eating ISO dates since it was written.
 *
 * The slash form is only recognised with a year ("10/09/2026"). Two numbers
 * around a bare slash is the shape of a flat number — "ul. Marszałkowska 12/34"
 * — and parking that as a date would smuggle it straight past the address rule.
 */
const DATE_LIKE_RE =
  /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[.-]\d{1,2}(?:[.-]\d{2,4})?|\d{1,2}\/\d{1,2}\/\d{2,4})\b/g;

/**
 * Placeholder wrapper for a parked date.
 *
 * A control character, built with `fromCharCode` rather than an escape so the
 * intent survives copy-paste. No rule above matches it and no visitor types it,
 * so a parked date cannot be confused with the "9" in "9 osób" on the way back.
 */
const MARK = String.fromCharCode(1);

/**
 * Strip personal data from a visitor's message before it goes to a model.
 *
 * Returns the masked text plus which categories were hit, so the admin panel
 * can report "sanitised 12 messages today" without ever storing what was in
 * them.
 */
export function sanitizeAIInput(input: string): Sanitised {
  const dates: string[] = [];
  let text = input.replace(DATE_LIKE_RE, (match) => {
    dates.push(match);
    return `${MARK}${dates.length - 1}${MARK}`;
  });

  const removed: string[] = [];

  for (const rule of RULES) {
    // Regexes carry /g, so lastIndex has to be reset between calls or every
    // second message would be scanned from halfway through.
    rule.re.lastIndex = 0;
    if (rule.re.test(text)) {
      rule.re.lastIndex = 0;
      text = text.replace(rule.re, rule.token);
      // Two rules share the "klucz" label; the caller wants categories, not hits.
      if (!removed.includes(rule.label)) removed.push(rule.label);
    }
  }

  // Dates come back exactly as the visitor wrote them.
  text = text.replace(
    new RegExp(`${MARK}(\\d+)${MARK}`, "g"),
    (_, index: string) => dates[Number(index)] ?? "",
  );

  /**
   * Names are stripped only where the sentence announces one.
   *
   * There is no reliable way to tell "Kowalski" from "Kowalskiego 5" or from a
   * car trim level without a name list, and a blanket "mask every capitalised
   * word" rule would delete car names — the single most important token in the
   * sentence. So `NAME_RE` leans on the trigger phrase instead: whatever
   * follows "nazywam się" is a name, and nothing else is guessed at.
   *
   * That leaves a bare "Jan Kowalski, poproszę o kontakt" untouched, and it is
   * an accepted limit rather than an oversight: the lead form collects names
   * outside the model, the message is discarded after the call, and widening
   * the rule would cost us the car names the parser depends on. If this ever
   * has to be airtight, the answer is a name list, not a cleverer regex.
   *
   * The `dokument` rule above is the reason `sanitizeAIInput` runs before the
   * car-name lookup and not after: "ABC 123456" must be masked, "RAV4" must
   * not, and the digit floor is what separates them.
   */

  return { text: text.trim(), removed };
}

/** True when the message still contains something that looks personal. */
export function looksSensitive(input: string): boolean {
  return sanitizeAIInput(input).removed.length > 0;
}

/**
 * The subset that must never be written to the database — see K-5 in
 * `docs/RAPORT-CHATBOT-AUDYT.md`.
 *
 * A national ID, a card number, a bank account, an identity-document number and
 * anything shaped like a credential. Nobody at A&A needs these to answer a
 * question about a car, and the audit found all of them sitting in
 * `chat_messages` in full, readable to anyone with the admin panel open.
 *
 * Note what is NOT here, on the owner's instruction of 2026-08-20: telephone
 * numbers, e-mail addresses, names and street addresses stay as written. Those
 * are how a customer asks to be called back, an operator reading the history
 * needs to see them, and the lead form collects them deliberately, with
 * consent. Masking a number the customer WANTS us to call would be losing
 * information, not protecting it.
 *
 * Separate from `sanitizeAIInput` on purpose: that one runs before a message
 * crosses the network to a third party, where the right instinct is to strip
 * everything and lose a little context. This one runs before a message is
 * stored by its own recipient, where the balance is different.
 */
const STORAGE_LABELS = new Set(["pesel", "karta", "iban", "dokument", "klucz"]);

/**
 * Irreversible: the masked text is what gets stored, and the original is not
 * kept anywhere. That is the point — data we never wrote down needs no
 * retention rule, no access control and no deletion on request.
 */
export function sanitizeForStorage(input: string): Sanitised {
  const dates: string[] = [];
  let text = input.replace(DATE_LIKE_RE, (match) => {
    dates.push(match);
    return `${MARK}${dates.length - 1}${MARK}`;
  });

  const removed: string[] = [];
  for (const rule of RULES) {
    if (!STORAGE_LABELS.has(rule.label)) continue;
    rule.re.lastIndex = 0;
    if (rule.re.test(text)) {
      rule.re.lastIndex = 0;
      text = text.replace(rule.re, rule.token);
      if (!removed.includes(rule.label)) removed.push(rule.label);
    }
  }

  text = text.replace(
    new RegExp(`${MARK}(\\d+)${MARK}`, "g"),
    (_, index: string) => dates[Number(index)] ?? "",
  );

  return { text: text.trim(), removed };
}
