import { getFreeUnitsByModel } from "@/lib/booking/availability";
import {
  lowestDailyRateGrosze,
  rentalChargeGrosze,
  rentalDays,
} from "@/lib/booking/pricing";
import { matchesFleetQuery } from "./query";
import { FLEET_SEGMENTS, isFleetSegment, type FleetSegment } from "./segments";
import type { FleetCar } from "./types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** What a stated budget is a budget FOR. */
export type BudgetKind = "day" | "total";

/** A budget as the visitor stated it, already in złoty grosze. */
export type FleetBudget = {
  kind: BudgetKind;
  minGrosze: number | null;
  maxGrosze: number | null;
};

/**
 * Read a budget off the URL.
 *
 * ## Why the euro amount is converted here and not compared where it was typed
 *
 * Every price in this system is integer złoty grosze, from the tier table to
 * the quote to the card. A euro budget is the visitor's way of saying a złoty
 * number they do not know yet, so it becomes that number once — here, against
 * the rate the page was rendered with — and everything downstream keeps
 * comparing złoty with złoty. The alternative, converting each car's price into
 * euro to compare, would run the rate over the whole fleet and round hundreds of
 * times instead of twice.
 *
 * ## Euro bez kursu nie filtruje NICZEGO
 *
 * Do 02.09.2026 stało tu, że przy braku kursu kwoty z `cur=eur` czyta się jako
 * złote, „bo to jest odczyt, który pokazuje auta zamiast pustej strony".
 * Rozumowanie było napisane dla samego SUFITU — „do 500 eur" przeczytane jako
 * 500 zł faktycznie zostawia najtańsze auta. Dla WIDEŁEK jest odwrotnie
 * i zmierzone: `?min=70&max=120&cur=eur` bez kursu znaczy „od 70 do 120 zł",
 * a w tej flocie najtańsza doba kosztuje ponad 250 zł — więc znikało
 * **wszystkie dziesięć aut**. Komentarz obiecywał dokładnie to, czemu miał
 * zapobiec.
 *
 * Reguła jest więc teraz ta sama, co w rozmowie (`lib/chat/nlu`, `budgetOf`):
 * kwota w euro, której nie ma czym przeliczyć, nie jest filtrem. Nie zgadujemy
 * kursu i nie porównujemy euro z groszami — budżet po prostu nie istnieje,
 * a klient widzi całą flotę zamiast pustej siatki.
 */
export function parseBudget(
  params: FleetFilterParams,
  plnPerEur?: number | null,
): FleetBudget | null {
  const kind: BudgetKind = params.budget === "total" ? "total" : "day";
  const wantsEur = params.cur === "eur";
  const inEur = wantsEur && Boolean(plnPerEur);
  if (wantsEur && !inEur) return null;

  const amount = (raw?: string): number | null => {
    if (!raw) return null;
    // A comma is how half of Europe writes a decimal point, and the phone
    // keyboard offers whichever one it feels like.
    const n = Number(raw.replace(",", ".").replace(/\s/g, ""));
    if (!Number.isFinite(n) || n <= 0) return null;
    const grosze = inEur ? n * (plnPerEur as number) * 100 : n * 100;
    return Math.round(grosze);
  };

  let minGrosze = amount(params.min);
  let maxGrosze = amount(params.max);

  // "od 400 do 200" is one hand typing two numbers in the order it thought of
  // them, not a request for nothing. Both ends are the same kind of figure, so
  // the intent is unambiguous and swapping keeps it.
  if (minGrosze != null && maxGrosze != null && minGrosze > maxGrosze) {
    [minGrosze, maxGrosze] = [maxGrosze, minGrosze];
  }

  if (minGrosze == null && maxGrosze == null) return null;
  return { kind, minGrosze, maxGrosze };
}

/** The filter query, straight off the URL — every field still untrusted. */
export type FleetFilterParams = {
  from?: string;
  to?: string;
  segment?: string;
  /** "day" (default) or "total" — what the amounts below are a budget for. */
  budget?: string;
  /** The two ends, in whole currency units as typed. Either may be absent. */
  min?: string;
  max?: string;
  /** "pln" (default) or "eur" — the currency the amounts were typed in. */
  cur?: string;
};

export type FilteredFleet = {
  range: { from: string; to: string } | null;
  activeSegment: FleetSegment | null;
  /** What the dates left, before the budget and the class narrowed it. */
  available: FleetCar[];
  /** What the dates and the budget left, before the class narrowed it. */
  affordable: FleetCar[];
  /** Per-class counts of `available` — what a chip click would return. */
  counts: Map<FleetSegment, number>;
  /** What the grid renders. */
  shown: FleetCar[];
  /** The budget in force, in złoty grosze, or null when none was stated. */
  budget: FleetBudget | null;
  /** How many cars the budget removed, out of what the dates left. */
  overBudget: number;
};

/**
 * Apply the date and class filters to a fleet listing.
 *
 * Shared by `/fleet` and the home page's fleet section so the two never drift:
 * one place decides what a query means, both grids answer it the same way.
 */
export async function filterFleet(
  fleet: FleetCar[],
  params: FleetFilterParams,
  /**
   * Today's EUR/PLN rate, when the page has one. Needed only to read a budget
   * typed in euro; everything else here is currency-blind.
   */
  plnPerEur?: number | null,
): Promise<FilteredFleet> {
  const { from, to, segment } = params;
  // Shape-checked before either value reaches a query, and only trusted as a
  // pair: half a range cannot filter anything, and a backwards one is a typo,
  // not a request to show nothing.
  const range =
    from && to && ISO_DATE.test(from) && ISO_DATE.test(to) && to >= from
      ? { from, to }
      : null;
  // An unknown class in the URL falls back to the whole fleet rather than an
  // empty page: a mistyped or retired chip should not look like a sold-out one.
  const activeSegment: FleetSegment | null = isFleetSegment(segment)
    ? segment
    : null;

  const freeUnits = range
    ? await getFreeUnitsByModel(range.from, range.to)
    : null;

  // With dates chosen the grid shows what can actually be rented. Cars with no
  // free unit are dropped rather than greyed out — a page of dead cards is a
  // worse answer than a short honest list plus the count of what was hidden.
  const available = freeUnits
    ? fleet.filter((car) => (freeUnits.get(car.id) ?? 0) > 0)
    : fleet;

  /*
   * The budget narrows next, before the chips are counted.
   *
   * It runs through the Pricing Engine, never over `dailyPriceGrosze` — that
   * column is the 1–2 day rate, the most expensive one there is, and filtering
   * by it would hide cars the visitor can actually afford for the week they
   * asked about. Per-day compares the advertised "od" figure, which is the
   * number printed on the card they are looking at; total compares the real
   * charge for the chosen dates, from the same function the booking form bills.
   */
  const budget = parseBudget(params, plnPerEur);
  const days = range
    ? rentalDays(new Date(range.from), new Date(range.to))
    : null;

  const affordable =
    budget == null
      ? available
      : available.filter((car) =>
          matchesFleetQuery(
            car,
            budget.kind === "total"
              ? {
                  minTotalGrosze: budget.minGrosze,
                  maxTotalGrosze: budget.maxGrosze,
                }
              : {
                  minDailyGrosze: budget.minGrosze,
                  maxDailyGrosze: budget.maxGrosze,
                },
            {
              fromDailyGrosze: lowestDailyRateGrosze(car),
              // Without dates there is no total, and a total budget then
              // narrows nothing rather than emptying the grid — see
              // `matchesFleetQuery`.
              totalGrosze:
                days == null ? undefined : rentalChargeGrosze(car, days),
            },
          ),
        );

  // Chip counts describe what a click would actually return, so they are taken
  // after the date AND budget filters — the class row and the grid never
  // disagree. A chip that promised five cars and delivered two would be the
  // same lie whichever filter did the hiding.
  const counts = new Map<FleetSegment, number>(
    FLEET_SEGMENTS.map((s) => [
      s,
      affordable.filter((car) => car.segments.includes(s)).length,
    ]),
  );

  const shown = activeSegment
    ? affordable.filter((car) => car.segments.includes(activeSegment))
    : affordable;

  return {
    range,
    activeSegment,
    available,
    affordable,
    counts,
    shown,
    budget,
    overBudget: available.length - affordable.length,
  };
}
