/**
 * Wewnętrzna flaga klienta — etykiety i tony. BEZ bazy, BEZ `server-only`.
 *
 * Wydzielone z tego samego powodu co `payment-options` i `deposit-options`:
 * formularz flagi jest komponentem klienckim, a import z modułu serwerowego
 * wciągnąłby `server-only` do paczki przeglądarki i wywrócił build, podczas gdy
 * TypeScript i ESLint zostałyby zielone.
 */

export const CUSTOMER_FLAGS = ["none", "deposit_only", "blocked"] as const;
export type CustomerFlag = (typeof CUSTOMER_FLAGS)[number];

export const CUSTOMER_FLAG_LABEL: Record<CustomerFlag, string> = {
  none: "Bez uwag",
  deposit_only: "Tylko z kaucją",
  blocked: "Nie wynajmować",
};

export const CUSTOMER_FLAG_HINT: Record<CustomerFlag, string> = {
  none: "Zwykły klient — nic szczególnego",
  deposit_only: "Wynajem wyłącznie za kaucją, bez wariantu „bez kaucji”",
  blocked: "Nie przyjmować rezerwacji — powód opisz w notatce",
};

export const CUSTOMER_FLAG_TONE: Record<CustomerFlag, string> = {
  none: "border-line text-ink-faint",
  deposit_only: "border-amber-400/50 text-amber-400",
  blocked: "bg-red text-white",
};
