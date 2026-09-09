/**
 * Kategorie dokumentów — bez `server-only`, bo zna je także formularz
 * w przeglądarce. `repo.ts` re-eksportuje je dalej, żeby serwer miał jedno
 * wejście, a lista i tak istniała tylko raz.
 */
export const KATEGORIE = [
  "booking",
  "terms",
  "privacy",
  "handover",
  "consent",
  "form",
  "other",
] as const;

export type Kategoria = (typeof KATEGORIE)[number];

/** `booking` trafia do klienta po potwierdzeniu rezerwacji — punkt 16. */
export const ETYKIETY_KATEGORII: Record<Kategoria, string> = {
  booking: "Przy rezerwacji",
  terms: "Warunki wynajmu",
  privacy: "RODO / prywatność",
  handover: "Protokoły",
  consent: "Zgody",
  form: "Formularze",
  other: "Inne",
};
