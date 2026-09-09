import "server-only";
import { getFleet } from "@/lib/fleet/repo";
import { getFreeUnitsByModel } from "@/lib/booking/availability";
import { getFeeCatalog } from "@/lib/booking/repo";
import {
  computeQuote,
  rentalDays,
  lowestDailyRateGrosze,
} from "@/lib/booking/pricing";
import { getSetting } from "@/lib/admin/settings";
import { effectiveDriverLimits } from "@/lib/admin/rental-rules";
import { COMPARE_MAX } from "./compareLimits";
import type { FleetCar } from "./types";

/**
 * The data behind the comparison view.
 *
 * ## Where the numbers come from
 *
 * `computeQuote` and `getFreeUnitsByModel` — the same two functions the booking
 * form and the assistant use. Not a second pricing routine written to look
 * similar: if this page and the booking page ever disagreed about what a car
 * costs, the visitor would have been shown a price the checkout then refuses,
 * and that is the one failure a comparison table must never produce.
 *
 * Mileage limits, deposits and driver ages are read the same way — from the
 * fleet row and from the Rules Centre — so a figure changed in the admin panel
 * is the figure compared here, with nothing to copy by hand.
 */

export { COMPARE_MIN, COMPARE_MAX } from "./compareLimits";

export type ComparePricing = {
  /** The advertised "from" rate, used when no dates were given. */
  fromDailyGrosze: number;
  /** Effective per-day rate for the chosen stay, or null without dates. */
  dailyGrosze: number | null;
  /** Total for the stay, or null without dates. */
  totalGrosze: number | null;
  days: number | null;
  /** A stay whose tier has no published rate — a manager quotes it. */
  onRequest: boolean;
  /**
   * `true` only when dates were given AND no unit is free. Without dates the
   * question was never asked, and the column says nothing about availability
   * rather than implying a car is free.
   */
  unavailable: boolean;
};

export type CompareCar = {
  car: FleetCar;
  pricing: ComparePricing;
  /** From the Rules Centre, for the car's own driver class. */
  minAge: number;
  minLicenceYears: number | null;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** A range only counts when both ends are real and in order. */
export function compareRange(
  from: string | undefined,
  to: string | undefined,
): { from: string; to: string } | null {
  if (!from || !to || !ISO.test(from) || !ISO.test(to) || to < from) return null;
  return { from, to };
}

/**
 * Resolve the ids in the URL against the live fleet.
 *
 * Unknown, unpublished and duplicated ids are dropped rather than rendered as
 * blanks — a car retired in the admin panel disappears from a comparison
 * somebody had bookmarked, instead of breaking the page. Capped at
 * `COMPARE_MAX`, so a hand-edited URL cannot widen the table without limit.
 */
export async function loadComparison(
  ids: readonly string[],
  range: { from: string; to: string } | null,
): Promise<CompareCar[]> {
  const wanted = [...new Set(ids)].slice(0, COMPARE_MAX);
  if (wanted.length === 0) return [];

  const [fleet, fees, rules, polityka] = await Promise.all([
    getFleet(),
    getFeeCatalog(),
    getSetting("rentalRules"),
    getSetting("cancellation"),
  ]);
  const free = range ? await getFreeUnitsByModel(range.from, range.to) : null;
  const days = range
    ? rentalDays(new Date(range.from), new Date(range.to))
    : null;

  const picked = wanted
    .map((id) => fleet.find((c) => c.id === id))
    .filter((c): c is FleetCar => Boolean(c));

  return picked.map((car) => {
    const limits = effectiveDriverLimits(rules, car.driverClass);

    let pricing: ComparePricing = {
      fromDailyGrosze: lowestDailyRateGrosze(car),
      dailyGrosze: null,
      totalGrosze: null,
      days: null,
      onRequest: false,
      unavailable: false,
    };

    if (range && days) {
      const q = computeQuote({
        dailyPriceGrosze: car.dailyPriceGrosze,
        dailyPrice3to6Grosze: car.dailyPrice3to6Grosze,
        dailyPrice7to13Grosze: car.dailyPrice7to13Grosze,
        dailyPrice14to29Grosze: car.dailyPrice14to29Grosze,
        monthlyPriceGrosze: car.monthlyPriceGrosze,
        depositGrosze: car.depositGrosze,
        kmPerDayLimit: car.kmPerDayLimit,
        extraMileageFeeGrosze: car.extraMileageFeeGrosze,
        // Porównywarka pokazuje ceny, nie zapisuje rezerwacji — politykę bierze
        // z ustawień wyłącznie po to, żeby wycena była kompletna.
        cancellationPolicy: polityka,
        days,
        // No pickup point is chosen in a comparison, so no location fee is
        // added. Quoting one car with an airport surcharge and another without
        // would make the two columns incomparable, which is the whole point.
        locationFeeGrosze: 0,
        extras: {
          extraDriver: false,
          childSeat: false,
          protectionPackage: false,
        },
        depositVariant: "with_deposit",
        fees,
      });
      pricing = {
        fromDailyGrosze: lowestDailyRateGrosze(car),
        dailyGrosze: q.onRequest ? null : q.dailyPriceGrosze,
        totalGrosze: q.onRequest ? null : q.totalGrosze,
        days,
        onRequest: q.onRequest,
        unavailable: (free?.get(car.id) ?? 0) === 0,
      };
    }

    return { car, pricing, minAge: limits.minAge, minLicenceYears: limits.minLicenceYears };
  });
}
