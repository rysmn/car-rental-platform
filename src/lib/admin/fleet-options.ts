// Client-safe enum values + Polish labels for the fleet editor. No server imports
// so both the form components and the server actions can share the source of truth.

import type { EditableSegment } from "@/lib/fleet/segments";
import type { Bilingual } from "@/lib/i18n-pick";

export const CATEGORIES = [
  "mini",
  "economy",
  "compact",
  "intermediate",
  "estate",
  "convertible",
  "suv",
  "van",
] as const;
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

export const CATEGORY_LABEL: Record<Category, Bilingual> = {
  mini: { pl: "Mini", en: "Mini" },
  economy: { pl: "Ekonomiczny", en: "Economy" },
  compact: { pl: "Kompakt", en: "Compact" },
  intermediate: { pl: "Średni", en: "Intermediate" },
  estate: { pl: "Kombi", en: "Estate" },
  convertible: { pl: "Kabriolet", en: "Convertible" },
  suv: { pl: "SUV", en: "SUV" },
  van: { pl: "Bus / Van", en: "Van" },
};

export const GEARBOX_LABEL: Record<Gearbox, Bilingual> = {
  automatic: { pl: "Automatyczna", en: "Automatic" },
  manual: { pl: "Manualna", en: "Manual" },
};

export const FUEL_LABEL: Record<Fuel, Bilingual> = {
  petrol: { pl: "Benzyna", en: "Petrol" },
  diesel: { pl: "Diesel", en: "Diesel" },
  hybrid: { pl: "Hybryda", en: "Hybrid" },
  electric: { pl: "Elektryczny", en: "Electric" },
};

/**
 * Polish labels for the hand-picked commercial shelves (see lib/fleet/segments).
 *
 * "Premium SUV" left this list on 21.08.2026. It is not a shelf — it is
 * `Luxury` on a car whose `category` is `suv`, and it is now computed from
 * those two. Ticking it by hand is what let a Volvo XC60 be a SUV that no SUV
 * search could find, and a Porsche Panamera answer "luksusowy SUV".
 */
export const SEGMENT_LABEL: Record<EditableSegment, Bilingual> = {
  luxury: { pl: "Luxury", en: "Luxury" },
  executive: { pl: "Executive", en: "Executive" },
  business: { pl: "Business", en: "Business" },
};

export const SEGMENT_HINT: Record<EditableSegment, Bilingual> = {
  luxury: { pl: "Auta topowe, reprezentacyjne", en: "Top-end, representative cars" },
  executive: { pl: "Limuzyny biznesowe z kierowcą lub bez", en: "Business limousines, with or without a driver" },
  business: { pl: "Codzienna flota firmowa", en: "Everyday company fleet" },
};

export const CAR_STATUS_LABEL: Record<CarStatus, Bilingual> = {
  available: { pl: "Dostępny", en: "Available" },
  rented: { pl: "Wynajęty", en: "Rented" },
  service: { pl: "Serwis", en: "In service" },
  damaged: { pl: "Uszkodzony", en: "Damaged" },
};

export const PREP_STATUS_LABEL: Record<PrepStatus, Bilingual> = {
  inspection: { pl: "Kontrola", en: "Inspection" },
  cleaning: { pl: "Mycie", en: "Cleaning" },
  fueling: { pl: "Tankowanie", en: "Refuelling" },
  ready: { pl: "Gotowy", en: "Ready" },
};

/**
 * What an operator is actually looking at when they glance at the fleet list.
 *
 * "Gotowy" is the only one that is not work outstanding, which is why it is the
 * only one that reads as finished rather than as a queue.
 */
export const PREP_STATUS_HINT: Record<PrepStatus, Bilingual> = {
  inspection: { pl: "Wrócił, sprawdzany po zwrocie", en: "Returned, being checked after return" },
  cleaning: { pl: "W myjni / detailing", en: "At the car wash / detailing" },
  fueling: { pl: "Do zatankowania", en: "Needs refuelling" },
  ready: { pl: "Czysty, zatankowany, może jechać", en: "Clean, refuelled, ready to go" },
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
