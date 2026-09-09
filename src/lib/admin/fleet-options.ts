// Client-safe enum values + Polish labels for the fleet editor. No server imports
// so both the form components and the server actions can share the source of truth.

import type { EditableSegment } from "@/lib/fleet/segments";

export const CATEGORIES = ["suv", "sedan", "van"] as const;
export const GEARBOXES = ["automatic", "manual"] as const;
export const FUELS = ["petrol", "diesel", "hybrid", "electric"] as const;
export const CAR_STATUSES = [
  "available",
  "rented",
  "service",
  "damaged",
] as const;

/**
 * The turnaround chain, IN ORDER: kontrola → mycie → tankowanie → gotowy.
 *
 * The order is load-bearing, not cosmetic — `nextPrepStatus` walks this array,
 * so re-sorting it silently rewires the "→ następny krok" button in the panel.
 */
export const PREP_STATUSES = [
  "inspection",
  "cleaning",
  "fueling",
  "ready",
] as const;

export type Category = (typeof CATEGORIES)[number];
export type Gearbox = (typeof GEARBOXES)[number];
export type Fuel = (typeof FUELS)[number];
export type CarStatus = (typeof CAR_STATUSES)[number];
export type PrepStatus = (typeof PREP_STATUSES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  suv: "SUV",
  sedan: "Sedan",
  van: "Van",
};

export const GEARBOX_LABEL: Record<Gearbox, string> = {
  automatic: "Automatyczna",
  manual: "Manualna",
};

export const FUEL_LABEL: Record<Fuel, string> = {
  petrol: "Benzyna",
  diesel: "Diesel",
  hybrid: "Hybryda",
  electric: "Elektryczny",
};

/**
 * Polish labels for the hand-picked commercial shelves (see lib/fleet/segments).
 *
 * "Premium SUV" left this list on 21.08.2026. It is not a shelf — it is
 * `Luxury` on a car whose `category` is `suv`, and it is now computed from
 * those two. Ticking it by hand is what let a Volvo XC60 be a SUV that no SUV
 * search could find, and a Porsche Panamera answer "luksusowy SUV".
 */
export const SEGMENT_LABEL: Record<EditableSegment, string> = {
  luxury: "Luxury",
  executive: "Executive",
  business: "Business",
};

export const SEGMENT_HINT: Record<EditableSegment, string> = {
  luxury: "Auta topowe, reprezentacyjne",
  executive: "Limuzyny biznesowe z kierowcą lub bez",
  business: "Codzienna flota firmowa",
};

export const CAR_STATUS_LABEL: Record<CarStatus, string> = {
  available: "Dostępny",
  rented: "Wynajęty",
  service: "Serwis",
  damaged: "Uszkodzony",
};

export const PREP_STATUS_LABEL: Record<PrepStatus, string> = {
  inspection: "Kontrola",
  cleaning: "Mycie",
  fueling: "Tankowanie",
  ready: "Gotowy",
};

/**
 * What an operator is actually looking at when they glance at the fleet list.
 *
 * "Gotowy" is the only one that is not work outstanding, which is why it is the
 * only one that reads as finished rather than as a queue.
 */
export const PREP_STATUS_HINT: Record<PrepStatus, string> = {
  inspection: "Wrócił, sprawdzany po zwrocie",
  cleaning: "W myjni / detailing",
  fueling: "Do zatankowania",
  ready: "Czysty, zatankowany, może jechać",
};

/** The next link in the chain, or null when the car is already ready. */
export function nextPrepStatus(current: PrepStatus): PrepStatus | null {
  const i = PREP_STATUSES.indexOf(current);
  return i >= 0 && i < PREP_STATUSES.length - 1 ? PREP_STATUSES[i + 1] : null;
}

export function isPrepStatus(v: unknown): v is PrepStatus {
  return (
    typeof v === "string" && (PREP_STATUSES as readonly string[]).includes(v)
  );
}

export function isCategory(v: unknown): v is Category {
  return typeof v === "string" && (CATEGORIES as readonly string[]).includes(v);
}
export function isGearbox(v: unknown): v is Gearbox {
  return typeof v === "string" && (GEARBOXES as readonly string[]).includes(v);
}
export function isFuel(v: unknown): v is Fuel {
  return typeof v === "string" && (FUELS as readonly string[]).includes(v);
}
export function isCarStatus(v: unknown): v is CarStatus {
  return (
    typeof v === "string" && (CAR_STATUSES as readonly string[]).includes(v)
  );
}
