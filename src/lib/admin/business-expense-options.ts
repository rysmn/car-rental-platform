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
    label: "Marketing i reklama",
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
    label: "Lokal i parking",
    categories: ["parking", "rent", "utilities", "office"],
  },
  {
    key: "services",
    label: "Usługi i technologia",
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
    label: "Flota — koszty wspólne",
    categories: ["cleaning", "fuel", "tools"],
  },
  {
    key: "people",
    label: "Ludzie",
    categories: ["salary", "contractor", "training"],
  },
  {
    key: "finance",
    label: "Finanse i urząd",
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

export const BUSINESS_EXPENSE_LABEL: Record<BusinessExpenseCategory, string> = {
  ads_google: "Google Ads",
  ads_facebook: "Facebook",
  ads_instagram: "Instagram",
  ads_tiktok: "TikTok",
  marketing_other: "Inny marketing",
  parking: "Parking / garaż",
  rent: "Czynsz biura",
  utilities: "Media (prąd, woda)",
  office: "Biuro — wyposażenie",
  accounting: "Księgowość",
  legal: "Obsługa prawna",
  phone: "Telefony i internet",
  software: "Oprogramowanie",
  domain: "Domena i hosting",
  website: "Strona www",
  cleaning: "Myjnia i sprzątanie",
  fuel: "Paliwo (wspólne)",
  tools: "Narzędzia",
  salary: "Wynagrodzenia",
  contractor: "Zlecenia",
  training: "Szkolenia",
  bank: "Opłaty bankowe",
  insurance: "Ubezpieczenie firmy",
  tax: "Podatki i opłaty",
  zus: "ZUS i składki",
  other: "Inne",
};

export const BUSINESS_GROUP_LABEL: Record<BusinessExpenseGroup, string> =
  Object.fromEntries(
    BUSINESS_EXPENSE_GROUPS.map((g) => [g.key, g.label]),
  ) as Record<BusinessExpenseGroup, string>;

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
