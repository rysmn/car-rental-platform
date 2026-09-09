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
    label: "Serwis i naprawy",
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
    label: "Koszty stałe",
    categories: ["insurance", "leasing", "tax", "parking"],
  },
  {
    key: "running",
    label: "Eksploatacja",
    categories: ["fuel", "cleaning", "equipment", "fine", "other"],
  },
] as const;

export type ExpenseGroup = (typeof EXPENSE_GROUPS)[number]["key"];

export const EXPENSE_CATEGORIES = EXPENSE_GROUPS.flatMap(
  (g) => g.categories,
) as readonly ExpenseCategory[];

export type ExpenseCategory =
  (typeof EXPENSE_GROUPS)[number]["categories"][number];

export const EXPENSE_LABEL: Record<ExpenseCategory, string> = {
  oil: "Olej / wymiana oleju",
  filters: "Filtry",
  tyres: "Opony",
  brakes: "Hamulce",
  service: "Przegląd okresowy",
  mechanical: "Naprawa mechaniczna",
  electrical: "Naprawa elektryczna",
  bodywork: "Blacharka / lakier",
  inspection: "Badanie techniczne",
  insurance: "Ubezpieczenie OC/AC",
  leasing: "Rata leasingu / kredytu",
  tax: "Podatki i opłaty",
  parking: "Parking / garaż",
  fuel: "Paliwo / ładowanie",
  cleaning: "Mycie / detailing",
  equipment: "Wyposażenie",
  fine: "Mandaty i kary",
  other: "Inne",
};

/** Which group a category belongs to — the reverse of `EXPENSE_GROUPS`. */
export const EXPENSE_GROUP_OF = Object.fromEntries(
  EXPENSE_GROUPS.flatMap((g) => g.categories.map((c) => [c, g.key])),
) as Record<ExpenseCategory, ExpenseGroup>;

export const EXPENSE_GROUP_LABEL = Object.fromEntries(
  EXPENSE_GROUPS.map((g) => [g.key, g.label]),
) as Record<ExpenseGroup, string>;

export function isExpenseCategory(v: unknown): v is ExpenseCategory {
  return (
    typeof v === "string" &&
    (EXPENSE_CATEGORIES as readonly string[]).includes(v)
  );
}
