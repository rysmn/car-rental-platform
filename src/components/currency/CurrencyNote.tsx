"use client";

import { cn } from "@/lib/utils";
import { useEurRate } from "./CurrencyProvider";

/**
 * "Ceny w EUR mają charakter orientacyjny. Rozliczenie końcowe dokonywane jest
 * w PLN." — the sentence §3 asks for, in the two places where somebody is
 * actually deciding to spend money: the car page and the booking panel.
 *
 * ## It appears only when it is true
 *
 * Two conditions, and each is enforced by a different mechanism because they
 * fail at different times:
 *
 *  · **No rate → no sentence.** There are no euro prices on the page at all, so
 *    a disclaimer about them is noise. That check is JavaScript, because the
 *    rate is a server fact handed down through `CurrencyProvider`.
 *  · **Złoty selected → no sentence.** Every price the visitor is reading is
 *    already in the settlement currency and there is nothing to qualify. That
 *    check is CSS (`money-eur-block`, switched by `html[data-currency]`), for
 *    the same reason the prices themselves are: the server does not know which
 *    currency was chosen, and a sentence that appears a moment after the page
 *    does is worse than one that was always in the right state.
 *
 * The compact form of the same caveat is the `≈` in front of every euro amount
 * and the `title` on the switch. This is its long form, and it is deliberately
 * not on every card — a disclaimer repeated twelve times down a grid stops
 * being read after the second one.
 */
export function CurrencyNote({
  note,
  className,
}: {
  /** The sentence itself, in the reader's language (`Nav.currencyNote`). */
  note: string;
  className?: string;
}) {
  const rate = useEurRate();
  if (!rate) return null;

  return (
    <p className={cn("money-eur-block text-ink-faint text-xs", className)}>
      {note}
    </p>
  );
}
