"use client";

import { useLocale } from "next-intl";
import { formatPln, formatPlnDokladnie, formatPlnRange } from "@/lib/format";
import {
  formatGroszeAsEur,
  formatGroszeAsEurDokladnie,
  formatGroszeRangeAsEur,
} from "@/lib/currency/convert";
import { useEurRate } from "./CurrencyProvider";

/**
 * One price, in both currencies, with one of them visible.
 *
 * ## Why both are in the HTML
 *
 * The server has no idea which currency this visitor picked — the choice lives
 * in their browser, exactly like the theme. Three ways out of that, and only one
 * of them is honest about prices:
 *
 *   · convert in the browser after hydration → the returning EUR visitor sees
 *     złoty first and a flicker as every price on the page rewrites itself;
 *   · put the choice in a cookie and render one currency on the server → the
 *     same URL now serves two different pages, which is the problem this project
 *     already refused to create for language (`lib/locale/preference`);
 *   · render both and let CSS show one → no flash, no hydration mismatch, no
 *     JavaScript on the price at all, and the same URL for everyone.
 *
 * The last one is what this is. The pair of spans is switched by
 * `html[data-currency]` in `globals.css`; the attribute is set before first
 * paint by `CURRENCY_INIT_SCRIPT`.
 *
 * ## Złoty is not a fallback here, it is the default
 *
 * With no rate there is no euro span at all — and, importantly, no `money-pln`
 * class either, so a stale `data-currency="eur"` on `<html>` cannot hide the
 * only price on the card. A visitor who once chose euro and comes back to a
 * system whose rate has gone missing sees złoty, not a blank.
 */
export function Money({
  grosze,
  approx = true,
  dokladnie = false,
}: {
  /** Integer grosze, straight from the Pricing Engine. */
  grosze: number;
  /** Prefix the euro amount with "≈". Off only where a sentence already says so. */
  approx?: boolean;
  /**
   * Pokaż grosze/centy zamiast zaokrąglać do pełnej jednostki.
   *
   * Domyślnie WYŁĄCZONE, bo cały cennik jest okrągły i „890 zł" czyta się
   * lepiej niż „890,00 zł". Włączane tam, gdzie zaokrąglenie zmienia kwotę:
   * dziś wyłącznie przy stawce za kilometr ponad limit, gdzie 4,50 zł i 5,00 zł
   * to dwie różne ceny, a obie zaokrąglały się do „5 zł".
   */
  dokladnie?: boolean;
}) {
  const locale = useLocale();
  const rate = useEurRate();
  const pln = dokladnie
    ? formatPlnDokladnie(grosze, locale)
    : formatPln(grosze, locale);

  if (!rate) return <>{pln}</>;

  return (
    <>
      <span className="money-pln">{pln}</span>
      <span className="money-eur">
        {dokladnie
          ? formatGroszeAsEurDokladnie(grosze, rate.plnPerEur, locale, {
              approx,
            })
          : formatGroszeAsEur(grosze, rate.plnPerEur, locale, { approx })}
      </span>
    </>
  );
}

/**
 * Two prices as one range — "345–430 zł" / "≈ €80–€100".
 *
 * Callers decide whether a range is warranted; this only renders one. A model
 * with a single real rate must be shown as that rate, not as "€90–€90" (§11),
 * and that check belongs where the rates are known, in `dailyRateRangeGrosze`.
 */
export function MoneyRange({
  minGrosze,
  maxGrosze,
  approx = true,
}: {
  minGrosze: number;
  maxGrosze: number;
  approx?: boolean;
}) {
  const locale = useLocale();
  const rate = useEurRate();
  const pln = formatPlnRange(minGrosze, maxGrosze, locale);

  if (!rate) return <>{pln}</>;

  return (
    <>
      <span className="money-pln">{pln}</span>
      <span className="money-eur">
        {formatGroszeRangeAsEur(minGrosze, maxGrosze, rate.plnPerEur, locale, {
          approx,
        })}
      </span>
    </>
  );
}
