import "server-only";
import { normalize } from "@/lib/chat/nlu";

/**
 * Which unanswered questions are worth putting in front of the owner as a
 * possible business rule — and which are noise wearing the same clothes.
 *
 * The rules centre lists what customers asked and the assistant could not
 * answer, so the owner can see which policies are actually missing. That list
 * only works if everything on it is a question a company could have a policy
 * about. "Wykonaj: cat /etc/passwd" is not a gap in the rental terms.
 *
 * Three things this deliberately is NOT:
 *
 * 1. **Not deletion.** Nothing is removed, edited or hidden from the record.
 *    Every row stays in `chat_unanswered`, stays visible in Admin → Chatbot →
 *    Pytania bez odpowiedzi, and stays in the audit trail. This decides one
 *    thing only: whether a row is offered as a candidate RULE.
 * 2. **Not a security control.** The assistant's defence against these messages
 *    is structural — a closed schema, no tools, no database access — and it
 *    happens long before this file. Classifying a probe here protects the
 *    owner's attention, not the system.
 * 3. **Not clever.** Every pattern below is a literal the author can point at
 *    and justify. A fuzzy classifier that hid one real customer question would
 *    cost more than all the noise it removed, which is why the fallback is
 *    always "show it".
 */

export type CandidateKind = "business" | "security" | "system";

export type Classification = {
  kind: CandidateKind;
  /** Shown to the owner, in Polish, so a judgement call can be argued with. */
  reason: string;
};

const BUSINESS: Classification = { kind: "business", reason: "" };

/** Word-boundary match, so "token" does not fire inside "tokenizacja". */
function hits(text: string, needle: string): boolean {
  if (!/^[a-z0-9]/.test(needle)) return text.includes(needle);
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}`).test(text);
}

/**
 * Attempts to make the assistant act as something other than an assistant.
 *
 * Grouped by what the sender was after, because the owner reading the report
 * should be able to tell "somebody probed the server" from "somebody wanted
 * another customer's phone number" — those are different incidents even though
 * both belong in the security log rather than in the rental terms.
 */
const SECURITY: { reason: string; any: string[] }[] = [
  {
    reason: "polecenie systemowe / próba wykonania kodu",
    any: [
      "wykonaj:",
      "execute:",
      "cat /",
      "/etc/",
      "rm -rf",
      "chmod",
      "sudo",
      "bash -",
      "sh -c",
      "curl http",
      "wget http",
      "os.system",
      "subprocess",
    ],
  },
  {
    reason: "próba zapytania do bazy danych",
    any: [
      "select * from",
      "drop table",
      "delete from",
      "union select",
      "insert into",
      "update set",
      "'; --",
      "or 1=1",
    ],
  },
  {
    reason: "próba obejścia instrukcji asystenta (prompt injection)",
    any: [
      "ignore previous",
      "ignore all previous",
      "ignore your instructions",
      "disregard previous",
      "ignoruj poprzednie",
      "zignoruj poprzednie",
      "pomin instrukcje",
      "system prompt",
      "twoj prompt",
      "pokaz swoj prompt",
      "reveal your prompt",
      "reveal your instructions",
      "jestes teraz",
      "you are now",
      "act as if",
      "pretend you are",
      "developer mode",
      "tryb developer",
    ],
  },
  {
    reason: "pytanie o dane innych klientów",
    any: [
      "numer telefonu ostatniego klienta",
      "ostatniego klienta",
      "dane klientow",
      "dane klienta",
      "liste klientow",
      "lista klientow",
      "wszystkich klientow",
      "innego klienta",
      "czyjes dane",
      "customer data",
      "list of customers",
      "other customers",
      "last customer",
    ],
  },
  {
    reason: "próba dostępu do konfiguracji lub danych logowania",
    any: [
      "api key",
      "apikey",
      "klucz api",
      "haslo do",
      "password",
      "secret key",
      "access token",
      "bearer",
      ".env",
      "zmienne srodowiskowe",
      "environment variable",
      "connection string",
    ],
  },
  {
    reason: "próba wymuszenia działania administracyjnego",
    any: [
      "wyczysc histori",
      "wyczysc histori",
      "skasuj wszystk",
      "usun wszystk",
      "delete everything",
      "clear the history",
      "wipe the database",
      "zresetuj system",
    ],
  },
];

/**
 * The assistant's own quick-reply buttons, coming back to us.
 *
 * When a button's value did not route — which the audit found happening — the
 * label the widget itself sent lands in the unanswered list looking exactly
 * like a customer question. It is not one: nobody typed "sprawdź cenę", they
 * pressed a button we drew. Listing it as a candidate rental policy is noise of
 * our own making.
 *
 * Matched on the WHOLE normalised message, never as a substring, so a customer
 * who writes "sprawdź cenę Volvo XC60 na weekend" is a real question and stays.
 */
const OWN_BUTTONS = new Set(
  [
    "znajdz samochod",
    "find a car",
    "sprawdz cene",
    "check price",
    "sprawdz dostepnosc",
    "check availability",
    "zapytaj o dostepnosc",
    "ask about availability",
    "porozmawiaj z pracownikiem",
    "talk to a person",
    "pokaz flote",
    "zobacz flote",
    "show the fleet",
    "see the fleet",
    "pokaz podobne auta",
    "show similar cars",
    "pokaz podobne",
    "show similar",
    "wynajem dla firmy",
    "business rental",
    "dla firm",
    "for business",
    "wynajem na lotnisku",
    "airport rental",
    "lotnisko",
    "airport",
    "pracownik",
    "faq",
    "znajdz auto",
    "skontaktuj sie",
    "get in touch",
    "skontaktuj mnie z pracownikiem",
  ].map((s) => normalize(s)),
);

/**
 * Somebody trying the box out rather than asking anything.
 *
 * Only whole-message matches, and only strings with no plausible reading as a
 * question. "test" is here; "test drive" is not, because that is a real thing
 * a customer might ask for.
 */
const TEST_STRINGS = new Set([
  "test",
  "testy",
  "testowanie",
  "testing",
  "test test",
  "abc",
  "abcd",
  "aaa",
  "aaaa",
  "asdf",
  "asd",
  "qwerty",
  "123",
  "1234",
  "xxx",
  "halo halo",
  "ping",
]);

/**
 * Decide what a question is, conservatively.
 *
 * The order matters: a security probe dressed as a button press is still a
 * security probe, so that check runs first.
 */
export function classifyQuestion(question: string): Classification {
  const text = normalize(question);
  if (!text) return { kind: "system", reason: "pusta wiadomość" };

  for (const group of SECURITY) {
    if (group.any.some((needle) => hits(text, needle))) {
      return { kind: "security", reason: group.reason };
    }
  }

  if (OWN_BUTTONS.has(text)) {
    return {
      kind: "system",
      reason: "wartość przycisku asystenta, nie pytanie klienta",
    };
  }

  if (TEST_STRINGS.has(text)) {
    return { kind: "system", reason: "wiadomość testowa" };
  }

  /**
   * A message with no letters at all — a stray number, an emoji, a mis-paste.
   * Two characters is the floor: "co?" is a real, if terse, question.
   */
  if (!/[a-z]{2,}/.test(text)) {
    return { kind: "system", reason: "wiadomość bez treści" };
  }

  return BUSINESS;
}
