/**
 * PLN → EUR, and nothing else.
 *
 * ## PLN is the currency. EUR is a translation of it.
 *
 * Every price in this system is integer grosze and stays integer grosze: the
 * price list, the quote engine, the reservation, the invoice, the deposit. This
 * module never produces a number that anything charges, stores or compares
 * against a stored price — it produces a number a visitor READS, so that the
 * customer who wrote to us on 25.08 asking "w cenie od 80 do 100 €" can answer
 * their own question without a calculator.
 *
 * There is deliberately no `eur_price` column anywhere and no way to type one.
 * A second hand-maintained price is a second truth, and the day somebody edits
 * the złoty rate the euro one silently becomes a lie.
 *
 * ## Why the conversion is pure and the rate is a parameter
 *
 * The rate arrives from `lib/currency/rate` (server, cached, ECB) and is passed
 * in. That keeps this file free of `server-only`, so the same arithmetic runs in
 * the browser for the currency switch, in the chat parser when a customer says
 * "80 euro dziennie", and on the server when a card is rendered. One function,
 * one result, no rounding that only one of the three does.
 */

/** What a euro costs in złoty, plus where and when that number came from. */
export type EurRate = {
  /** PLN per 1 EUR, e.g. 4.3055. Always > 0 — a null rate is `null`, not zero. */
  plnPerEur: number;
  /** The source's own reference date (`YYYY-MM-DD`), not when we fetched it. */
  date: string;
  /** Which official source answered. */
  source: "ecb" | "nbp";
};

/** The currency a visitor is reading in. PLN is the default and the fallback. */
export type DisplayCurrency = "pln" | "eur";

/**
 * A rate outside this band is refused, whatever an official source says.
 *
 * EUR/PLN has spent the last two decades between roughly 3.9 and 4.9. These
 * bounds are far wider than that and still tight enough to catch the failures
 * that actually happen: a parse that picked up the wrong currency's row, a
 * source that started answering in a different unit, a truncated response that
 * yielded "4" or "43055". Showing a car at €2,000 a day because a regex matched
 * one character too few is worse than showing no euro price at all.
 */
export const RATE_MIN = 3;
export const RATE_MAX = 6;

export function isPlausibleRate(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= RATE_MIN &&
    value <= RATE_MAX
  );
}

/**
 * Grosze (1/100 PLN) → eurocents (1/100 EUR).
 *
 * Rounded to the cent even though nothing displays cents, because this value is
 * also what a budget in euro is compared against after being converted the
 * other way, and truncating here would move a car in or out of a range by a
 * grosz at the boundary.
 */
export function groszeToEurCents(grosze: number, plnPerEur: number): number {
  if (!isPlausibleRate(plnPerEur)) return 0;
  return Math.round(grosze / plnPerEur);
}

/**
 * Eurocents → grosze. The direction a stated budget travels.
 *
 * "Do 100 EUR dziennie" becomes a złoty figure BEFORE it meets the price list,
 * so the filter compares grosze with grosze and the Pricing Engine never learns
 * that a second currency exists.
 */
export function eurCentsToGrosze(eurCents: number, plnPerEur: number): number {
  if (!isPlausibleRate(plnPerEur)) return 0;
  return Math.round(eurCents * plnPerEur);
}

/**
 * A euro amount as the visitor reads it.
 *
 * `≈` is doing real work and is not decoration: it is the whole "ceny w EUR mają
 * charakter orientacyjny" disclaimer compressed into one character that fits on
 * a card. The sentence itself still appears beside the switch, on the car page
 * and in the booking panel — §7 asks for it in the places where somebody is
 * deciding, not stamped across every tile in the grid.
 *
 * No decimals, matching `formatPln`: "≈€88" and "1 234 zł" belong to the same
 * page and one of them printing cents would look like the more precise number,
 * which is exactly backwards.
 */
export function formatEur(
  eurCents: number,
  locale: string,
  { approx = true }: { approx?: boolean } = {},
): string {
  const value = new Intl.NumberFormat(locale === "en" ? "en-GB" : "pl-PL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(eurCents / 100);
  // U+202F NARROW NO-BREAK SPACE: the tilde has to breathe, but "≈" left at
  // the end of one line with "€88" on the next is not a price, it is two
  // fragments. Narrow rather than a full space so it reads as one token.
  return approx ? `≈ ${value}` : value;
}

/**
 * Euro Z CENTAMI — odpowiednik `formatPlnDokladnie` po drugiej stronie kursu.
 *
 * Ta sama zasada i ten sam powód: „≈ €1" pod stawką 4,50 zł/km gubi połowę
 * informacji, bo 4,50 zł to około 1,05 €, a 5,00 zł około 1,17 € — obie
 * zaokrągliłyby się do jedynki. Przy kwocie tej wielkości grosze SĄ treścią.
 */
export function formatEurDokladnie(
  eurCents: number,
  locale: string,
  { approx = true }: { approx?: boolean } = {},
): string {
  const value = new Intl.NumberFormat(locale === "en" ? "en-GB" : "pl-PL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(eurCents / 100);
  return approx ? `≈ ${value}` : value;
}

/** Grosze prosto na dokładny łańcuch euro, dla stawek za kilometr. */
export function formatGroszeAsEurDokladnie(
  grosze: number,
  plnPerEur: number,
  locale: string,
  options?: { approx?: boolean },
): string {
  return formatEurDokladnie(
    groszeToEurCents(grosze, plnPerEur),
    locale,
    options,
  );
}

/** Grosze straight to a formatted euro string, for callers that hold a rate. */
export function formatGroszeAsEur(
  grosze: number,
  plnPerEur: number,
  locale: string,
  options?: { approx?: boolean },
): string {
  return formatEur(groszeToEurCents(grosze, plnPerEur), locale, options);
}

/**
 * A euro range: "≈ €80–€100", with one tilde for the pair rather than one each.
 *
 * Mirrors `formatPlnRange` — same formatter, same fallback, same reason.
 */
export function formatEurRange(
  minEurCents: number,
  maxEurCents: number,
  locale: string,
  { approx = true }: { approx?: boolean } = {},
): string {
  const nf = new Intl.NumberFormat(locale === "en" ? "en-GB" : "pl-PL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });
  let value: string;
  try {
    value = nf.formatRange(minEurCents / 100, maxEurCents / 100);
  } catch {
    value = `${nf.format(minEurCents / 100)} – ${nf.format(maxEurCents / 100)}`;
  }
  return approx ? `≈ ${value}` : value;
}

/** Grosze range straight to a formatted euro range. */
export function formatGroszeRangeAsEur(
  minGrosze: number,
  maxGrosze: number,
  plnPerEur: number,
  locale: string,
  options?: { approx?: boolean },
): string {
  return formatEurRange(
    groszeToEurCents(minGrosze, plnPerEur),
    groszeToEurCents(maxGrosze, plnPerEur),
    locale,
    options,
  );
}
