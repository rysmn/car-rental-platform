/**
 * Damage cases — labels, tones and the two derived numbers. NO database,
 * NO `server-only`: the forms are client components and need all of it.
 */

export const DAMAGE_STATUSES = [
  "reported",
  "assessment",
  "repair",
  "insurer",
  "closed",
] as const;

export type DamageStatus = (typeof DAMAGE_STATUSES)[number];

export const DAMAGE_STATUS_LABEL: Record<DamageStatus, string> = {
  reported: "Zgłoszona",
  assessment: "Wycena",
  repair: "W naprawie",
  insurer: "U ubezpieczyciela",
  closed: "Zamknięta",
};

export const DAMAGE_STATUS_HINT: Record<DamageStatus, string> = {
  reported: "Spisana, nikt jeszcze nie wycenił",
  assessment: "Czeka na kosztorys albo oględziny",
  repair: "Auto w warsztacie",
  insurer: "Czeka na decyzję ubezpieczyciela — nie na nas",
  closed: "Rozliczona i zamknięta",
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
