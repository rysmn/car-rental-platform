import type { Fee, QuoteBreakdown, QuoteInput, QuoteLine } from "./types";
import { limitKmDlaNajmu } from "./mileage";

/** Rental length in whole days, inclusive of both endpoints (min 1). */
export function rentalDays(start: Date, end: Date): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const a = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const b = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.max(1, Math.round((b - a) / MS_PER_DAY) + 1);
}

/**
 * Ile kosztuje jeden dodatek za cały wynajem.
 *
 * `capGrosze` jest tu, a nie w formularzu i nie w czacie, bo to jest JEDYNE
 * miejsce, w którym opłata dodatkowa zamienia się w kwotę. Każdy, kto pyta
 * o cenę — rezerwacja, podsumowanie, asystent, cennik na stronie — pyta przez
 * tę funkcję, więc reguła „50 zł za dobę, ale nie więcej niż 400 zł" istnieje
 * raz i nie ma jak się rozjechać.
 */
export function feeAmount(fee: Fee, days: number): number {
  const total = fee.unit === "per_day" ? fee.amountGrosze * days : fee.amountGrosze;
  return fee.capGrosze != null && fee.capGrosze > 0
    ? Math.min(total, fee.capGrosze)
    : total;
}

/** Days in a billing month for pro-rating the 30+ tier. */
export const DAYS_PER_MONTH = 30;

/** Tier boundaries, shared by the calculator and the published price table. */
export const PRICE_TIER_BOUNDS = [
  { min: 1, max: 2 },
  { min: 3, max: 6 },
  { min: 7, max: 13 },
  { min: 14, max: 29 },
  { min: 30, max: null },
] as const;

/**
 * The per-model price ladder. Tier fields are nullable — a null falls back to
 * the base daily rate, so a model that has never had tiers set keeps its old
 * flat-rate pricing rather than suddenly becoming free or cheaper.
 */
export type TierPricing = {
  dailyPriceGrosze: number;
  dailyPrice3to6Grosze: number | null;
  dailyPrice7to13Grosze: number | null;
  dailyPrice14to29Grosze: number | null;
  monthlyPriceGrosze: number;
};

/**
 * Total rental charge (excluding extras) for a stay of `days`.
 *
 * The tier rate applies to the WHOLE rental, not progressively — a 10-day
 * rental is 10 × the 7–13 day rate, matching how the published table reads.
 *
 * 30+ days is pro-rated from the monthly rate (monthly ÷ 30 × days) rather than
 * charged as whole months plus a daily remainder. Change DAYS_PER_MONTH or this
 * branch if the business prefers whole-month billing.
 */
export function rentalChargeGrosze(p: TierPricing, days: number): number {
  const n = Math.max(1, Math.floor(days));

  if (n >= 30) {
    return Math.round((p.monthlyPriceGrosze * n) / DAYS_PER_MONTH);
  }

  const rate =
    n >= 14
      ? (p.dailyPrice14to29Grosze ?? p.dailyPriceGrosze)
      : n >= 7
        ? (p.dailyPrice7to13Grosze ?? p.dailyPriceGrosze)
        : n >= 3
          ? (p.dailyPrice3to6Grosze ?? p.dailyPriceGrosze)
          : p.dailyPriceGrosze;

  return rate * n;
}

/**
 * The effective per-day rate actually charged, for display and for the record
 * stored on the reservation. Derived from the total so it always agrees with
 * what the customer pays, including after the 30+ pro-rating rounds.
 */
export function effectiveDailyRateGrosze(p: TierPricing, days: number): number {
  const n = Math.max(1, Math.floor(days));
  return Math.round(rentalChargeGrosze(p, n) / n);
}

/**
 * Zero is not a price. It is the operator saying "ask me".
 *
 * A rate of 0 in the price list means that period is quoted by hand — a long
 * lease, a corporate deal, a car whose rate has not been set yet. It is a
 * deliberate value an administrator may type, and nothing in this codebase may
 * treat it as money: not as "free", not as a number to display, and not as a
 * candidate for the "from" price.
 *
 * This is the single test for it. Everything that shows or charges a price
 * asks this question first.
 */
export function isPriceOnRequest(grosze: number | null | undefined): boolean {
  return grosze == null || grosze <= 0;
}

/**
 * Every per-day rate a model is REALLY offered at, in grosze.
 *
 * One list, five candidates — the four daily tiers plus the monthly rate
 * pro-rated so it can stand beside them. Unpriced periods are dropped rather
 * than counted as zero; see `isPriceOnRequest` for why a zero is a sentence and
 * not a number.
 *
 * This is the only place that decides what counts as a rate. `lowestDailyRate`
 * and `dailyRateRange` both read it, so the "od" price on a card and the two
 * ends of the range it may widen into can never come from different maths.
 */
function offeredDailyRatesGrosze(p: TierPricing): number[] {
  return [
    p.dailyPriceGrosze,
    p.dailyPrice3to6Grosze ?? p.dailyPriceGrosze,
    p.dailyPrice7to13Grosze ?? p.dailyPriceGrosze,
    p.dailyPrice14to29Grosze ?? p.dailyPriceGrosze,
    // Pro-rated so it can be compared with the daily tiers, but only when the
    // monthly rate is actually set.
    isPriceOnRequest(p.monthlyPriceGrosze)
      ? 0
      : Math.round(p.monthlyPriceGrosze / DAYS_PER_MONTH),
  ].filter((rate) => !isPriceOnRequest(rate));
}

/**
 * The cheapest rate a model is ever offered at — the honest "from" price.
 *
 * Rates of 0 are skipped rather than winning. They used to win, because
 * `Math.min` has no opinion about what a zero means: on 2026-08-19 the monthly
 * rate was cleared on all ten cars and every "Cena od" on the site turned into
 * "0 zł". A price of zero is the one number a rental company must never print.
 *
 * Returns 0 only when the model has NO priced period at all, which the callers
 * read as "on request" — see `isPriceOnRequest`.
 */
export function lowestDailyRateGrosze(p: TierPricing): number {
  const candidates = offeredDailyRatesGrosze(p);
  return candidates.length > 0 ? Math.min(...candidates) : 0;
}

/** The two ends of what a model costs per day. `min === max` for a flat rate. */
export type DailyRateRange = {
  minGrosze: number;
  maxGrosze: number;
  /** True when the two ends differ — i.e. the length of the stay changes the rate. */
  spans: boolean;
};

/**
 * The real spread of daily rates for one model, for the "€80–€100 / day" line.
 *
 * DERIVED, never stored. There is no `price_range_min` column and there must not
 * be one: the administrator edits the same five fields they always edited, and
 * both ends of this range fall out of them. A hand-maintained range is a second
 * price that drifts from the first one the day somebody changes a tier.
 *
 * `spans` is false — and the callers then print ONE number rather than a range —
 * whenever the model has a single real rate, or only one priced period at all.
 * Printing "€90–€90" or inventing a spread a car does not have would be a
 * marketing price, which §8 of the brief forbids in as many words.
 *
 * Both ends are 0 when nothing is priced; callers read that as "on request",
 * the same convention `lowestDailyRateGrosze` already uses.
 */
export function dailyRateRangeGrosze(p: TierPricing): DailyRateRange {
  const candidates = offeredDailyRatesGrosze(p);
  if (candidates.length === 0) {
    return { minGrosze: 0, maxGrosze: 0, spans: false };
  }
  const minGrosze = Math.min(...candidates);
  const maxGrosze = Math.max(...candidates);
  return { minGrosze, maxGrosze, spans: maxGrosze > minGrosze };
}

/**
 * THE authoritative price. Pure and deterministic — the server calls this with
 * DB-sourced numbers at submit time and stores the result on the reservation.
 * The client runs the same function for a live preview, but its output is never
 * trusted: whatever the client sends is ignored and this is recomputed.
 *
 * All amounts are integer grosze.
 */
export function computeQuote(input: QuoteInput): QuoteBreakdown {
  const days = Math.max(1, Math.floor(input.days));
  // The rate depends on how long the stay is — see rentalChargeGrosze.
  const rentalGrosze = rentalChargeGrosze(input, days);
  const effectiveDaily = effectiveDailyRateGrosze(input, days);

  /**
   * A stay whose own tier is unpriced cannot be quoted at all.
   *
   * The extras and the location fee below would still add up to a number, and
   * that number would be a lie — a 30-day rental with no monthly rate set is
   * not "200 zł for the airport pickup", it is "we need to talk". The flag
   * travels with the breakdown so no caller can miss it by reading only
   * `totalGrosze`.
   */
  const onRequest = isPriceOnRequest(rentalGrosze);

  const lines: QuoteLine[] = [];

  if (input.locationFeeGrosze > 0) {
    lines.push({ code: "location", amountGrosze: input.locationFeeGrosze });
  }
  if (input.extras.extraDriver) {
    lines.push({
      code: "extra_driver",
      amountGrosze: feeAmount(input.fees.extraDriver, days),
    });
  }
  if (input.extras.childSeat) {
    lines.push({
      code: "child_seat",
      amountGrosze: feeAmount(input.fees.childSeat, days),
    });
  }
  if (input.extras.protectionPackage) {
    lines.push({
      code: "protection_package",
      amountGrosze: feeAmount(input.fees.protectionPackage, days),
    });
  }

  // Deposit variant B (no deposit) waives the deposit but adds a fee; variant A
  // charges (holds) the refundable deposit instead.
  const noDeposit = input.depositVariant === "no_deposit";
  if (noDeposit) {
    lines.push({
      code: "no_deposit",
      amountGrosze: feeAmount(input.fees.noDeposit, days),
    });
  }

  const totalGrosze =
    rentalGrosze + lines.reduce((sum, l) => sum + l.amountGrosze, 0);

  return {
    days,
    dailyPriceGrosze: effectiveDaily,
    baseDailyPriceGrosze: input.dailyPriceGrosze,
    rentalGrosze,
    lines,
    totalGrosze,
    depositGrosze: noDeposit ? 0 : input.depositGrosze,
    /*
      Warunki przebiegu jadą Z WYCENĄ, a nie obok niej — i świadomie NIE wchodzą
      do `totalGrosze`.

      `computeQuote` jest jedynym wejściem do `reservations.quote`, więc to jest
      też jedyne miejsce, w którym warunek może zostać zamrożony na dzień
      zawarcia rezerwacji. Gdyby stawkę dokładał dopiero formularz albo panel,
      istniałaby droga do rezerwacji, która jej nie ma — i rozliczenie zwrotu
      musiałoby wtedy sięgnąć po BIEŻĄCY cennik, czyli zmienić warunki po fakcie.
    */
    extraMileageFeeGrosze: input.extraMileageFeeGrosze,
    includedMileageKm: limitKmDlaNajmu(days, input.kmPerDayLimit),
    /*
      Zasady anulowania jadą Z WYCENĄ, tak samo jak warunki przebiegu i z tego
      samego powodu: to jest jedyne miejsce, przez które warunek trafia do
      `reservations.quote`, czyli jedyne miejsce, w którym da się go zamrozić
      na dzień zawarcia rezerwacji.
    */
    cancellationPolicy: input.cancellationPolicy,
    onRequest,
  };
}
