import type { Bilingual } from "@/lib/i18n-pick";

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

export const DEADLINE_LABEL: Record<DeadlineKind, Bilingual> = {
  fine: { pl: "Mandat", en: "Fine" },
  damage: { pl: "Szkoda", en: "Damage" },
  deposit_take: { pl: "Kaucja do pobrania", en: "Deposit to collect" },
  deposit_return: { pl: "Kaucja do zwrotu", en: "Deposit to refund" },
  prep: { pl: "Przygotowanie auta", en: "Car preparation" },
  other: { pl: "Inny termin", en: "Other deadline" },
};

/** What the operator is supposed to do when it comes due. */
export const DEADLINE_ACTION: Record<DeadlineKind, Bilingual> = {
  fine: { pl: "Opłać mandat", en: "Pay the fine" },
  damage: { pl: "Domknij szkodę", en: "Close the damage claim" },
  deposit_take: { pl: "Pobierz kaucję", en: "Collect the deposit" },
  deposit_return: { pl: "Zwróć kaucję", en: "Refund the deposit" },
  prep: { pl: "Przygotuj auto", en: "Prepare the car" },
  other: { pl: "Zrób i odhacz", en: "Do it and tick it off" },
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
