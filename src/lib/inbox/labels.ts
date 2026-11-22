import type { LeadStatus, RequestSource } from "@/lib/db/schema";
import type { Bilingual } from "@/lib/i18n-pick";

/**
 * Napisy skrzynki — w module BEZ `"use client"`, i to jest cała sztuczka.
 *
 * Pierwsza wersja trzymała `SOURCE_LABEL` w `InboxItem.tsx`, czyli w module
 * klienckim, i importowała go do serwerowej strony listy. Kod się kompilował,
 * `tsc` nie miał nic do powiedzenia, a strona renderowała się bez błędu —
 * tylko cały rząd filtrów źródeł BYŁ PUSTY. Powód: eksport z modułu
 * `"use client"` widziany od strony serwera nie jest obiektem, lecz
 * referencją do komponentu klienckiego, więc `Object.entries()` na nim
 * zwraca zero par i pętla nie ma po czym chodzić.
 *
 * Usterka bez komunikatu i bez błędu w konsoli — jedyne, co ją zdradzało,
 * to brakujący fragment interfejsu. Dlatego wspólne stałe mieszkają tutaj,
 * a nie w żadnym z dwóch komponentów.
 */

export const SOURCE_LABEL: Record<RequestSource, Bilingual> = {
  chat: { pl: "Asystent", en: "Assistant" },
  b2b: { pl: "Firma", en: "Company" },
  car: { pl: "Samochód", en: "Car" },
  contact: { pl: "Formularz", en: "Form" },
  reservation: { pl: "Rezerwacja", en: "Reservation" },
};

/**
 * Statusy istnieją od etapu 19 i są dokładnie te, których używa panel czatu.
 * Nie dorabiamy do nich drugiego zestawu „na skrzynkę": dwa słowniki na jedną
 * kolumnę rozjeżdżają się przy pierwszej zmianie.
 *
 * W 44D doszły DWA, i to jedyne dwa, których w tym zestawie brakowało:
 *
 *   `waiting_customer` — obsługa odpisała, piłka jest po stronie klienta.
 *                        Bez tego sprawa czekająca na odpowiedź klienta
 *                        wygląda tak samo jak sprawa nietknięta, więc operator
 *                        trzeci raz z rzędu otwiera ją, żeby przypomnieć sobie,
 *                        że już dzwonił.
 *   `spam`             — śmieć. Osobno od `closed`, bo „załatwione" i „to nie
 *                        był klient" to dwie różne rzeczy i tylko drugiej
 *                        z nich nie wolno wliczać do statystyk zapytań.
 */
export const STATUS_LABEL: Record<LeadStatus, Bilingual> = {
  new: { pl: "Nowa", en: "New" },
  contact: { pl: "W kontakcie", en: "In contact" },
  waiting_customer: { pl: "Czeka na klienta", en: "Waiting for customer" },
  offer: { pl: "Oferta wysłana", en: "Offer sent" },
  reservation: { pl: "Rezerwacja", en: "Reservation" },
  closed: { pl: "Zamknięta", en: "Closed" },
  spam: { pl: "Spam", en: "Spam" },
};

/** Ten sam słownik w formie listy — do pól wyboru, gdzie liczy się kolejność. */
export const STATUS_OPTIONS = (
  Object.entries(STATUS_LABEL) as [LeadStatus, Bilingual][]
).map(([value, label]) => ({ value, label }));

/**
 * Statusy, które znaczą „ta sprawa jest z głowy".
 *
 * Jedno miejsce, bo pytanie „czy to jeszcze wisi" zadaje licznik w nagłówku,
 * wyszukiwanie duplikatu przy zapisie i widok domyślny listy. Trzy kopie tego
 * warunku rozjechałyby się przy pierwszym nowym statusie — a właśnie dwa
 * doszły.
 */
export const SETTLED_STATUSES: readonly LeadStatus[] = ["closed", "spam"];

/** Czego zapytanie dotyczy — patrz `lib/chat/lead-reason`. */
export { REASON_LABEL } from "@/lib/chat/lead-reason";
