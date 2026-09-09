import { priceOnRequestLabel } from "@/lib/format";
import { Money } from "@/components/currency/Money";
import { getPriceTiers, tierRatesGrosze } from "@/lib/marketing/content";
import type { TierPricing } from "@/lib/booking/pricing";

/**
 * One rung of the ladder: a price in the reader's currency, or the operator's
 * sentence where there is no price.
 *
 * `<Money>` rather than `formatPlnOrAsk` so this table switches with the rest of
 * the page. It is the one place a visitor can see the WHOLE structure of what a
 * car costs, which makes it the place a euro reader most needs the conversion —
 * and it is still the same five fields, converted, never a second price list.
 */
function Rate({ grosze, locale }: { grosze: number; locale: string }) {
  return grosze > 0 ? (
    <Money grosze={grosze} />
  ) : (
    <>{priceOnRequestLabel(locale)}</>
  );
}

/**
 * The rate ladder for a single model, shown directly under its name so the
 * price is visible before the visitor touches the calculator.
 *
 * Two layouts, because five tiers do not fit one phone-width row and a
 * horizontal scroll hides prices behind a gesture nobody knows to make:
 *
 *  - phone: a three-across grid, so the ladder reads as two rows. The final
 *    cell stretches across the remainder rather than leaving a gap, which is
 *    what made a wrapping grid look broken before.
 *  - `md` and up: the original single-row table, where every tier is visible
 *    side by side and the progression down the ladder is the whole point.
 */
export function CarRates({
  car,
  locale,
  title,
  note,
}: {
  car: TierPricing;
  locale: string;
  title: string;
  note?: string;
}) {
  const tiers = getPriceTiers(locale);
  const rates = tierRatesGrosze(car);
  const rows = tiers.map((tier, i) => ({ tier, rate: rates[i] }));

  // How many columns the last cell has to swallow to finish its row. With five
  // tiers that is two; with six it is one, and the grid stays flush either way.
  const remainder = rows.length % 3;
  const lastSpan = remainder === 0 ? 1 : 3 - remainder + 1;

  return (
    <div>
      <h2 className="label-tight text-ink-faint text-[10px]">{title}</h2>

      {/* Phone: two rows of cells, no scrolling. */}
      <dl className="border-line bg-line mt-4 grid grid-cols-3 gap-px border md:hidden">
        {rows.map(({ tier, rate }, i) => (
          <div
            key={tier}
            className={
              i === rows.length - 1 && lastSpan === 3
                ? "bg-void col-span-3 px-4 py-4"
                : i === rows.length - 1 && lastSpan === 2
                  ? "bg-void col-span-2 px-4 py-4"
                  : "bg-void px-4 py-4"
            }
          >
            <dt className="label-tight text-ink-faint text-[10px] whitespace-nowrap">
              {tier}
            </dt>
            {/* No `whitespace-nowrap` here on purpose. A priced tier is short
                ("1 200 zł") and never wraps; a tier with no rate prints a whole
                sentence ("Cena ustalana indywidualnie"), and forced onto one
                line such a sentence was 204px wide in a 158px cell — enough to
                push the WHOLE page into a horizontal scroll at 320px. Zdanie
                zmieniło brzmienie 04.09.2026, ale nie długość rzędu wielkości,
                więc powód tej klasy jest ten sam. */}
            <dd className="font-heading text-ink mt-2 text-sm font-bold">
              <Rate grosze={rate} locale={locale} />
            </dd>
          </div>
        ))}
      </dl>

      {/* Tablet and up: the full ladder on one line. */}
      <div className="mt-4 hidden overflow-x-auto md:block">
        <table className="w-full min-w-[520px] border-collapse text-left">
          <thead>
            <tr className="border-line border-y">
              {rows.map(({ tier }) => (
                <th
                  key={tier}
                  className="label-tight text-ink-faint py-3 pr-6 text-[10px] whitespace-nowrap"
                >
                  {tier}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-line border-b">
              {rows.map(({ tier, rate }) => (
                <td
                  key={tier}
                  className="font-heading text-ink py-4 pr-6 text-sm font-bold whitespace-nowrap"
                >
                  <Rate grosze={rate} locale={locale} />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {note ? <p className="text-ink-faint mt-3 text-xs">{note}</p> : null}
    </div>
  );
}
