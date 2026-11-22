"use client";

import { useLocale } from "next-intl";
import { formatPln, formatPlnDokladnie, formatPlnRange } from "@/lib/format";

/**
 * One price in the installation currency (`SHOP_CURRENCY`).
 *
 * Amounts are integer minor units (grosze or cent). No second currency is
 * rendered and no exchange rate is used.
 */
export function Money({
  grosze,
  dokladnie = false,
}: {
  /** Integer minor units, straight from the Pricing Engine. */
  grosze: number;
  /** Show minor units instead of rounding to whole units. */
  dokladnie?: boolean;
  /** Kept for call-site compatibility; no longer used. */
  approx?: boolean;
}) {
  const locale = useLocale();
  return (
    <>
      {dokladnie
        ? formatPlnDokladnie(grosze, locale)
        : formatPln(grosze, locale)}
    </>
  );
}

/** Two prices as one range in the installation currency. */
export function MoneyRange({
  minGrosze,
  maxGrosze,
}: {
  minGrosze: number;
  maxGrosze: number;
  /** Kept for call-site compatibility; no longer used. */
  approx?: boolean;
}) {
  const locale = useLocale();
  return <>{formatPlnRange(minGrosze, maxGrosze, locale)}</>;
}
