/**
 * Damage cases — labels, tones and the two derived numbers. NO database,
 * NO `server-only`: the forms are client components and need all of it.
 */

import { type Bilingual } from "@/lib/i18n-pick";

export const DAMAGE_STATUSES = [
  "reported",
  "assessment",
  "repair",
  "insurer",
  "closed",
] as const;

export type DamageStatus = (typeof DAMAGE_STATUSES)[number];

export const DAMAGE_STATUS_LABEL: Record<DamageStatus, Bilingual> = {
  reported: { pl: "Zgłoszona", en: "Reported" },
  assessment: { pl: "Wycena", en: "Assessment" },
  repair: { pl: "W naprawie", en: "In repair" },
  insurer: { pl: "U ubezpieczyciela", en: "With the insurer" },
  closed: { pl: "Zamknięta", en: "Closed" },
};

export const DAMAGE_STATUS_HINT: Record<DamageStatus, Bilingual> = {
  reported: { pl: "Spisana, nikt jeszcze nie wycenił", en: "Logged, nobody has priced it yet" },
  assessment: {
    pl: "Czeka na kosztorys albo oględziny",
    en: "Waiting for an estimate or an inspection",
  },
  repair: { pl: "Auto w warsztacie", en: "Car is in the workshop" },
  insurer: {
    pl: "Czeka na decyzję ubezpieczyciela — nie na nas",
    en: "Waiting for the insurer's decision — not on us",
  },
  closed: { pl: "Rozliczona i zamknięta", en: "Settled and closed" },
};

/**
 * Amber while the case is ours to push, blue while somebody else holds it,
 * green when it is done. The distinction matters more than it looks: a list
 * that colours "u ubezpieczyciela" the same as "w naprawie" makes an operator
 * chase an adjuster every morning for nothing.
 */
export const DAMAGE_STATUS_TONE: Record<DamageStatus, string> = {
  reported: "bg-red text-white",
  assessment: "border-amber-400/50 text-amber-400",
  repair: "border-amber-400/50 text-amber-400",
  insurer: "border-sky-400/50 text-sky-400",
  closed: "border-emerald-400/50 text-emerald-400",
};

/** Everything except `closed` — what still needs somebody. */
export function isOpen(status: DamageStatus): boolean {
  return status !== "closed";
}

export type DamagePhotoRecord = {
  id: string;
  url: string;
  note: string | null;
};

export type DamageRecord = {
  id: string;
  carId: string;
  car: string;
  plate: string | null;
  reservationId: string | null;
  reference: string | null;
  customerId: string | null;
  customerName: string | null;
  occurredOn: string;
  title: string;
  description: string | null;
  status: DamageStatus;
  repairCostGrosze: number;
  excessGrosze: number;
  insurer: string | null;
  claimNumber: string | null;
  closedAt: string | null;
  createdAt: string;
  photos: DamagePhotoRecord[];
};

/**
 * What A&A is actually out of pocket on a case.
 *
 * With an insurer named, that is the deductible; without one, the whole
 * repair. Written down here rather than in the page, because the fleet's
 * profit-and-loss and the customer's history have to agree on it — two places
 * computing "our share" slightly differently is how a car looks profitable in
 * one screen and not in another.
 */
export function ourCostGrosze(d: {
  insurer: string | null;
  repairCostGrosze: number;
  excessGrosze: number;
}): number {
  return d.insurer?.trim() ? d.excessGrosze : d.repairCostGrosze;
}
