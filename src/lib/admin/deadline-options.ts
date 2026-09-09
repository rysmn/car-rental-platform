/**
 * Client-safe half of the deadline module: the vocabulary and the labels.
 * No database, no `server-only` — the manager component imports this.
 */

export const DEADLINE_KINDS = [
  "fine",
  "damage",
  "deposit_take",
  "deposit_return",
  "prep",
  "other",
] as const;

export type DeadlineKind = (typeof DEADLINE_KINDS)[number];

export const DEADLINE_LABEL: Record<DeadlineKind, string> = {
  fine: "Mandat",
  damage: "Szkoda",
  deposit_take: "Kaucja do pobrania",
  deposit_return: "Kaucja do zwrotu",
  prep: "Przygotowanie auta",
  other: "Inny termin",
};

/** What the operator is supposed to do when it comes due. */
export const DEADLINE_ACTION: Record<DeadlineKind, string> = {
  fine: "Opłać mandat",
  damage: "Domknij szkodę",
  deposit_take: "Pobierz kaucję",
  deposit_return: "Zwróć kaucję",
  prep: "Przygotuj auto",
  other: "Zrób i odhacz",
};

export type DeadlineRow = {
  id: string;
  kind: DeadlineKind;
  title: string;
  dueOn: string;
  amountGrosze: number | null;
  note: string | null;
  doneAt: string | null;
};
