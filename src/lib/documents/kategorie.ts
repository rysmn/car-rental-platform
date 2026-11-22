/**
 * Kategorie dokumentów — bez `server-only`, bo zna je także formularz
 * w przeglądarce. `repo.ts` re-eksportuje je dalej, żeby serwer miał jedno
 * wejście, a lista i tak istniała tylko raz.
 */
import { type Bilingual } from "@/lib/i18n-pick";

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
export const ETYKIETY_KATEGORII: Record<Kategoria, Bilingual> = {
  booking: { pl: "Przy rezerwacji", en: "At booking" },
  terms: { pl: "Warunki wynajmu", en: "Rental terms" },
  privacy: { pl: "RODO / prywatność", en: "GDPR / privacy" },
  handover: { pl: "Protokoły", en: "Handover protocols" },
  consent: { pl: "Zgody", en: "Consents" },
  form: { pl: "Formularze", en: "Forms" },
  other: { pl: "Inne", en: "Other" },
};
