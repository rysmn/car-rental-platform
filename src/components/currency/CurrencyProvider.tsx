"use client";

import { createContext, useContext } from "react";
import type { EurRate } from "@/lib/currency/convert";

/**
 * The EUR/PLN rate, handed down from the server once per page.
 *
 * A context rather than a prop threaded through every card, because a price
 * appears inside client trees the server cannot reach into: the saved list and
 * the comparison table are `"use client"` and render `CarCard` themselves.
 * Passing the rate to those would mean passing it to everything that renders
 * them, which is most of the public site.
 *
 * `null` is the ordinary, expected value on a system that has never managed to
 * fetch a rate — see `lib/currency/rate`. Everything reading this context has to
 * work with it: prices print in złoty and the switch does not render at all.
 * Nothing here has a hardcoded fallback rate, and nothing may grow one.
 *
 * Note what this context does NOT hold: which currency the visitor picked. That
 * lives on `<html data-currency>` and is applied in CSS, so a price never
 * re-renders and never flashes the wrong currency on the way in.
 */
const EurRateContext = createContext<EurRate | null>(null);

export function CurrencyProvider({
  rate,
  children,
}: {
  rate: EurRate | null;
  children: React.ReactNode;
}) {
  return (
    <EurRateContext.Provider value={rate}>{children}</EurRateContext.Provider>
  );
}

/** The rate, or null when there has never been one. */
export function useEurRate(): EurRate | null {
  return useContext(EurRateContext);
}
