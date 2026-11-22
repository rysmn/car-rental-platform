import type { Bilingual } from "@/lib/i18n-pick";

// Client-safe expense categories + Polish labels. No server imports, so the
// entry form, the analytics charts and the server actions all read one list.

/**
 * Expense categories, in the order they appear in the picker.
 *
 * Grouped by WHEN the money goes out, because that is the distinction the
 * economics page is built on:
 *
 *   · `wear`     — servicing and repairs. Roughly proportional to use.
 *   · `standing` — insurance, leasing, tax, parking. These accrue every single
 *                  day the car is owned, rented or not. They are what makes an
 *                  idle day cost money rather than merely earn none, and they
 *                  are the basis of the "postojowe" figure.
 *   · `running`  — fuel, cleaning and the rest. Incurred per rental.
 *
 * Keep in sync with the `expense_category` enum in `lib/db/schema` — the enum is
 * the constraint, this is the presentation.
 */
export const EXPENSE_GROUPS = [
  {
    key: "wear",
    label: { pl: "Serwis i naprawy", en: "Servicing and repairs" },
    categories: [
      "oil",
      "filters",
      "tyres",
      "brakes",
      "service",
      "mechanical",
      "electrical",
      "bodywork",
      "inspection",
    ],
  },
  {
    key: "standing",
    label: { pl: "Koszty stałe", en: "Fixed costs" },
    categories: ["insurance", "leasing", "tax", "parking"],
  },
  {
    key: "running",
    label: { pl: "Eksploatacja", en: "Operating costs" },
    categories: ["fuel", "cleaning", "equipment", "fine", "other"],
  },
] as const;

export type ExpenseGroup = (typeof EXPENSE_GROUPS)[number]["key"];

export const EXPENSE_CATEGORIES = EXPENSE_GROUPS.flatMap(
  (g) => g.categories,
) as readonly ExpenseCategory[];

export type ExpenseCategory =
  (typeof EXPENSE_GROUPS)[number]["categories"][number];

export const EXPENSE_LABEL: Record<ExpenseCategory, Bilingual> = {
  oil: { pl: "Olej / wymiana oleju", en: "Oil / oil change" },
  filters: { pl: "Filtry", en: "Filters" },
  tyres: { pl: "Opony", en: "Tyres" },
  brakes: { pl: "Hamulce", en: "Brakes" },
  service: { pl: "Przegląd okresowy", en: "Scheduled service" },
  mechanical: { pl: "Naprawa mechaniczna", en: "Mechanical repair" },
  electrical: { pl: "Naprawa elektryczna", en: "Electrical repair" },
  bodywork: { pl: "Blacharka / lakier", en: "Bodywork / paint" },
  inspection: { pl: "Badanie techniczne", en: "Technical inspection" },
  insurance: { pl: "Ubezpieczenie OC/AC", en: "Insurance (liability/comprehensive)" },
  leasing: { pl: "Rata leasingu / kredytu", en: "Lease / loan instalment" },
  tax: { pl: "Podatki i opłaty", en: "Taxes and fees" },
  parking: { pl: "Parking / garaż", en: "Parking / garage" },
  fuel: { pl: "Paliwo / ładowanie", en: "Fuel / charging" },
  cleaning: { pl: "Mycie / detailing", en: "Washing / detailing" },
  equipment: { pl: "Wyposażenie", en: "Equipment" },
  fine: { pl: "Mandaty i kary", en: "Fines and penalties" },
  other: { pl: "Inne", en: "Other" },
};

/** Which group a category belongs to — the reverse of `EXPENSE_GROUPS`. */
export const EXPENSE_GROUP_OF = Object.fromEntries(
  EXPENSE_GROUPS.flatMap((g) => g.categories.map((c) => [c, g.key])),
) as Record<ExpenseCategory, ExpenseGroup>;

export const EXPENSE_GROUP_LABEL = Object.fromEntries(
  EXPENSE_GROUPS.map((g) => [g.key, g.label]),
) as Record<ExpenseGroup, Bilingual>;

export function isExpenseCategory(v: unknown): v is ExpenseCategory {
  return (
    typeof v === "string" &&
    (EXPENSE_CATEGORIES as readonly string[]).includes(v)
  );
}
