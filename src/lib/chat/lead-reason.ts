import type { Intent } from "./nlu";
import type { LeadReason } from "@/lib/db/schema";
import type { Bilingual } from "@/lib/i18n-pick";

/**
 * PO CO klient chce rozmawiać z człowiekiem — wyprowadzone z rozmowy, nie
 * z formularza.
 *
 * DLACZEGO TO W OGÓLE ISTNIEJE. Do etapu 44D każdy lead z czatu miał
 * `topic = "chat"` wpisane na sztywno, a `chat_conversations.topic` trzymał
 * intencję OSTATNIEJ wiadomości. To znaczyło dokładnie tyle:
 *
 *     „Potrzebuję 10 aut dla firmy na 12 miesięcy."   → intencja B2B
 *     „Zadzwońcie do mnie."                           → intencja CONTACT_HUMAN
 *
 * i zapytanie firmowe warte roku najmu trafiało do obsługi opisane jako
 * „prośba o kontakt", bo ostatnie zdanie nadpisało pierwsze. Operator widział
 * numer telefonu i nic więcej.
 *
 * Dlatego czytamy CAŁĄ historię intencji rozmowy i wybieramy tę o największym
 * ciężarze handlowym, a nie ostatnią. „Zadzwońcie do mnie" jest sposobem
 * kontaktu, nie tematem sprawy — wygrywa tylko wtedy, gdy nic konkretniejszego
 * w rozmowie nie padło.
 *
 * Czysta funkcja, bez bazy: da się ją przetestować na liście napisów, i test
 * C z etapu 44D robi dokładnie to.
 */

/**
 * Kolejność decyduje. Pierwsza dopasowana wygrywa, więc czytać ją należy jako
 * „co jest ważniejsze, gdy w jednej rozmowie padło jedno i drugie".
 *
 * `EMERGENCY` na górze, bo uszkodzone auto na trasie przestaje być zapytaniem
 * handlowym w chwili, w której się nim staje. `CONTACT_HUMAN` na dole, bo jest
 * prośbą o kanał, a nie o temat.
 */
const BY_PRIORITY: readonly (readonly [LeadReason, readonly Intent[]])[] = [
  ["emergency", ["EMERGENCY"]],
  ["reservation_question", ["MANAGE_BOOKING"]],
  /*
   * PARTNERSTWO bije `non_fleet`, i to jest cała różnica między zapytaniem
   * a ofertą. „Mam Porsche Panamerę, chcę ją wnieść do waszej floty" zawiera
   * model, którego A&A nie ma — czyli sygnał, który sam z siebie ustawia
   * `non_fleet` i opisuje obsłudze sprawę jako „pytał o auto spoza floty".
   * Operator dzwoni wtedy z ofertą wynajmu do kogoś, kto chciał złożyć własną.
   */
  ["partnership", ["PARTNERSHIP"]],
  /* Miejsce, w które wchodzi `non_fleet` — patrz `reasonFromIntents`. */
  ["b2b", ["B2B"]],
  ["long_term", ["LONG_TERM"]],
  ["booking_help", ["START_BOOKING"]],
  [
    "rules_question",
    ["ABROAD", "DOCUMENTS", "DRIVER_AGE", "NEEDS_STAFF_CONFIRMATION"],
  ],
  ["price_offer", ["GET_PRICE"]],
  [
    "car_enquiry",
    ["FIND_CAR", "CHECK_AVAILABILITY", "COMPARE_CARS", "BROWSE_FLEET"],
  ],
  ["human_request", ["CONTACT_HUMAN"]],
];

/**
 * Wybierz temat sprawy z intencji zapisanych przy wiadomościach klienta.
 *
 * @param intents Intencje w kolejności dowolnej — liczy się ciężar, nie czas.
 * @param askedForCarWeDoNotHave Rozmowa dotyczyła auta, którego A&A nie ma we
 *   flocie. Sygnał spoza listy intencji, bo „Szukam Mercedesa V-Class" jest
 *   intencją FIND_CAR dokładnie tak samo jak „Szukam SUV-a" — różnicę widać
 *   wyłącznie po tym, czy coś się znalazło. To jest zapytanie warte oddzwonienia
 *   nawet wtedy, gdy w tej rozmowie nie padło ani jedno inne słowo kluczowe,
 *   więc bije wszystko poza sprawami pilnymi i sprawami istniejącej rezerwacji.
 */
export function reasonFromIntents(
  intents: readonly string[],
  askedForCarWeDoNotHave = false,
): LeadReason {
  const seen = new Set(intents);
  const matches = ([, intentsFor]: (typeof BY_PRIORITY)[number]) =>
    intentsFor.some((i) => seen.has(i));

  /*
   * Sprawa pilna, pytanie o istniejącą rezerwację i PARTNERSTWO biją auto
   * spoza floty:
   * klient z uszkodzonym autem, który po drodze wspomniał o V-Class, dzwoni
   * w sprawie szkody. Reszta listy przegrywa z `non_fleet`, bo „nie mamy tego
   * modelu" jest konkretniejsze niż „pytał o auto".
   */
  const [above, below] = [BY_PRIORITY.slice(0, 3), BY_PRIORITY.slice(3)];

  for (const entry of above) if (matches(entry)) return entry[0];
  if (askedForCarWeDoNotHave) return "non_fleet";
  for (const entry of below) if (matches(entry)) return entry[0];

  return "general";
}

/**
 * Czy ta rozmowa jest warta miejsca w skrzynce.
 *
 * REGUŁA ETAPU 44D, wprost z zamówienia: „Jakie macie samochody?" NIE tworzy
 * zgłoszenia. Sama ciekawość nie jest zapytaniem sprzedażowym i skrzynka
 * zasypana ciekawością przestaje być czytana w tydzień.
 *
 * Zwraca `false` dla rozmów, które kończą się na przeglądaniu, powitaniu albo
 * pytaniu o godziny otwarcia. Uwaga: to jest sprawdzane DODATKOWO, obok
 * jedynego prawdziwego warunku — klient musiał wcisnąć przycisk i zostawić
 * kontakt. Bez tego naciśnięcia nie ma wiersza, cokolwiek ta funkcja zwróci.
 */
const CURIOSITY_ONLY: readonly Intent[] = [
  "GREETING",
  "BROWSE_FLEET",
  "OPENING_HOURS",
  "UNKNOWN",
  "OUT_OF_SCOPE",
  "FAQ",
  "HOW_TO_RENT",
  "GET_DEPOSIT",
  "GET_MILEAGE_LIMIT",
  "AIRPORT",
  "PICKUP_POINT",
];

export function worthAnInboxEntry(
  intents: readonly string[],
  askedForCarWeDoNotHave = false,
): boolean {
  if (askedForCarWeDoNotHave) return true;
  return intents.some((i) => !CURIOSITY_ONLY.includes(i as Intent));
}

/** Napisy dla panelu. Osobno od `lib/inbox/labels`, bo to słownik czatu. */
export const REASON_LABEL: Record<LeadReason, Bilingual> = {
  human_request: { pl: "Prośba o kontakt", en: "Request for contact" },
  b2b: { pl: "Zapytanie firmowe", en: "Business enquiry" },
  long_term: { pl: "Wynajem długoterminowy", en: "Long-term rental" },
  non_fleet: { pl: "Auto spoza floty", en: "Car outside the fleet" },
  car_enquiry: { pl: "Pytanie o samochód", en: "Question about a car" },
  booking_help: { pl: "Pomoc przy rezerwacji", en: "Help with a reservation" },
  price_offer: { pl: "Wycena indywidualna", en: "Individual quote" },
  rules_question: { pl: "Warunki wynajmu", en: "Rental terms" },
  emergency: { pl: "Sprawa pilna", en: "Urgent matter" },
  partnership: { pl: "Partnerstwo / inwestycja", en: "Partnership / investment" },
  reservation_question: { pl: "Pytanie do rezerwacji", en: "Question about a reservation" },
  general: { pl: "Zapytanie ogólne", en: "General enquiry" },
};
