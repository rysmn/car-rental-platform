/**
 * Wewnętrzna flaga klienta — etykiety i tony. BEZ bazy, BEZ `server-only`.
 *
 * Wydzielone z tego samego powodu co `payment-options` i `deposit-options`:
 * formularz flagi jest komponentem klienckim, a import z modułu serwerowego
 * wciągnąłby `server-only` do paczki przeglądarki i wywrócił build, podczas gdy
 * TypeScript i ESLint zostałyby zielone.
 */

import { type Bilingual } from "@/lib/i18n-pick";

export const CUSTOMER_FLAGS = ["none", "deposit_only", "blocked"] as const;
export type CustomerFlag = (typeof CUSTOMER_FLAGS)[number];

export const CUSTOMER_FLAG_LABEL: Record<CustomerFlag, Bilingual> = {
  none: { pl: "Bez uwag", en: "No notes" },
  deposit_only: { pl: "Tylko z kaucją", en: "Deposit only" },
  blocked: { pl: "Nie wynajmować", en: "Do not rent" },
};

export const CUSTOMER_FLAG_HINT: Record<CustomerFlag, Bilingual> = {
  none: { pl: "Zwykły klient — nic szczególnego", en: "Regular customer — nothing special" },
  deposit_only: {
    pl: "Wynajem wyłącznie za kaucją, bez wariantu „bez kaucji”",
    en: "Rental only with a deposit, no “no deposit” option",
  },
  blocked: {
    pl: "Nie przyjmować rezerwacji — powód opisz w notatce",
    en: "Do not accept bookings — describe the reason in the note",
  },
};

export const CUSTOMER_FLAG_TONE: Record<CustomerFlag, string> = {
  none: "border-line text-ink-faint",
  deposit_only: "border-amber-400/50 text-amber-400",
  blocked: "bg-red text-white",
};
