import type { FleetSegment } from "./segments";
import type { DriverClass } from "./driver-class";

export type CarCategory =
  | "mini"
  | "economy"
  | "compact"
  | "intermediate"
  | "estate"
  | "convertible"
  | "suv"
  | "van";
export type Gearbox = "automatic" | "manual";
export type Fuel = "petrol" | "diesel" | "hybrid" | "electric";
export type CarStatus = "available" | "rented" | "service" | "damaged";

/** UI-facing shape for a listing (one model), independent of the storage backend. */
export type FleetCar = {
  /**
   * The `car_models` row id. Availability is asked per model unit, so anything
   * date-aware needs this; the seed fallback has no database and reports "".
   */
  id: string;
  slug: string;
  brand: string;
  model: string;
  year: number;
  category: CarCategory;
  seats: number;
  gearbox: Gearbox;
  fuel: Fuel;
  kmPerDayLimit: number;
  /**
   * Opłata za kilometr ponad limit, w groszach — `null` gdy nie ustawiono.
   *
   * `null` ma być przekazywane dalej, a nie zamieniane na zero: „nie wiem"
   * i „za darmo" to dwa różne zdania, a tylko drugie z nich jest obietnicą.
   * Reguła limitu, po którego przekroczeniu ta stawka działa, mieszka
   * w `lib/booking/mileage`.
   */
  extraMileageFeeGrosze: number | null;
  /** Base (1–2 day) rate; tier fields below apply to longer stays. */
  dailyPriceGrosze: number;
  dailyPrice3to6Grosze: number | null;
  dailyPrice7to13Grosze: number | null;
  dailyPrice14to29Grosze: number | null;
  monthlyPriceGrosze: number;
  depositGrosze: number;
  descriptionPl: string | null;
  descriptionEn: string | null;
  images: string[];
  /** Equipment, as typed by an admin. Shown verbatim in both locales. */
  features: string[];
  /**
   * Classes this car is offered under, already merged with the ones derived
   * from `fuel`/`category`. This is what the fleet filter matches against.
   */
  segments: FleetSegment[];
  /**
   * Which driver-requirement class the car belongs to, or null when nobody has
   * assigned one yet. The thresholds live in Admin → Zasady wynajmu; this is
   * only the key that selects them.
   */
  driverClass: DriverClass | null;
  unitCount: number;
  availableCount: number;
};
