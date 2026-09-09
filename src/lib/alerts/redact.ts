/**
 * Everything an alert carries, with the secrets taken out.
 *
 * This runs at the moment an alert is RECORDED, not at the moment it is
 * displayed, and the difference is the whole point: a token that reaches the
 * `system_alerts` table has already leaked. It is in every nightly dump, in
 * every restore point, and in whatever the operator copies out of the panel to
 * paste into a message. Redacting on the way out would protect the screen and
 * nothing else.
 *
 * Two independent passes, because secrets arrive two ways:
 *
 *   1. **by key** — an object with `password`, `token`, `cookie`, `apiKey`.
 *      The value is dropped whatever it looks like, since a short password and
 *      a car model are the same shape.
 *   2. **by shape** — a bearer token, a `postgres://user:pass@host` URL or a
 *      card-like run of digits inside a free-text error message, where there is
 *      no key to go on.
 *
 * Neither pass is sufficient alone. A stack trace is a string with no keys; a
 * settings object may hold a short secret that matches no pattern.
 *
 * ## What is deliberately NOT redacted
 *
 * Car plates, model names, dates, prices and reservation ids. They are what
 * makes an alert actionable — "rezerwacja WX 1000A na 4–8 września padła" is a
 * report, "rezerwacja [ukryte] padła" is a shrug. None of them is a credential.
 * E-mail addresses ARE masked: they identify a person and an alert never needs
 * one to be actionable.
 */

/** What replaces a redacted value. Recognisable, and obviously not the data. */
export const REDACTED = "[ukryte]";

/**
 * Key names whose value is never shown, matched case-insensitively as a
 * substring so `handoffEmail`, `DATABASE_URL` and `x-api-key` all land.
 *
 * Substring matching over-redacts rather than under-redacts, on purpose: a
 * field called `tokenCount` losing its number costs an operator one detail,
 * and a field called `sessionToken` keeping its value costs an account.
 */
const SECRET_KEYS = [
  "password",
  "passwd",
  "secret",
  "token",
  "cookie",
  "authorization",
  "auth",
  "apikey",
  "api_key",
  "credential",
  "private",
  "session",
  "jwt",
  "bearer",
  "signature",
  "salt",
  "hash",
  "database_url",
  "connectionstring",
  "connection_string",
  "cvv",
  "cvc",
  "pan",
  "cardnumber",
  "card_number",
  "iban",
  "email",
];

const isSecretKey = (key: string): boolean => {
  const k = key.toLowerCase();
  return SECRET_KEYS.some((s) => k.includes(s));
};

/**
 * Patterns applied to every string that survives the key pass.
 *
 * Order matters: the connection string must be caught before the generic
 * long-blob rule, or the rule eats the host name and leaves the password.
 */
const PATTERNS: { re: RegExp; to: string }[] = [
  // postgres://user:password@host — credentials in a URL.
  {
    re: /\b([a-z][a-z0-9+.-]*):\/\/[^\s/@:]+:[^\s/@]+@/gi,
    to: `$1://${REDACTED}@`,
  },
  // Authorization: Bearer xxx / Basic xxx
  { re: /\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, to: `$1 ${REDACTED}` },
  // Cookie headers, including Auth.js's own session cookie by name.
  {
    re: /(__Secure-|__Host-)?authjs\.[a-z-]*token=[^;\s]+/gi,
    to: `authjs.session-token=${REDACTED}`,
  },
  { re: /\b(set-cookie|cookie)\s*[:=]\s*[^\n]+/gi, to: `$1: ${REDACTED}` },
  // `password=...`, `token: "..."` inside a serialised blob or a query string.
  {
    re: /\b(password|passwd|secret|token|api[_-]?key|apikey)\s*[:=]\s*"?[^\s",;&}]+"?/gi,
    to: `$1=${REDACTED}`,
  },
  // A JWT: three base64url segments. Caught by shape because it usually
  // appears bare, in a message, with no key beside it.
  {
    re: /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g,
    to: REDACTED,
  },
  // Card-like digit runs, 13–19 digits with optional spaces or dashes. Written
  // to require a separator or a long unbroken run so a plate, a phone number
  // or an amount in grosze is left alone.
  {
    re: /\b(?:\d[ -]?){12,18}\d\b/g,
    to: REDACTED,
  },
  // E-mail addresses — a person, not a credential, but not needed either.
  {
    re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    to: REDACTED,
  },
];

/**
 * One string: control characters removed, secrets removed, clipped.
 *
 * The control-character pass is not cosmetic. Postgres refuses a `text` value
 * containing a NUL byte outright — `invalid byte sequence for encoding` — and
 * an error message is exactly the kind of string that can carry one: anything
 * that failed while parsing a binary payload, a file, or a truncated network
 * frame ends up with raw bytes in its `message`. Without this, the alert about
 * that failure is itself rejected by the database, and the one incident nobody
 * finds out about is the one whose message was too broken to record. Found by
 * `scripts/test-alerty.ts` feeding a NUL byte in on purpose.
 *
 * Newline and tab survive: they are what makes a multi-line detail readable.
 */
export function redactText(input: string, max = 2000): string {
  let out = String(input).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  for (const { re, to } of PATTERNS) out = out.replace(re, to);
  return out.length > max ? `${out.slice(0, max)}…` : out;
}

/**
 * A value of any shape, cleaned.
 *
 * Depth- and breadth-limited. An error object can carry a whole request, a
 * request can carry the app, and an alert that serialises the app is not an
 * alert — it is an outage of its own. Anything past the limits becomes a
 * marker, which is more honest than a silently truncated object that reads as
 * complete.
 */
export function redactValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return null;
  if (depth > 4) return "[za głęboko]";

  if (typeof value === "string") return redactText(value, 500);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((v) => redactValue(v, depth + 1));
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactText(value.message, 500),
    };
  }

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    let n = 0;
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (n++ >= 30) {
        out["…"] = "[obcięte]";
        break;
      }
      out[k] = isSecretKey(k) ? REDACTED : redactValue(v, depth + 1);
    }
    return out;
  }

  // Functions, symbols, bigints — nothing an alert should be carrying.
  return `[${typeof value}]`;
}

/**
 * An unknown thrown thing, reduced to one readable line.
 *
 * Deliberately drops the stack. A stack is the most useful thing in a log and
 * the least useful thing on a panel an operator reads on a phone in a car park:
 * it is twenty lines of framework internals around one line that matters, and
 * it is also where absolute paths and occasionally a query string with
 * credentials in it end up. The message plus the alert's own module and title
 * is what makes it findable in the container log, which is where the stack
 * still is.
 */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    const cause =
      error.cause instanceof Error ? ` ← ${error.cause.message}` : "";
    return redactText(`${error.name}: ${error.message}${cause}`, 500);
  }
  if (typeof error === "string") return redactText(error, 500);
  try {
    return redactText(JSON.stringify(redactValue(error)), 500);
  } catch {
    return "Nieczytelny błąd";
  }
}
