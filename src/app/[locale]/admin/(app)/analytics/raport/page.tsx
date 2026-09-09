import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import {
  getFleetEconomics,
  getCarEconomics,
  getMonthlySeries,
  totalsOf,
  type CarEconomics,
} from "@/lib/admin/economics";
import { listCarExpenses } from "@/lib/admin/expenses";
import {
  EXPENSE_LABEL,
  EXPENSE_GROUP_LABEL,
  EXPENSE_GROUP_OF,
} from "@/lib/admin/expense-options";
import { getSetting } from "@/lib/admin/settings";
import { PrintButton } from "@/components/admin/PrintButton";
import {
  formatPln,
  formatPlnPrecise,
  formatDatePl,
  pluralPl,
} from "@/lib/format";

export const metadata = { title: "Raport" };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MONTHS = 12;

/**
 * The printable report — this is the PDF.
 *
 * There is no PDF generator here on purpose. Producing a PDF server-side means
 * embedding a font subset before a single "ł" renders correctly, and the result
 * would still be a worse document than the one the browser already knows how to
 * make from this page. "Drukuj → Zapisz jako PDF" gives real text (searchable,
 * selectable, copy-pasteable into a spreadsheet), correct Polish diacritics and
 * the operator's own paper size, for none of that risk.
 *
 * Tables only, no charts. The screen charts are white-on-black and a printer
 * renders them as an ink-soaked rectangle; and what anyone does with a printed
 * fleet report is read numbers off it and hand it to an accountant.
 */

function pct(v: number | null): string {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("pl-PL", {
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

const th = "border-b border-line py-2 pr-4 text-left label-tight text-[10px]";
const td = "border-b border-line/60 py-2 pr-4 align-top";

/** A labelled figure. Keeps its box in print via the border, not a fill. */
function Figure({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="border-line border p-4" data-print-box data-print-keep>
      <p className="label-tight text-ink-faint text-[10px]">{label}</p>
      <p className="font-heading mt-2 text-xl font-bold tabular-nums">
        {value}
      </p>
      {hint && <p className="text-ink-faint mt-1 text-[11px]">{hint}</p>}
    </div>
  );
}

function Bar({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-2">
      <span className="bg-line h-1.5 w-16 shrink-0" data-print-track>
        <span
          className="bg-silver block h-full"
          data-print-bar
          style={{
            width: `${Math.min(100, Math.max(value * 100, value > 0 ? 2 : 0))}%`,
          }}
        />
      </span>
      <span className="tabular-nums">{pct(value)}</span>
    </span>
  );
}

function MonthsTable({
  months,
}: {
  months: Awaited<ReturnType<typeof getMonthlySeries>>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
        <thead>
          <tr className="text-ink-faint">
            <th className={th}>Miesiąc</th>
            <th className={th}>Przychód</th>
            <th className={th}>Wydatki</th>
            <th className={th}>Marża</th>
            <th className={th}>Dni wynajęte</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <tr key={m.month}>
              <td className={td}>{monthLabel(m.month)}</td>
              <td className={`${td} tabular-nums`}>
                {formatPln(m.revenueGrosze, "pl")}
              </td>
              <td className={`${td} tabular-nums`}>
                {formatPln(m.expenseGrosze, "pl")}
              </td>
              <td className={`${td} tabular-nums`}>
                {formatPln(m.marginGrosze, "pl")}
              </td>
              <td className={`${td} tabular-nums`}>{m.daysRented}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CarReport({
  e,
  expenses,
}: {
  e: CarEconomics;
  expenses: Awaited<ReturnType<typeof listCarExpenses>>;
}) {
  return (
    <>
      <section className="mt-8">
        <h2 className="label text-xs">Podsumowanie</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Figure
            label="Przychód"
            value={formatPln(e.revenueGrosze, "pl")}
            hint={`${e.rentals} ${pluralPl(e.rentals, "wynajem", "wynajmy", "wynajmów")}`}
          />
          <Figure
            label="Wydatki"
            value={formatPln(e.expensesGrosze, "pl")}
            hint={`${formatPln(e.costPerDayGrosze, "pl")} / dobę`}
          />
          <Figure
            label="Marża"
            value={formatPln(e.marginGrosze, "pl")}
            hint={pct(e.marginPct) + " przychodu"}
          />
          <Figure
            label="Wynik na dobę"
            value={formatPln(e.netPerDayGrosze, "pl")}
            hint={`${e.daysOwned} ${pluralPl(e.daysOwned, "dzień", "dni", "dni")} w firmie`}
          />
        </div>
      </section>

      <section className="mt-8" data-print-keep>
        <h2 className="label text-xs">Zwrot i wykorzystanie</h2>
        <div className="overflow-x-auto">
          <table className="mt-3 w-full min-w-[34rem] border-collapse text-left text-sm">
            <tbody>
              <tr>
                <td className={`${td} w-72`}>Cena zakupu</td>
                <td className={`${td} tabular-nums`}>
                  {e.purchasePriceGrosze == null
                    ? "nie podano"
                    : `${formatPln(e.purchasePriceGrosze, "pl")}${e.purchasedOn ? ` (${formatDatePl(e.purchasedOn)})` : ""}`}
                </td>
              </tr>
              <tr>
                <td className={td}>Zwrócone z zakupu</td>
                <td className={td}>
                  {e.recoveredPct == null ? (
                    "brak ceny zakupu"
                  ) : (
                    <Bar value={e.recoveredPct} />
                  )}
                </td>
              </tr>
              <tr>
                <td className={td}>Przewidywany zwrot</td>
                <td className={`${td} tabular-nums`}>
                  {e.purchasePriceGrosze == null
                    ? "—"
                    : e.marginGrosze >= e.purchasePriceGrosze
                      ? "zwrócone"
                      : e.paybackOn
                        ? formatDatePl(e.paybackOn)
                        : "nie przy obecnym tempie"}
                </td>
              </tr>
              <tr>
                <td className={td}>Dni wynajęte</td>
                <td className={`${td} tabular-nums`}>
                  {e.daysRented} <Bar value={e.utilisation} />
                </td>
              </tr>
              <tr>
                <td className={td}>Dni wolne (nikt nie zarezerwował)</td>
                <td className={`${td} tabular-nums`}>{e.daysFree}</td>
              </tr>
              <tr>
                <td className={td}>Dni zablokowane (serwis, blokady)</td>
                <td className={`${td} tabular-nums`}>{e.daysBlocked}</td>
              </tr>
              <tr>
                <td className={td}>Koszt postoju</td>
                <td className={`${td} tabular-nums`}>
                  {formatPln(e.idleCostGrosze, "pl")}
                </td>
              </tr>
              <tr>
                <td className={td}>Amortyzacja do dziś</td>
                <td className={`${td} tabular-nums`}>
                  {e.depreciationToDateGrosze == null
                    ? "brak ustawień amortyzacji"
                    : formatPln(e.depreciationToDateGrosze, "pl")}
                </td>
              </tr>
              <tr>
                <td className={td}>Marża po amortyzacji</td>
                <td className={`${td} tabular-nums`}>
                  {e.tcoMarginGrosze == null
                    ? "—"
                    : formatPln(e.tcoMarginGrosze, "pl")}
                </td>
              </tr>
              <tr>
                <td className={td}>Koszt / przychód na km</td>
                <td className={`${td} tabular-nums`}>
                  {e.costPerKmGrosze == null
                    ? "brak stanów licznika"
                    : `${formatPlnPrecise(e.costPerKmGrosze, "pl")} / ${formatPlnPrecise(e.revenuePerKmGrosze ?? 0, "pl")} — ${e.kmDriven.toLocaleString("pl-PL")} km z ${e.rentalsWithKm}/${e.rentals} wynajmów`}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="label text-xs">Wydatki</h2>
        {expenses.length === 0 ? (
          <p className="text-ink-faint mt-3 text-sm">
            Brak zapisanych wydatków.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="mt-3 w-full min-w-[34rem] border-collapse text-left text-sm">
              <thead>
                <tr className="text-ink-faint">
                  <th className={th}>Data</th>
                  <th className={th}>Grupa</th>
                  <th className={th}>Rodzaj</th>
                  <th className={th}>Kwota</th>
                  <th className={th}>Przebieg</th>
                  <th className={th}>Opis</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((x) => (
                  <tr key={x.id}>
                    <td className={`${td} whitespace-nowrap tabular-nums`}>
                      {formatDatePl(x.incurredOn)}
                    </td>
                    <td className={td}>
                      {EXPENSE_GROUP_LABEL[EXPENSE_GROUP_OF[x.category]]}
                    </td>
                    <td className={td}>{EXPENSE_LABEL[x.category]}</td>
                    <td className={`${td} whitespace-nowrap tabular-nums`}>
                      {formatPln(x.amountGrosze, "pl")}
                    </td>
                    <td className={`${td} tabular-nums`}>
                      {x.odometerKm != null
                        ? `${x.odometerKm.toLocaleString("pl-PL")} km`
                        : "—"}
                    </td>
                    <td className={td}>{x.note ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ auto?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const carId = (await searchParams).auto;
  if (carId && !UUID_RE.test(carId)) notFound();

  const company = await getSetting("company");
  const today = formatDatePl(new Date().toISOString().slice(0, 10));

  if (carId) {
    const [e, months, expenses] = await Promise.all([
      getCarEconomics(carId),
      getMonthlySeries(MONTHS, carId),
      listCarExpenses(carId),
    ]);
    if (!e) notFound();

    return (
      <div data-print="report" className="mx-auto max-w-4xl">
        <Header
          title={`${e.plate} — ${e.carName}`}
          subtitle={`Raport za okres od ${formatDatePl(e.since)}`}
          company={company.email}
          today={today}
          xlsxHref={`/api/admin/report?auto=${e.carId}`}
          backHref={{
            pathname: "/admin/analytics/[carId]" as const,
            params: { carId: e.carId },
          }}
        />
        <CarReport e={e} expenses={expenses} />
        <section className="mt-8">
          <h2 className="label text-xs">Ostatnie {MONTHS} miesięcy</h2>
          <div className="mt-3">
            <MonthsTable months={months} />
          </div>
        </section>
        <Footer />
      </div>
    );
  }

  const [cars, months] = await Promise.all([
    getFleetEconomics(),
    getMonthlySeries(MONTHS),
  ]);
  const totals = totalsOf(cars);

  return (
    <div data-print="report" className="mx-auto max-w-5xl">
      <Header
        title="Raport floty"
        subtitle={`${totals.cars} ${pluralPl(totals.cars, "egzemplarz", "egzemplarze", "egzemplarzy")}`}
        company={company.email}
        today={today}
        xlsxHref="/api/admin/report"
        backHref="/admin/analytics"
      />

      <section className="mt-8">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Figure
            label="Przychód"
            value={formatPln(totals.revenueGrosze, "pl")}
          />
          <Figure
            label="Wydatki"
            value={formatPln(totals.expensesGrosze, "pl")}
          />
          <Figure
            label="Marża"
            value={formatPln(totals.marginGrosze, "pl")}
            hint={pct(totals.marginPct) + " przychodu"}
          />
          <Figure
            label="Zwrot z kapitału"
            value={pct(totals.recoveredPct)}
            hint={`${formatPln(totals.recoveredGrosze, "pl")} z ${formatPln(totals.investedGrosze, "pl")}`}
          />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="label text-xs">Egzemplarze</h2>
        <div className="overflow-x-auto">
          <table className="mt-3 w-full min-w-[34rem] border-collapse text-left text-sm">
            <thead>
              <tr className="text-ink-faint">
                <th className={th}>Egzemplarz</th>
                <th className={th}>Przychód</th>
                <th className={th}>Wydatki</th>
                <th className={th}>Marża</th>
                <th className={th}>Wykorz.</th>
                <th className={th}>Wolne</th>
                <th className={th}>Blok.</th>
                <th className={th}>Zwrot</th>
              </tr>
            </thead>
            <tbody>
              {cars.map((c) => (
                <tr key={c.carId}>
                  <td className={td}>
                    <span className="font-medium">{c.plate}</span>
                    <span className="text-ink-faint ml-2 text-xs">
                      {c.carName}
                    </span>
                  </td>
                  <td className={`${td} whitespace-nowrap tabular-nums`}>
                    {formatPln(c.revenueGrosze, "pl")}
                  </td>
                  <td className={`${td} whitespace-nowrap tabular-nums`}>
                    {formatPln(c.expensesGrosze, "pl")}
                  </td>
                  <td className={`${td} whitespace-nowrap tabular-nums`}>
                    {formatPln(c.marginGrosze, "pl")}
                  </td>
                  <td className={td}>
                    <Bar value={c.utilisation} />
                  </td>
                  <td className={`${td} tabular-nums`}>{c.daysFree}</td>
                  <td className={`${td} tabular-nums`}>{c.daysBlocked}</td>
                  <td className={`${td} tabular-nums`}>
                    {c.recoveredPct == null ? "—" : pct(c.recoveredPct)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="label text-xs">Ostatnie {MONTHS} miesięcy</h2>
        <div className="mt-3">
          <MonthsTable months={months} />
        </div>
      </section>

      <Footer />
    </div>
  );
}

function Header({
  title,
  subtitle,
  company,
  today,
  xlsxHref,
  backHref,
}: {
  title: string;
  subtitle: string;
  company: string;
  today: string;
  xlsxHref: string;
  backHref: React.ComponentProps<typeof Link>["href"];
}) {
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3 print:hidden">
        <Link
          href={backHref}
          className="label-tight text-ink-faint hover:text-ink -my-2 inline-flex min-h-11 items-center text-[10px]"
        >
          ← Wróć
        </Link>
        <span className="flex-1" />
        <PrintButton />
        {/* A plain anchor, not next/link: this is a file download from a route
            handler, and the client router would try to navigate to it. */}
        {}
        <a
          href={xlsxHref}
          className="label border-line-strong text-ink hover:border-ink hover:bg-ink/5 tap inline-flex h-9 items-center border px-4 text-xs transition-colors"
        >
          Pobierz Excel (.xlsx)
        </a>
      </div>

      <div className="border-line flex flex-wrap items-end justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="font-heading text-2xl font-bold">{title}</h1>
          <p className="text-ink-faint mt-1 text-sm">{subtitle}</p>
        </div>
        <div className="text-ink-faint text-right text-xs">
          <p className="font-medium">A&amp;A Corporation</p>
          <p>{company}</p>
          <p>Wygenerowano {today}</p>
        </div>
      </div>
    </>
  );
}

function Footer() {
  return (
    <p className="border-line text-ink-faint mt-10 border-t pt-4 text-[11px]">
      Przychód liczony z rezerwacji potwierdzonych i zakończonych, rozłożony na
      dni wynajmu. Wydatki pochodzą z kosztów wpisanych przy egzemplarzach. Cena
      zakupu nie jest kosztem — jest celem, do którego marża ma dojść. Dokument
      wygenerowany automatycznie; nie jest dokumentem księgowym.
    </p>
  );
}
