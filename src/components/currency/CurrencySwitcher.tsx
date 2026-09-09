"use client";

import { cn } from "@/lib/utils";
import { useEurRate } from "./CurrencyProvider";

export const CURRENCY_KEY = "aa.currency.v1";

/**
 * Applies the stored currency to `<html data-currency>` before first paint.
 *
 * Word for word the same trick as `THEME_INIT_SCRIPT`, and for the same reason:
 * without it, a visitor who chose euro last week loads the page in złoty and
 * watches every price on it rewrite itself a moment later. Inline, synchronous,
 * and a plain string because it has to run before React exists.
 *
 * Only `"eur"` is honoured. Anything else — absent, corrupt, somebody else's
 * key, storage that throws in a private window — leaves the document in złoty,
 * which is the currency this company actually settles in.
 */
export const CURRENCY_INIT_SCRIPT = `(function(){try{var c=localStorage.getItem('${CURRENCY_KEY}');document.documentElement.setAttribute('data-currency',c==='eur'?'eur':'pln')}catch(e){document.documentElement.setAttribute('data-currency','pln')}})()`;

/**
 * PLN | EUR, in two glyphs.
 *
 * ## No React state, on purpose
 *
 * The active currency is an attribute on `<html>`, written before hydration and
 * read back by CSS (`.cur-opt[data-cur]` in `globals.css`). The buttons only
 * write; nothing here re-renders when the currency changes, which is why
 * switching is instant on a page holding forty prices and why the server and the
 * client can never disagree about which one is selected.
 *
 * ## It disappears when there is no rate
 *
 * Not disabled, not greyed — absent. A switch that cannot switch is worse than
 * no switch, and "the European Central Bank did not answer today" is not
 * something to explain to somebody trying to rent a car. Prices stay in złoty,
 * which is what they were before this feature existed.
 *
 * ## The disclaimer travels with it
 *
 * `title` on the group carries "ceny orientacyjne, rozliczenie w PLN" so the
 * caveat is one hover away wherever the switch is, without a banner on every
 * card. The car page and the booking panel say it in full sentences — those are
 * the two places where somebody is deciding to spend money.
 */
export function CurrencySwitcher({
  className,
  note,
  labelPln = "PLN",
  labelEur = "EUR",
  groupLabel,
}: {
  className?: string;
  /** Nazwa grupy dla czytnika ekranu, np. „Zmień walutę". */
  groupLabel?: string;
  /** The "prices are indicative" sentence, in the reader's language. */
  note: string;
  labelPln?: string;
  labelEur?: string;
}) {
  const rate = useEurRate();
  if (!rate) return null;

  const choose = (currency: "pln" | "eur") => {
    document.documentElement.setAttribute("data-currency", currency);
    try {
      localStorage.setItem(CURRENCY_KEY, currency);
    } catch {
      /* storage unavailable — the choice simply does not outlive this visit */
    }
  };

  return (
    /*
      Grupa z nazwą — dwa przyciski „zł" i „€" bez niej brzmią dla czytnika
      ekranu jak dwa nieopisane przyciski. `title` niesie zastrzeżenie
      o orientacyjnych cenach i zostaje tam, gdzie było.
    */
    <div
      role="group"
      aria-label={groupLabel}
      className={cn("label-tight flex items-center text-[11px]", className)}
      title={note}
    >
      {(
        [
          ["pln", labelPln],
          ["eur", labelEur],
        ] as const
      ).map(([currency, label], i) => (
        <span key={currency} className="flex items-center">
          {i > 0 && <span className="text-ink-faint">/</span>}
          <button
            type="button"
            data-cur={currency}
            onClick={() => choose(currency)}
            // Same 32×40 box as the language switch beside it, lifted to a 44px
            // hit area by `.tap-area` without widening the header — the mobile
            // control row has four pixels of slack at 320px and no more.
            className="cur-opt tap-area hover:text-silver flex h-10 min-w-8 items-center justify-center transition-colors"
          >
            {label}
          </button>
        </span>
      ))}
    </div>
  );
}
