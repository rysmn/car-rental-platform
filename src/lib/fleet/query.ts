import { isBodyType, type BodyType, type CommercialSegment } from "./segments";
import type { DriverClass } from "./driver-class";
import type { FleetCar } from "./types";

/**
 * One search, expressed as independent axes.
 *
 * Every field is a separate property of the car and every one that is set
 * NARROWS the result. That sentence is the whole design: before this type
 * existed the parser produced a single `segment` string, so a second word in
 * the customer's sentence did not narrow the search — it *replaced* it.
 * "Luksusowy SUV" became `luxury` and lost the SUV; "tani SUV" became a SUV
 * search and lost the price. An intersection cannot do that.
 *
 * `null`/`undefined` means "the customer did not say", which is not the same as
 * "any value is wrong" — an unset axis simply does not filter.
 */
export type FleetQuery = {
  /** Axis 1 — `car_models.category`. */
  bodyType?: BodyType | null;
  /** Axis 2 — one of the hand-assigned commercial shelves. */
  segment?: CommercialSegment | string | null;
  /** Axis 4 — `fuel`. */
  fuel?: string | null;
  /** Axis 5 — the floor, never an exact match: 5 seats answers "for 4". */
  seats?: number | null;
  /** Axis 6 — `gearbox`. */
  gearbox?: string | null;
  /** Axis 3 — the driver-requirement class. */
  driverClass?: DriverClass | string | null;
  /**
   * Axis 7 — the most the customer said they will pay per day, in grosze.
   *
   * Compared against the same "od" rate the cards advertise and the same one
   * `cheaperThan`/`pricierThan` compare, so the number the customer is shown is
   * the number they were filtered by. Unset means unfiltered: a bare "tani"
   * sorts and never excludes, by the owner's decision of 21.08.2026.
   */
  maxDailyGrosze?: number | null;
  /**
   * Axis 7b — the floor of a stated per-day range: "od 200 do 400 zł".
   *
   * A floor is not a preference for expensive cars, it is half of a range, and
   * it exists because a customer who says "między 200 a 400" has said something
   * about both ends. Compared against the same advertised "od" rate as the
   * ceiling above, so one price decides both sides and a car cannot pass one
   * test and fail the other on two different numbers.
   */
  minDailyGrosze?: number | null;
  /**
   * Axis 8 — the budget for the WHOLE rental, in grosze.
   *
   * A different question from axis 7, not a scaled version of it: "600 zł na
   * cały weekend" and "600 zł za dobę" are three days apart in what they can
   * afford, and the tiers mean the total is never the daily rate times the
   * days. It is answered from `rentalChargeGrosze` — the same engine the
   * booking form charges from — and only when the customer has chosen dates,
   * because without a length there is no total to compare.
   */
  minTotalGrosze?: number | null;
  maxTotalGrosze?: number | null;
};

/**
 * The prices a car is judged by, computed by the Pricing Engine and passed in.
 *
 * They are arguments rather than something this module works out, because the
 * tier maths lives in `lib/booking/pricing` and one place has to own it. What
 * this module owns is the comparison.
 */
export type FleetQueryPrices = {
  /** The advertised "od" rate — the number printed on the card. */
  fromDailyGrosze?: number;
  /**
   * The real charge for the chosen dates, extras and pickup fee excluded.
   *
   * Absent when the visitor has not chosen dates — which is not a reason to
   * hide anything. See `matchesFleetQuery`.
   */
  totalGrosze?: number;
};

/**
 * Does one car answer this query?
 *
 * Kept in `lib/fleet` rather than in the chat layer because the public grid and
 * the assistant must agree about what "a SUV" is. Two implementations of that
 * question is how they drifted apart in the first place.
 */
export function matchesFleetQuery(
  car: FleetCar,
  q: FleetQuery,
  /** What this car costs, from the Pricing Engine — see `FleetQueryPrices`. */
  prices: FleetQueryPrices = {},
): boolean {
  const { fromDailyGrosze, totalGrosze } = prices;
  if (q.bodyType && car.category !== q.bodyType) return false;
  // The commercial axis reads the STORED shelves only. Body and fuel facets
  // live on their own axes above, so a body word can never be answered here by
  // accident — which is exactly the confusion this replaces.
  if (q.segment && !commercialOf(car).includes(q.segment)) return false;
  if (q.seats && car.seats < q.seats) return false;
  if (q.gearbox && car.gearbox !== q.gearbox) return false;
  if (q.fuel && car.fuel !== q.fuel) return false;
  if (q.driverClass && car.driverClass !== q.driverClass) return false;
  if (q.maxDailyGrosze != null || q.minDailyGrosze != null) {
    const rate = fromDailyGrosze ?? car.dailyPriceGrosze;
    if (q.maxDailyGrosze != null && rate > q.maxDailyGrosze) return false;
    if (q.minDailyGrosze != null && rate < q.minDailyGrosze) return false;
  }
  /*
   * A total budget with no total to compare does NOT exclude the car.
   *
   * It can only happen when the axis was set without dates, and the honest
   * reading of that is "the question cannot be asked yet", not "no car answers
   * it". Emptying the grid would turn a missing input into a sold-out fleet —
   * the same mistake an unknown class in the URL is already protected from.
   */
  if (totalGrosze != null) {
    if (q.maxTotalGrosze != null && totalGrosze > q.maxTotalGrosze) return false;
    if (q.minTotalGrosze != null && totalGrosze < q.minTotalGrosze) return false;
  }
  return true;
}

/**
 * The shelves a car is on, taken off the resolved facet list.
 *
 * `FleetCar.segments` is already the merged, legacy-cleaned facet set, so the
 * body and fuel facets are stripped back out here rather than re-reading the
 * row: one place decides what is stored and what is derived.
 */
function commercialOf(car: FleetCar): string[] {
  return car.segments.filter(
    (s) => !isBodyType(s) && s !== "electric" && s !== "premium-suv",
  );
}

/** Cheapest offered rate first, then the stable order the fleet already has. */
export function byPriceAscending(a: FleetCar, b: FleetCar): number {
  return a.dailyPriceGrosze - b.dailyPriceGrosze;
}
