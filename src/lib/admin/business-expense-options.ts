import type { Bilingual } from "@/lib/i18n-pick";

// Client-safe company-cost vocabulary + Polish labels. No server imports, so
// the entry form, the Finanse charts and the server actions all read one list.

/**
 * Company cost categories, in the order they appear in the picker.
 *
 * Grouped by WHAT THE MONEY BUYS, because that is the question the Finanse page
 * is built to answer — "ile kosztuje mnie sprzedaż" and "ile kosztuje mnie samo
 * istnienie firmy" are different questions with different answers:
 *
 *   · `marketing` — buys phone calls. Should rise when revenue rises; if it
 *                   rises while revenue does not, that is the finding.
 *   · `premises`  — the roof over the fleet and the desk.
 *   · `services`  — the accountant, the phones, the website. Mostly monthly.
 *   · `fleet`     — fleet costs no single car owns. Anything attributable to a
 *                   registration plate belongs at the car, in Flota, or that
 *                   car's margin is a lie.
 *   · `people`    — wages and contractors.
 *   · `finance`   — the bank and the state.
 *
 * Keep in sync with the `business_expense_category` enum in `lib/db/schema` —
 * the enum is the constraint, this is the presentation.
 */
export const BUSINESS_EXPENSE_GROUPS = [
  {
    key: "marketing",
    label: { pl: "Marketing i reklama", en: "Marketing and advertising" },
    categories: [
      "ads_google",
      "ads_facebook",
      "ads_instagram",
      "ads_tiktok",
      "marketing_other",
    ],
  },
  {
    key: "premises",
    label: { pl: "Lokal i parking", en: "Premises and parking" },
    categories: ["parking", "rent", "utilities", "office"],
  },
  {
    key: "services",
    label: { pl: "Usługi i technologia", en: "Services and technology" },
    categories: [
      "accounting",
      "legal",
      "phone",
      "software",
      "domain",
      "website",
    ],
  },
  {
    key: "fleet",
    label: { pl: "Flota — koszty wspólne", en: "Fleet — shared costs" },
    categories: ["cleaning", "fuel", "tools"],
  },
  {
    key: "people",
    label: { pl: "Ludzie", en: "People" },
    categories: ["salary", "contractor", "training"],
  },
  {
    key: "finance",
    label: { pl: "Finanse i urząd", en: "Finance and tax office" },
    categories: ["bank", "insurance", "tax", "zus", "other"],
  },
] as const;

export type BusinessExpenseGroup =
  (typeof BUSINESS_EXPENSE_GROUPS)[number]["key"];

export const BUSINESS_EXPENSE_CATEGORIES = BUSINESS_EXPENSE_GROUPS.flatMap(
  (g) => g.categories,
) as unknown as [BusinessExpenseCategory, ...BusinessExpenseCategory[]];

export type BusinessExpenseCategory =
  (typeof BUSINESS_EXPENSE_GROUPS)[number]["categories"][number];

export const BUSINESS_EXPENSE_LABEL: Record<BusinessExpenseCategory, Bilingual> = {
  ads_google: { pl: "Google Ads", en: "Google Ads" },
  ads_facebook: { pl: "Facebook", en: "Facebook" },
  ads_instagram: { pl: "Instagram", en: "Instagram" },
  ads_tiktok: { pl: "TikTok", en: "TikTok" },
  marketing_other: { pl: "Inny marketing", en: "Other marketing" },
  parking: { pl: "Parking / garaż", en: "Parking / garage" },
  rent: { pl: "Czynsz biura", en: "Office rent" },
  utilities: { pl: "Media (prąd, woda)", en: "Utilities (power, water)" },
  office: { pl: "Biuro — wyposażenie", en: "Office — equipment" },
  accounting: { pl: "Księgowość", en: "Accounting" },
  legal: { pl: "Obsługa prawna", en: "Legal services" },
  phone: { pl: "Telefony i internet", en: "Phone and internet" },
  software: { pl: "Oprogramowanie", en: "Software" },
  domain: { pl: "Domena i hosting", en: "Domain and hosting" },
  website: { pl: "Strona www", en: "Website" },
  cleaning: { pl: "Myjnia i sprzątanie", en: "Car wash and cleaning" },
  fuel: { pl: "Paliwo (wspólne)", en: "Fuel (shared)" },
  tools: { pl: "Narzędzia", en: "Tools" },
  salary: { pl: "Wynagrodzenia", en: "Salaries" },
  contractor: { pl: "Zlecenia", en: "Contractors" },
  training: { pl: "Szkolenia", en: "Training" },
  bank: { pl: "Opłaty bankowe", en: "Bank fees" },
  insurance: { pl: "Ubezpieczenie firmy", en: "Company insurance" },
  tax: { pl: "Podatki i opłaty", en: "Taxes and fees" },
  zus: { pl: "ZUS i składki", en: "ZUS and social contributions" },
  other: { pl: "Inne", en: "Other" },
};

export const BUSINESS_GROUP_LABEL: Record<BusinessExpenseGroup, Bilingual> =
  Object.fromEntries(
    BUSINESS_EXPENSE_GROUPS.map((g) => [g.key, g.label]),
  ) as Record<BusinessExpenseGroup, Bilingual>;

/** Which group a category belongs to — built once, read by every total. */
export const BUSINESS_GROUP_OF = Object.fromEntries(
  BUSINESS_EXPENSE_GROUPS.flatMap((g) =>
    g.categories.map((c) => [c, g.key] as const),
  ),
) as Record<BusinessExpenseCategory, BusinessExpenseGroup>;

export function isBusinessExpenseCategory(
  v: unknown,
): v is BusinessExpenseCategory {
  return (
    typeof v === "string" &&
    (BUSINESS_EXPENSE_CATEGORIES as readonly string[]).includes(v)
  );
}
