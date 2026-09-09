import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import {
  getCarEconomics,
  getCarDailySeries,
  getMonthlySeries,
  type CarEconomics,
} from "@/lib/admin/economics";
import { listCarExpenses } from "@/lib/admin/expenses";
import { EXPENSE_LABEL } from "@/lib/admin/expense-options";
import { CAR_STATUS_LABEL, isCarStatus } from "@/lib/admin/fleet-options";
import {
  PaybackMeter,
  NetCurve,
  DailyFlow,
  OccupancyStrip,
  CostBreakdown,
} from "@/components/admin/economics-charts";
import { formatPln, formatPlnPrecise, pluralPl } from "@/lib/format";

export const metadata = { title: "Analiza auta" };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Windows the charts can be drawn over. Anything else falls back to 180 days. */
const WINDOWS = [90, 180, 365] as const;
const DEFAULT_WINDOW = 180;

/** "2026-08" → "sierpień 2026". */
function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("pl-PL", {
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

function formatPl(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

/** A headline figure. `tone` colours only the number, never the label. */
function Stat({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "good" | "bad";
}) {
  const color =
    tone === "good"
      ? "text-emerald-400"
      : tone === "bad"
        ? "text-red"
        : "text-ink";
  return (
    <div className="bg-void p-6">
      <p className="label-tight text-ink-faint text-[10px]">{label}</p>
      <p
        className={`font-heading mt-3 text-2xl font-bold tabular-nums ${color}`}
      >
        {value}
      </p>
      {hint && <p className="text-ink-faint mt-1 text-xs">{hint}</p>}
    </div>
  );
}

/**
 * The payback panel.
 *
 * Three genuinely different states, and none of them may be presented as the
 * others: no purchase price entered (we cannot know), already paid back (a
 * date in the past is not a forecast), and still owing at a rate that either
 * does or does not get there.
 */
function Payback({ e }: { e: CarEconomics }) {
  if (e.purchasePriceGrosze == null) {
    return (
      <div className="border-line border border-dashed p-6">
        <p className="label-tight text-ink-faint text-[10px]">Zwrot z zakupu</p>
        <p className="text-silver mt-3 text-sm">
          Nie policzę zwrotu bez ceny zakupu. Wpisz ją przy egzemplarzu{" "}
          <Link
            href={{
              pathname: "/admin/fleet/[id]",
              params: { id: e.modelId },
            }}
            className="text-ink tap-area underline underline-offset-4"
          >
            w zakładce Flota
          </Link>{" "}
          — marża i wykorzystanie liczą się już teraz, brakuje tylko celu, do
          którego mają dojść.
        </p>
      </div>
    );
  }

  const paidBack = e.marginGrosze >= e.purchasePriceGrosze;

  return (
    <div className="border-line border p-6">
      <p className="label-tight text-ink-faint text-[10px]">Zwrot z zakupu</p>
      <div className="mt-4">
        <PaybackMeter
          recoveredGrosze={e.recoveredGrosze ?? 0}
          purchaseGrosze={e.purchasePriceGrosze}
        />
      </div>
      <div className="mt-5 space-y-1 text-xs">
        {paidBack ? (
          <p className="text-emerald-400">
            Auto zwróciło koszt zakupu. Nadwyżka:{" "}
            <span className="tabular-nums">
              {formatPln(e.marginGrosze - e.purchasePriceGrosze, "pl")}
            </span>
            .
          </p>
        ) : (
          <>
            <p className="text-silver">
              Zostało do odrobienia:{" "}
              <span className="tabular-nums">
                {formatPln(e.remainingGrosze ?? 0, "pl")}
              </span>
            </p>
            {e.paybackOn ? (
              <p className="text-silver">
                Przy obecnym tempie ({formatPln(e.netPerDayGrosze, "pl")} /
                dobę) zwrot ok.{" "}
                <span className="text-ink tabular-nums">
                  {formatPl(e.paybackOn)}
                </span>{" "}
                <span className="text-ink-faint">
                  (za {e.paybackDaysLeft}{" "}
                  {pluralPl(e.paybackDaysLeft ?? 0, "dzień", "dni", "dni")})
                </span>
              </p>
            ) : (
              <p className="text-red">
                {e.netPerDayGrosze > 0
                  ? "Przy obecnym tempie zwrot wypada za ponad 27 lat — to arytmetyka, nie prognoza."
                  : "Przy obecnym tempie auto się nie zwróci: koszty przewyższają przychód."}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default async function CarAnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; carId: string }>;
  searchParams: Promise<{ okno?: string }>;
}) {
  const { locale, carId } = await params;
  setRequestLocale(locale);
  if (!UUID_RE.test(carId)) notFound();

  const requested = Number((await searchParams).okno);
  const windowDays = (WINDOWS as readonly number[]).includes(requested)
    ? requested
    : DEFAULT_WINDOW;

  const [economics, days, expenses, months] = await Promise.all([
    getCarEconomics(carId),
    getCarDailySeries(carId, windowDays),
    listCarExpenses(carId),
    getMonthlySeries(12, carId),
  ]);
  if (!economics) notFound();
  const e = economics;

  const windowRevenue = days.reduce((n, d) => n + d.revenueGrosze, 0);
  const windowExpense = days.reduce((n, d) => n + d.expenseGrosze, 0);

  return (
    <div>
      <Link
        href="/admin/analytics"
        className="-my-2 inline-flex min-h-11 items-center label-tight text-ink-faint text-[10px] transition-colors hover:text-ink"
      >
        ← Analityka
      </Link>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="font-heading text-3xl font-bold">{e.plate}</h1>
        <span className="text-silver text-sm">{e.carName}</span>
        <span className="border-line text-ink-faint border px-2 py-0.5 text-[10px]">
          {isCarStatus(e.status) ? CAR_STATUS_LABEL[e.status] : e.status}
        </span>
      </div>
      <p className="text-ink-muted mt-2 text-sm">
        Liczone od {formatPl(e.since)} — {e.daysOwned}{" "}
        {pluralPl(e.daysOwned, "dzień", "dni", "dni")} w firmie. Przychód tylko
        z rezerwacji potwierdzonych i zakończonych, rozłożony na dni wynajmu.
        Cena zakupu nie wchodzi w koszty — jest celem, do którego marża ma
        dojść.
      </p>

      {/* Filters in one row above the charts. */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <span className="label-tight text-ink-faint text-[10px]">Okres</span>
        {WINDOWS.map((w) => (
          <Link
            key={w}
            href={{
              pathname: "/admin/analytics/[carId]",
              params: { carId },
              query: { okno: String(w) },
            }}
            className={`label-tight tap border px-3 py-1.5 text-[11px] transition-colors ${
              w === windowDays
                ? "border-red bg-red/10 text-white"
                : "border-line-strong text-silver hover:border-ink hover:text-ink"
            }`}
          >
            {w} dni
          </Link>
        ))}
        <span className="flex-1" />
        <Link
          href={{
            pathname: "/admin/analytics/raport",
            query: { auto: carId },
          }}
          className="label border-line-strong tap inline-flex h-9 items-center border px-4 text-xs text-ink transition-colors hover:border-ink hover:bg-ink/5"
        >
          Raport / PDF
        </Link>
        {/* Plain anchor — a file download, not a client-side navigation. */}
        {}
        <a
          href={`/api/admin/report?auto=${carId}`}
          className="label border-line-strong tap inline-flex h-9 items-center border px-4 text-xs text-ink transition-colors hover:border-ink hover:bg-ink/5"
        >
          Excel (.xlsx)
        </a>
      </div>

      <div className="border-line bg-line mt-6 grid gap-px border sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Przychód (całość)"
          value={formatPln(e.revenueGrosze, "pl")}
          hint={`${e.rentals} ${pluralPl(e.rentals, "wynajem", "wynajmy", "wynajmów")} · ${e.daysRented} ${pluralPl(e.daysRented, "dzień", "dni", "dni")}`}
        />
        <Stat
          label="Wydatki (całość)"
          value={formatPln(e.expensesGrosze, "pl")}
          hint={`${formatPln(e.costPerDayGrosze, "pl")} / dobę`}
        />
        <Stat
          label="Marża"
          value={formatPln(e.marginGrosze, "pl")}
          hint={
            e.marginPct == null
              ? "brak przychodu"
              : `${Math.round(e.marginPct * 100)}% przychodu`
          }
          tone={e.marginGrosze >= 0 ? "good" : "bad"}
        />
        <Stat
          label="Wynik na dobę"
          value={formatPln(e.netPerDayGrosze, "pl")}
          hint={
            e.netPerDayGrosze >= 0
              ? "tyle auto zarabia każdego dnia posiadania"
              : "tyle auto traci każdego dnia posiadania"
          }
          tone={e.netPerDayGrosze >= 0 ? "good" : "bad"}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Payback e={e} />

        <div className="border-line border p-6">
          <p className="label-tight text-ink-faint text-[10px]">
            Postój i koszt stały
          </p>
          <p className="font-heading mt-3 text-2xl font-bold text-ink tabular-nums">
            {e.daysIdle} {pluralPl(e.daysIdle, "dzień", "dni", "dni")}
          </p>
          <p className="text-ink-faint mt-1 text-xs">
            {Math.round((1 - e.utilisation) * 100)}% czasu posiadania auto stoi.
          </p>
          <div className="border-line mt-4 space-y-1 border-t pt-4 text-xs">
            <p className="text-silver">
              Wolne (dostępne, nikt nie zarezerwował):{" "}
              <span className="tabular-nums">{e.daysFree}</span> —{" "}
              <span className="text-ink-faint">to problem sprzedaży</span>
            </p>
            <p className="text-silver">
              Zablokowane (serwis, blokady):{" "}
              <span className="tabular-nums">{e.daysBlocked}</span> —{" "}
              <span className="text-ink-faint">to problem operacyjny</span>
            </p>
          </div>
          <div className="border-line mt-4 space-y-1 border-t pt-4 text-xs">
            <p className="text-silver">
              Koszty stałe (ubezpieczenie, leasing, podatki, parking):{" "}
              <span className="tabular-nums">
                {formatPln(e.standingPerDayGrosze, "pl")} / dobę
              </span>
            </p>
            <p className="text-silver">
              Koszt samego postoju:{" "}
              <span className="text-red tabular-nums">
                {formatPln(e.idleCostGrosze, "pl")}
              </span>
            </p>
            <p className="text-ink-faint">
              To koszty stałe pomnożone przez dni postoju — pieniądze wydane na
              auto, które w tym czasie nic nie zarobiło. Zero oznacza, że nie
              wpisano jeszcze żadnego kosztu stałego.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="border-line border p-6">
          <p className="label-tight text-ink-faint text-[10px]">
            Amortyzacja (utrata wartości)
          </p>
          {e.depreciationToDateGrosze == null ? (
            <p className="text-silver mt-3 text-sm">
              Nie policzę bez wartości po amortyzacji i okresu. Uzupełnisz je
              przy egzemplarzu{" "}
              <Link
                href={{
                  pathname: "/admin/fleet/[id]",
                  params: { id: e.modelId },
                }}
                className="text-ink tap-area underline underline-offset-4"
              >
                w zakładce Flota
              </Link>
              . To zwykle największy koszt auta i nie przychodzi na żadnej
              fakturze — bez niego marża wygląda lepiej, niż jest.
            </p>
          ) : (
            <>
              <p className="font-heading mt-3 text-2xl font-bold text-ink tabular-nums">
                {formatPln(e.depreciationToDateGrosze, "pl")}
              </p>
              <div className="border-line mt-4 space-y-1 border-t pt-4 text-xs">
                <p className="text-silver">
                  Wartość księgowa dziś:{" "}
                  <span className="tabular-nums">
                    {formatPln(e.bookValueGrosze ?? 0, "pl")}
                  </span>
                </p>
                <p
                  className={
                    (e.tcoMarginGrosze ?? 0) >= 0
                      ? "text-emerald-400"
                      : "text-red"
                  }
                >
                  Marża po amortyzacji:{" "}
                  <span className="tabular-nums">
                    {formatPln(e.tcoMarginGrosze ?? 0, "pl")}
                  </span>
                </p>
                <p className="text-ink-faint">
                  Amortyzacja nie wchodzi do marży wyżej — marża to „przychód
                  minus realnie wydane pieniądze”. Tu widzisz pełny obraz.
                </p>
              </div>
            </>
          )}
        </div>

        <div className="border-line border p-6">
          <p className="label-tight text-ink-faint text-[10px]">
            Koszt i przychód na kilometr
          </p>
          {e.costPerKmGrosze == null ? (
            <p className="text-silver mt-3 text-sm">
              Brak stanów licznika. Wpisz je przy rezerwacjach (wydanie i zwrot)
              — to jedyna miara, którą uczciwie porównasz auto tanie z drogim.
            </p>
          ) : (
            <>
              <p className="font-heading mt-3 text-2xl font-bold text-ink tabular-nums">
                {formatPlnPrecise(e.costPerKmGrosze, "pl")} / km
              </p>
              <div className="border-line mt-4 space-y-1 border-t pt-4 text-xs">
                <p className="text-silver">
                  Przychód:{" "}
                  <span className="tabular-nums">
                    {formatPlnPrecise(e.revenuePerKmGrosze ?? 0, "pl")} / km
                  </span>
                </p>
                <p className="text-silver">
                  Przejechano:{" "}
                  <span className="tabular-nums">
                    {e.kmDriven.toLocaleString("pl-PL")} km
                  </span>
                </p>
                <p className="text-ink-faint">
                  Liczone z {e.rentalsWithKm} z {e.rentals}{" "}
                  {pluralPl(e.rentals, "wynajmu", "wynajmów", "wynajmów")} —
                  tylko te mają oba stany licznika.
                  {e.rentalsWithKm < e.rentals &&
                    " Przy niepełnych danych stawka jest zawyżona, bo cały koszt dzieli się przez część kilometrów."}
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      <section className="mt-14">
        <h2 className="label text-xs text-ink">Narastający wynik</h2>
        <p className="text-ink-faint mt-1 text-xs">
          Przychód minus wydatki, dzień po dniu, w wybranym okresie. Przerywana
          linia to cena zakupu — przecięcie z krzywą to moment zwrotu.
        </p>
        <NetCurve days={days} targetGrosze={e.purchasePriceGrosze} />
      </section>

      <section className="mt-14">
        <h2 className="label text-xs text-ink">Dzień po dniu</h2>
        <p className="text-ink-faint mt-1 text-xs">
          W okresie {windowDays} dni: przychód {formatPln(windowRevenue, "pl")},
          wydatki {formatPln(windowExpense, "pl")}. Najedź na słupek, by
          zobaczyć konkretny dzień.
        </p>
        <DailyFlow days={days} />
      </section>

      <section className="mt-14">
        <h2 className="label text-xs text-ink">Zajętość</h2>
        <p className="text-ink-faint mt-1 text-xs">
          Każde pole to jedna doba wybranego okresu.
        </p>
        <OccupancyStrip days={days} />
      </section>

      <section className="mt-14">
        <h2 className="label text-xs text-ink">Struktura kosztów</h2>
        <p className="text-ink-faint mt-1 text-xs">
          Wszystkie wydatki tego egzemplarza, od początku.
        </p>
        <CostBreakdown byGroup={e.byGroup} byCategory={e.byCategory} />
      </section>

      <section className="mt-14">
        <h2 className="label text-xs text-ink">Miesiąc po miesiącu</h2>
        <p className="text-ink-faint mt-1 mb-4 text-xs">
          Ostatnie 12 miesięcy tego egzemplarza, niezależnie od wybranego okresu
          wykresów.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-line text-ink-faint border-y">
                <th className="label-tight py-3 pr-6 text-[10px]">Miesiąc</th>
                <th className="label-tight py-3 pr-6 text-[10px]">Przychód</th>
                <th className="label-tight py-3 pr-6 text-[10px]">Wydatki</th>
                <th className="label-tight py-3 pr-6 text-[10px]">Marża</th>
                <th className="label-tight py-3 text-[10px]">Dni wynajęte</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.month} className="border-line border-b">
                  <td className="py-3 pr-6 text-ink">
                    {monthLabel(m.month)}
                  </td>
                  <td className="text-silver py-3 pr-6 whitespace-nowrap tabular-nums">
                    {formatPln(m.revenueGrosze, "pl")}
                  </td>
                  <td className="text-silver py-3 pr-6 whitespace-nowrap tabular-nums">
                    {formatPln(m.expenseGrosze, "pl")}
                  </td>
                  <td
                    className={`py-3 pr-6 whitespace-nowrap tabular-nums ${
                      m.marginGrosze >= 0 ? "text-silver" : "text-red"
                    }`}
                  >
                    {formatPln(m.marginGrosze, "pl")}
                  </td>
                  <td className="text-silver py-3 tabular-nums">
                    {m.daysRented}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-14">
        <h2 className="label text-xs text-ink">Wszystkie wydatki</h2>
        <p className="text-ink-faint mt-1 mb-4 text-xs">
          Ta sama treść co wykresy powyżej, w formie tabeli. Wydatki dodajesz i
          poprawiasz przy egzemplarzu{" "}
          <Link
            href={{
              pathname: "/admin/fleet/[id]",
              params: { id: e.modelId },
            }}
            className="text-ink tap-area underline underline-offset-4"
          >
            w zakładce Flota
          </Link>
          .
        </p>
        {expenses.length === 0 ? (
          <p className="border-line text-silver border px-5 py-6 text-center text-sm">
            Brak zapisanych wydatków.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-line text-ink-faint border-y">
                  <th className="label-tight py-3 pr-6 text-[10px]">Data</th>
                  <th className="label-tight py-3 pr-6 text-[10px]">Rodzaj</th>
                  <th className="label-tight py-3 pr-6 text-[10px]">Kwota</th>
                  <th className="label-tight py-3 pr-6 text-[10px]">
                    Przebieg
                  </th>
                  <th className="label-tight py-3 text-[10px]">Opis</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((x) => (
                  <tr key={x.id} className="border-line border-b">
                    <td className="text-silver py-3 pr-6 whitespace-nowrap tabular-nums">
                      {formatPl(x.incurredOn)}
                    </td>
                    <td className="py-3 pr-6 text-ink">
                      {EXPENSE_LABEL[x.category]}
                    </td>
                    <td className="py-3 pr-6 text-ink tabular-nums">
                      {formatPln(x.amountGrosze, "pl")}
                    </td>
                    <td className="text-silver py-3 pr-6 tabular-nums">
                      {x.odometerKm != null
                        ? `${x.odometerKm.toLocaleString("pl-PL")} km`
                        : "—"}
                    </td>
                    <td className="text-silver py-3">{x.note ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
