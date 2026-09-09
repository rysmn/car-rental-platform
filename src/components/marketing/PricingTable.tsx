import { Reveal } from "@/components/motion/Reveal";
import { priceOnRequestLabel } from "@/lib/format";
import { Money } from "@/components/currency/Money";
import { getPriceTiers, type PriceRow } from "@/lib/marketing/content";

/**
 * Jedna komórka cennika — w OBU walutach, jak każda inna cena na tej stronie.
 *
 * Do 02.09.2026 tabela wołała `formatPlnOrAsk`, czyli wypisywała same złote.
 * Skutek był widoczny na stronie głównej po przełączeniu na euro: karty aut
 * pokazywały „≈ €88", a stojący pod nimi CENNIK — „1 230 zł". Jedna strona,
 * dwie waluty, ta sama flota. Zmierzone przeglądarką: 51 kwot w złotych na
 * stronie ustawionej na euro.
 *
 * `Money` niesie obie kwoty i chowa jedną CSS-em, więc tabela przełącza się
 * razem z resztą serwisu i nie ma tu żadnej własnej wiedzy o kursie.
 * Cena „na zapytanie" zostaje zdaniem — zdanie nie ma waluty.
 */
function Cena({ grosze, locale }: { grosze: number; locale: string }) {
  if (grosze > 0) return <Money grosze={grosze} />;
  return <>{priceOnRequestLabel(locale)}</>;
}

/**
 * Daily rate by rental length + the monthly rate. The matrix is wide, so it
 * scrolls inside its own container rather than pushing the page sideways.
 */
export function PricingTable({
  locale,
  modelLabel,
  note,
  rows,
}: {
  locale: string;
  modelLabel: string;
  note?: string;
  /** Built from live fleet data so the table always matches the calculator. */
  rows: PriceRow[];
}) {
  const tiers = getPriceTiers(locale);

  return (
    <Reveal>
      {/*
        `tabIndex` i `role="group"` na przewijanym pudełku (06.09.2026).

        Tabela cennika jest szersza niż telefon i przewija się w bok. Myszą
        i palcem — bez zarzutu; klawiaturą nie dało się jej ruszyć wcale, bo
        w środku nie ma ani jednego elementu, na który da się przejść Tabem
        (same komórki tekstowe). Audyt nazywa to `scrollable-region-focusable`
        i ma rację: dla kogoś, kto nie używa myszy, połowa cennika po prostu
        nie istniała.

        `tabIndex={0}` daje temu obszarowi fokus, a wtedy strzałki przewijają
        go tak samo jak każdy inny przewijany obszar w przeglądarce. `role`
        i `aria-label` są po to, żeby czytnik ekranu ogłosił, CO to za obszar,
        zamiast oznajmić bezimienną grupę. Zero zmian w wyglądzie: obramowanie
        fokusu rysuje ten sam styl, co przy odnośnikach.
      */}
      <div
        tabIndex={0}
        role="group"
        aria-label={modelLabel}
        className="focus-visible:outline-red -mx-6 overflow-x-auto px-6 focus-visible:outline-2 focus-visible:outline-offset-2 md:mx-0 md:px-0"
      >
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead>
            <tr className="border-line border-y">
              <th className="label-tight text-ink-faint py-4 pr-6 text-[10px]">
                {modelLabel}
              </th>
              {tiers.map((tier) => (
                <th
                  key={tier}
                  className="label-tight text-ink-faint py-4 pr-6 text-[10px]"
                >
                  {tier}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.slug} className="border-line border-b">
                <th
                  scope="row"
                  className="font-heading text-ink py-5 pr-6 text-sm font-bold md:text-base"
                >
                  {row.name}
                </th>
                {row.daily.map((price, i) => (
                  <td
                    key={tiers[i]}
                    className="text-ink-muted py-5 pr-6 text-sm whitespace-nowrap"
                  >
                    <Cena grosze={price} locale={locale} />
                  </td>
                ))}
                <td className="text-silver py-5 pr-6 text-sm whitespace-nowrap">
                  <Cena grosze={row.monthly} locale={locale} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {note ? <p className="text-ink-faint mt-5 text-xs">{note}</p> : null}
    </Reveal>
  );
}
