import { setRequestLocale } from "next-intl/server";
import { guardPage } from "@/lib/auth/guard";
import { Link } from "@/i18n/navigation";
import {
  getFleetAnalytics,
  getDocumentAlerts,
  getCarDocuments,
  EXPIRY_SOON_DAYS,
} from "@/lib/admin/stats";
import {
  getFleetEconomics,
  getMonthlySeries,
  salesTrend,
  totalsOf,
} from "@/lib/admin/economics";
import { getBookingAnalytics, statusLabel } from "@/lib/admin/bookings";
import { DocumentAlerts } from "@/components/admin/DocumentAlerts";
import { SalesTrend, formatPct } from "@/components/admin/economics-charts";
import { formatPln, formatPlnPrecise, pluralPl } from "@/lib/format";
import {
  resolveWindow,
  previousWindow,
  getWindowMetrics,
  getOccupancyByCar,
  getCostStructure,
  getWeekdayOccupancy,
  getSeasonality,
  getCustomerMix,
  highlightsOf,
  type InsightFilters as Filters,
} from "@/lib/admin/insights";
import { InsightFilters } from "./InsightFilters";
import { InsightSections } from "./InsightSections";
import { getDb, schema } from "@/lib/db";
import { asc, eq } from "drizzle-orm";
import { FLEET_SEGMENTS } from "@/lib/fleet/segments";

/**
 * Segment names for the filter. The public site reads these from the message
 * catalogue per locale; the panel is Polish-only, so they live here rather
 * than dragging the whole i18n runtime into an admin page.
 */
const SEGMENT_LABEL: Record<string, string> = {
  luxury: "Luxury",
  executive: "Executive",
  "premium-suv": "Premium SUV",
  electric: "Elektryczne",
  business: "Business",
  van: "Bus / Van",
};

export const metadata = { title: "Analityka" };

/**
 * Stated on the page so nobody has to read the deployment config to find out
 * where the reminders go. Matches `REMINDER_NOTIFY_TO` in lib/email/client.
 */
const REMINDER_MAILBOX = "kontakt@aacorporation.pl";

/** Utilisation as a percentage, with the bar that makes it comparable at a glance. */
function UtilisationBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-3">
      <div className="bg-line h-1.5 w-24 shrink-0">
        <div
          className="bg-red h-full"
          style={{ width: `${Math.max(pct, value > 0 ? 2 : 0)}%` }}
        />
      </div>
      <span className="tabular-nums">{pct}%</span>
    </div>
  );
}

/**
 * How much of a car's purchase price it has earned back.
 *
 * Clipped at 100% for the bar but not for the number: a car at 140% has paid
 * for itself and is into profit, which a bar pinned to full would hide.
 */
function RecoveryBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <span className="flex items-center gap-3">
      <span className="bg-line h-1.5 w-20 shrink-0">
        <span
          className="block h-full"
          style={{
            width: `${Math.min(100, Math.max(pct, value > 0 ? 2 : 0))}%`,
            backgroundColor: value >= 1 ? "#199e70" : "#3987e5",
          }}
        />
      </span>
      <span className="tabular-nums">{pct}%</span>
    </span>
  );
}

/** "2026-08" → "sierpień 2026". */
function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("pl-PL", {
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

/** Polish short date; the panel is Polish-only. */
function formatPl(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

/**
 * One document's state: the date, and how long it is good for.
 *
 * "No date recorded" is its own state rather than an empty cell — a blank reads
 * as "fine" at a glance, and an inspection nobody has entered is the one most
 * likely to lapse unnoticed.
 */
function DocumentCell({
  date,
  daysLeft,
  // A missing inspection date is a gap in the paperwork; a missing service
  // date only means none is booked yet. Same cell, different sentence.
  missingLabel = "Brak daty",
}: {
  date: string | null;
  daysLeft: number | null;
  missingLabel?: string;
}) {
  if (!date || daysLeft === null) {
    return (
      <span className="text-ink-faint text-xs">
        {missingLabel}
        <span className="border-line text-ink-faint ml-2 border px-1.5 py-0.5 text-[10px]">
          uzupełnij
        </span>
      </span>
    );
  }

  const tone =
    daysLeft < 0
      ? "bg-red text-white"
      : daysLeft <= EXPIRY_SOON_DAYS
        ? "border border-red/50 text-red"
        : "border border-line text-ink-faint";

  return (
    <span className="flex items-center gap-2 whitespace-nowrap">
      <span className="text-silver tabular-nums">{formatPl(date)}</span>
      <span className={`label-tight px-1.5 py-0.5 text-[10px] ${tone}`}>
        {daysLeft < 0
          ? `po terminie ${Math.abs(daysLeft)} dni`
          : daysLeft === 0
            ? "wygasa dziś"
            : `${daysLeft} dni`}
      </span>
    </span>
  );
}

export default async function AnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  /*
    Kontrola uprawnień przy renderze strony — obok kontroli w każdej akcji,
    nie zamiast niej. Bez tego pracownik wpisujący adres z ręki zobaczyłby
    treść sekcji, której nie wolno mu oglądać, i dopiero pierwszy przycisk
    powiedziałby mu „nie wolno".
  */
  await guardPage("analityka.podglad");

  const { locale } = await params;
  setRequestLocale(locale);

  // Filters live in the URL, so a filtered view is a link somebody can send.
  const q = await searchParams;
  const one = (k: string) => {
    const v = q[k];
    return typeof v === "string" && v !== "" ? v : undefined;
  };
  const { window: win, period } = resolveWindow(
    one("period"),
    one("from"),
    one("to"),
  );
  const filters: Filters = {
    carId: one("car"),
    segment: one("segment"),
    locationId: one("location"),
  };
  const compare = one("compare") === "1";
  const prev = previousWindow(win);

  const [
    metrics,
    beforeMetrics,
    byCar,
    costStructure,
    weekdays,
    season,
    mix,
    carOptions,
    locationOptions,
  ] = await Promise.all([
    getWindowMetrics(win, filters),
    compare ? getWindowMetrics(prev, filters) : Promise.resolve(null),
    getOccupancyByCar(win, filters),
    getCostStructure(win, filters),
    getWeekdayOccupancy(win, filters),
    getSeasonality(12, filters),
    getCustomerMix(win, filters),
    getDb()
      .select({
        id: schema.cars.id,
        plate: schema.cars.plate,
        brand: schema.carModels.brand,
        model: schema.carModels.model,
      })
      .from(schema.cars)
      .innerJoin(schema.carModels, eq(schema.carModels.id, schema.cars.modelId))
      .orderBy(asc(schema.carModels.brand), asc(schema.cars.plate)),
    // The filter matches on `pickup_location_id`, so it needs the UUID —
    // `getLocations()` returns public slugs and would silently match nothing.
    getDb()
      .select({
        id: schema.pickupLocations.id,
        name: schema.pickupLocations.name,
      })
      .from(schema.pickupLocations)
      .orderBy(asc(schema.pickupLocations.sortOrder)),
  ]);

  const [analytics, alerts, documents, fleetEconomics, months, bookings] =
    await Promise.all([
      getFleetAnalytics(90),
      getDocumentAlerts(),
      getCarDocuments(),
      getFleetEconomics(),
      // Twenty-four, not twelve: a year-on-year column needs the year before
      // the one being shown. `salesTrend` slices the display window back down.
      getMonthlySeries(24),
      getBookingAnalytics(365),
    ]);
  const totals = totalsOf(fleetEconomics);
  const sales = salesTrend(months, 12);
  // The headline compares finished months. On the 3rd of the month the month
  // in progress holds three days of trading, and putting that against a whole
  // month would report a 90% collapse every month, on schedule.
  const lastClosed = [...sales].reverse().find((m) => !m.partial) ?? null;
  const running = sales.find((m) => m.partial) ?? null;
  // The table walks the same twelve months as the chart and reads costs and
  // occupancy from the wider series, so the two can never show a different
  // twelve months.
  const monthByKey = new Map(months.map((m) => [m.month, m]));

  const cards = [
    {
      label: "Przychód (całość)",
      value: formatPln(totals.revenueGrosze, "pl"),
      hint: `${analytics.totals.rentals} ${pluralPl(analytics.totals.rentals, "wynajem", "wynajmy", "wynajmów")}`,
    },
    {
      label: "Wydatki (całość)",
      value: formatPln(totals.expensesGrosze, "pl"),
      hint: "serwis, koszty stałe, eksploatacja",
    },
    {
      label: "Marża",
      value: formatPln(totals.marginGrosze, "pl"),
      hint:
        totals.marginPct == null
          ? "brak przychodu"
          : `${Math.round(totals.marginPct * 100)}% przychodu`,
      tone: totals.marginGrosze >= 0 ? "good" : "bad",
    },
    {
      label: "Zwrot z floty",
      value:
        totals.recoveredPct == null
          ? "—"
          : `${Math.round(totals.recoveredPct * 100)}%`,
      hint:
        totals.investedGrosze === 0
          ? "brak wpisanych cen zakupu"
          : `${formatPln(totals.recoveredGrosze, "pl")} z ${formatPln(totals.investedGrosze, "pl")}`,
    },
  ] satisfies {
    label: string;
    value: string;
    hint: string;
    tone?: "good" | "bad";
  }[];

  return (
    <div>
      <h1 className="font-heading text-3xl font-bold">Analityka</h1>
      <p className="text-ink-muted mt-2 text-sm">
        Przychód liczony z rezerwacji potwierdzonych i zakończonych — oczekujące
        nie są jeszcze wynajmem. Wydatki pochodzą z kosztów wpisanych przy
        egzemplarzach. Cena zakupu nie jest kosztem: jest celem, do którego
        marża ma dojść.
      </p>

      <InsightFilters
        period={period}
        window={win}
        carId={filters.carId}
        segment={filters.segment}
        locationId={filters.locationId}
        compare={compare}
        cars={carOptions.map((c) => ({
          id: c.id,
          label: `${c.brand} ${c.model} · ${c.plate}`,
        }))}
        segments={FLEET_SEGMENTS.map((key) => ({
          key,
          label: SEGMENT_LABEL[key] ?? key,
        }))}
        locations={locationOptions}
      />

      <InsightSections
        window={win}
        metrics={metrics}
        before={beforeMetrics}
        cars={byCar}
        costs={costStructure}
        weekdays={weekdays}
        season={season}
        mix={mix}
        highlights={highlightsOf(byCar)}
      />

      <div className="mt-12 flex flex-wrap items-center gap-3">
        <Link
          href="/admin/analytics/raport"
          className="label border-line-strong text-ink hover:border-ink hover:bg-ink/5 tap inline-flex h-9 items-center border px-4 text-xs transition-colors"
        >
          Raport do druku / PDF
        </Link>
        {/* A plain anchor: this is a file download from a route handler, and
            the client router would try to navigate to it instead. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a file
            download, not a page: next/link would client-navigate and never save it */}
        <a
          href="/api/admin/report"
          className="label border-line-strong text-ink hover:border-ink hover:bg-ink/5 tap inline-flex h-9 items-center border px-4 text-xs transition-colors"
        >
          Pobierz Excel (.xlsx)
        </a>
      </div>

      <div className="border-line bg-line mt-6 grid gap-px border sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-void p-6">
            <p className="label-tight text-ink-faint text-[10px]">{c.label}</p>
            <p
              className={`font-heading mt-3 text-2xl font-bold tabular-nums ${
                c.tone === "good"
                  ? "text-emerald-400"
                  : c.tone === "bad"
                    ? "text-red"
                    : "text-ink"
              }`}
            >
              {c.value}
            </p>
            <p className="text-ink-faint mt-1 text-xs">{c.hint}</p>
          </div>
        ))}
      </div>

      <div className="border-line bg-line mt-px grid gap-px border sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-void p-6">
          <p className="label-tight text-ink-faint text-[10px]">Amortyzacja</p>
          <p className="font-heading text-ink mt-3 text-2xl font-bold tabular-nums">
            {formatPln(totals.depreciationToDateGrosze, "pl")}
          </p>
          <p className="text-ink-faint mt-1 text-xs">
            {totals.carsWithoutDepreciation > 0
              ? `${totals.carsWithoutDepreciation} bez ustawionej amortyzacji`
              : "wszystkie auta rozliczone"}
          </p>
        </div>
        <div className="bg-void p-6">
          <p className="label-tight text-ink-faint text-[10px]">
            Marża po amortyzacji
          </p>
          <p
            className={`font-heading mt-3 text-2xl font-bold tabular-nums ${
              (totals.tcoMarginGrosze ?? 0) >= 0
                ? "text-emerald-400"
                : "text-red"
            }`}
          >
            {totals.tcoMarginGrosze == null
              ? "—"
              : formatPln(totals.tcoMarginGrosze, "pl")}
          </p>
          <p className="text-ink-faint mt-1 text-xs">pełny koszt posiadania</p>
        </div>
        <div className="bg-void p-6">
          <p className="label-tight text-ink-faint text-[10px]">Koszt / km</p>
          <p className="font-heading text-ink mt-3 text-2xl font-bold tabular-nums">
            {totals.costPerKmGrosze == null
              ? "—"
              : formatPlnPrecise(totals.costPerKmGrosze, "pl")}
          </p>
          <p className="text-ink-faint mt-1 text-xs">
            {totals.kmDriven > 0
              ? `${totals.kmDriven.toLocaleString("pl-PL")} km ze stanów licznika`
              : "brak stanów licznika"}
          </p>
        </div>
        <div className="bg-void p-6">
          <p className="label-tight text-ink-faint text-[10px]">
            Przychód / km
          </p>
          <p className="font-heading text-ink mt-3 text-2xl font-bold tabular-nums">
            {totals.revenuePerKmGrosze == null
              ? "—"
              : formatPlnPrecise(totals.revenuePerKmGrosze, "pl")}
          </p>
          <p className="text-ink-faint mt-1 text-xs">na przejechany kilometr</p>
        </div>
      </div>

      {totals.carsWithoutPrice > 0 && (
        <p className="border-line text-ink-faint mt-4 border border-dashed px-4 py-3 text-xs">
          {totals.carsWithoutPrice}{" "}
          {totals.carsWithoutPrice === 1
            ? "egzemplarz nie ma"
            : "egzemplarzy nie ma"}{" "}
          wpisanej ceny zakupu —{" "}
          {totals.carsWithoutPrice === 1 ? "nie liczy" : "nie liczą"} się do
          zwrotu z floty. Uzupełnisz je przy egzemplarzu w zakładce Flota.
        </p>
      )}

      <section className="mt-14">
        <h2 className="label text-ink text-xs">Opłacalność egzemplarzy</h2>
        <p className="text-ink-faint mt-1 mb-4 text-xs">
          Każde auto osobno: co zarobiło, co kosztowało i ile z ceny zakupu już
          oddało. Kliknij rejestrację, żeby zobaczyć analizę dzień po dniu.{" "}
          <strong className="text-silver font-normal">Wolne</strong> to dni, w
          których auto było dostępne i nikt go nie zarezerwował — to problem
          sprzedaży.{" "}
          <strong className="text-silver font-normal">Zablokowane</strong> to
          serwis i ręczne blokady — to problem operacyjny. W całej flocie:{" "}
          {totals.daysFree.toLocaleString("pl-PL")} wolnych i{" "}
          {totals.daysBlocked.toLocaleString("pl-PL")} zablokowanych dni, koszt
          postoju {formatPln(totals.idleCostGrosze, "pl")}.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-line text-ink-faint border-y">
                <th className="label-tight py-3 pr-6 text-[10px]">
                  Egzemplarz
                </th>
                <th className="label-tight py-3 pr-6 text-[10px]">Przychód</th>
                <th className="label-tight py-3 pr-6 text-[10px]">Wydatki</th>
                <th className="label-tight py-3 pr-6 text-[10px]">Marża</th>
                <th className="label-tight py-3 pr-6 text-[10px]">Na dobę</th>
                <th className="label-tight py-3 pr-6 text-[10px]">Wolne</th>
                <th className="label-tight py-3 pr-6 text-[10px]">
                  Zablokowane
                </th>
                <th className="label-tight py-3 pr-6 text-[10px]">Zwrot</th>
                <th className="label-tight py-3 text-[10px]">Zwrot ok.</th>
              </tr>
            </thead>
            <tbody>
              {fleetEconomics.map((c) => (
                <tr key={c.carId} className="border-line border-b">
                  <td className="py-4 pr-6">
                    <Link
                      href={{
                        pathname: "/admin/analytics/[carId]",
                        params: { carId: c.carId },
                      }}
                      className="text-ink tap-area -my-1.5 inline-block py-1.5 underline-offset-4 hover:underline"
                    >
                      {c.plate}
                    </Link>
                    <span className="text-ink-faint ml-2 text-xs">
                      {c.carName}
                    </span>
                  </td>
                  <td className="text-silver py-4 pr-6 whitespace-nowrap tabular-nums">
                    {formatPln(c.revenueGrosze, "pl")}
                  </td>
                  <td className="text-silver py-4 pr-6 whitespace-nowrap tabular-nums">
                    {formatPln(c.expensesGrosze, "pl")}
                  </td>
                  <td
                    className={`py-4 pr-6 whitespace-nowrap tabular-nums ${
                      c.marginGrosze >= 0 ? "text-emerald-400" : "text-red"
                    }`}
                  >
                    {formatPln(c.marginGrosze, "pl")}
                    {c.marginPct != null && (
                      <span className="text-ink-faint ml-2 text-xs">
                        {Math.round(c.marginPct * 100)}%
                      </span>
                    )}
                  </td>
                  <td
                    className={`py-4 pr-6 whitespace-nowrap tabular-nums ${
                      c.netPerDayGrosze >= 0 ? "text-silver" : "text-red"
                    }`}
                  >
                    {formatPln(c.netPerDayGrosze, "pl")}
                  </td>
                  <td className="text-silver py-4 pr-6 whitespace-nowrap tabular-nums">
                    {c.daysFree}
                    <span className="text-ink-faint ml-2 text-xs">
                      {Math.round((c.daysFree / c.daysOwned) * 100)}%
                    </span>
                  </td>
                  <td className="text-ink-faint py-4 pr-6 whitespace-nowrap tabular-nums">
                    {c.daysBlocked}
                  </td>
                  <td className="py-4 pr-6 whitespace-nowrap">
                    {c.recoveredPct == null ? (
                      <span className="text-ink-faint text-xs">brak ceny</span>
                    ) : (
                      <RecoveryBar value={c.recoveredPct} />
                    )}
                  </td>
                  <td className="text-silver py-4 text-xs whitespace-nowrap tabular-nums">
                    {c.purchasePriceGrosze == null
                      ? "—"
                      : c.marginGrosze >= c.purchasePriceGrosze
                        ? "zwrócone"
                        : c.paybackOn
                          ? formatPl(c.paybackOn)
                          : "nie przy tym tempie"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {fleetEconomics.length === 0 && (
          <p className="border-line text-silver mt-4 border px-5 py-6 text-center text-sm">
            Brak egzemplarzy.
          </p>
        )}
      </section>

      <section className="mt-14">
        <h2 className="label text-ink text-xs">
          Sprzedaż — miesiąc do miesiąca i rok do roku
        </h2>
        <p className="text-ink-faint mt-1 mb-4 text-xs">
          Przychód z ostatnich 12 miesięcy, każdy zestawiony z tym samym
          miesiącem rok wcześniej. Nagłówki liczą ostatni ZAMKNIĘTY miesiąc —
          miesiąc w toku ma tyle dni, ile go minęło, i porównany z pełnym
          miesiącem zawsze wyglądałby na załamanie.
        </p>

        <div className="border-line bg-line grid gap-px border sm:grid-cols-2 lg:grid-cols-4">
          <div className="bg-void p-6">
            <p className="label-tight text-ink-faint text-[10px]">
              {lastClosed
                ? `Sprzedaż — ${monthLabel(lastClosed.month)}`
                : "Sprzedaż"}
            </p>
            <p className="font-heading text-ink mt-3 text-2xl font-bold tabular-nums">
              {lastClosed ? formatPln(lastClosed.revenueGrosze, "pl") : "—"}
            </p>
            <p className="text-ink-faint mt-1 text-xs">
              ostatni zamknięty miesiąc
            </p>
          </div>

          <div className="bg-void p-6">
            <p className="label-tight text-ink-faint text-[10px]">
              Miesiąc do miesiąca
            </p>
            <p
              className={`font-heading mt-3 text-2xl font-bold tabular-nums ${
                lastClosed?.momPct == null
                  ? "text-ink"
                  : lastClosed.momPct >= 0
                    ? "text-emerald-400"
                    : "text-red"
              }`}
            >
              {formatPct(lastClosed?.momPct ?? null)}
            </p>
            <p className="text-ink-faint mt-1 text-xs">
              {lastClosed?.prevMonthGrosze != null
                ? `wobec ${formatPln(lastClosed.prevMonthGrosze, "pl")} miesiąc wcześniej`
                : "brak miesiąca odniesienia"}
            </p>
          </div>

          <div className="bg-void p-6">
            <p className="label-tight text-ink-faint text-[10px]">
              Rok do roku
            </p>
            <p
              className={`font-heading mt-3 text-2xl font-bold tabular-nums ${
                lastClosed?.yoyPct == null
                  ? "text-ink"
                  : lastClosed.yoyPct >= 0
                    ? "text-emerald-400"
                    : "text-red"
              }`}
            >
              {formatPct(lastClosed?.yoyPct ?? null)}
            </p>
            <p className="text-ink-faint mt-1 text-xs">
              {lastClosed?.prevYearGrosze != null
                ? `wobec ${formatPln(lastClosed.prevYearGrosze, "pl")} rok wcześniej`
                : "brak danych sprzed roku"}
            </p>
          </div>

          <div className="bg-void p-6">
            <p className="label-tight text-ink-faint text-[10px]">
              Miesiąc w toku
            </p>
            <p className="font-heading text-ink mt-3 text-2xl font-bold tabular-nums">
              {running ? formatPln(running.revenueGrosze, "pl") : "—"}
            </p>
            <p className="text-ink-faint mt-1 text-xs">
              {running
                ? `${monthLabel(running.month)} — narastająco`
                : "brak danych"}
            </p>
          </div>
        </div>

        <SalesTrend months={sales} />
      </section>

      <section className="mt-14">
        <h2 className="label text-ink text-xs">Miesiąc po miesiącu</h2>
        <p className="text-ink-faint mt-1 mb-4 text-xs">
          Te same 12 miesięcy w liczbach — wykres pokazuje kształt, tabela
          weryfikuje wartości. Odpowiada na pytanie, którego dzienny wykres nie
          potrafi: czy ostatni miesiąc był słaby, czy luty zawsze taki jest.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-line text-ink-faint border-y">
                <th className="label-tight py-3 pr-6 text-[10px]">Miesiąc</th>
                <th className="label-tight py-3 pr-6 text-[10px]">Przychód</th>
                <th className="label-tight py-3 pr-6 text-[10px]">m/m</th>
                <th className="label-tight py-3 pr-6 text-[10px]">r/r</th>
                <th className="label-tight py-3 pr-6 text-[10px]">Wydatki</th>
                <th className="label-tight py-3 pr-6 text-[10px]">Marża</th>
                <th className="label-tight py-3 text-[10px]">Dni wynajęte</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => {
                const m = monthByKey.get(s.month);
                if (!m) return null;
                return (
                  <tr key={m.month} className="border-line border-b">
                    <td className="text-ink py-3 pr-6">
                      {monthLabel(m.month)}
                      {s.partial && (
                        <span className="text-ink-faint"> (w toku)</span>
                      )}
                    </td>
                    <td className="text-silver py-3 pr-6 whitespace-nowrap tabular-nums">
                      {formatPln(m.revenueGrosze, "pl")}
                    </td>
                    <td
                      className={`py-3 pr-6 whitespace-nowrap tabular-nums ${
                        s.momPct == null
                          ? "text-ink-faint"
                          : s.momPct >= 0
                            ? "text-emerald-400"
                            : "text-red"
                      }`}
                    >
                      {formatPct(s.momPct)}
                    </td>
                    <td
                      className={`py-3 pr-6 whitespace-nowrap tabular-nums ${
                        s.yoyPct == null
                          ? "text-ink-faint"
                          : s.yoyPct >= 0
                            ? "text-emerald-400"
                            : "text-red"
                      }`}
                    >
                      {formatPct(s.yoyPct)}
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
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-14">
        <h2 className="label text-ink text-xs">Rezerwacje — jak kupują</h2>
        <p className="text-ink-faint mt-1 mb-4 text-xs">
          Ostatnie {bookings.windowDays} dni, {bookings.total} zapytań. Tu liczą
          się WSZYSTKIE statusy — sensem tej sekcji jest właśnie to, ile zapytań
          nie zamieniło się w wynajem.
        </p>

        {bookings.total === 0 ? (
          <p className="border-line text-silver border px-5 py-6 text-center text-sm">
            Brak zapytań w tym okresie.
          </p>
        ) : (
          <>
            <div className="border-line bg-line grid gap-px border sm:grid-cols-2 lg:grid-cols-4">
              <div className="bg-void p-6">
                <p className="label-tight text-ink-faint text-[10px]">
                  Skuteczność
                </p>
                <p className="font-heading text-ink mt-3 text-2xl font-bold tabular-nums">
                  {bookings.conversion == null
                    ? "—"
                    : `${Math.round(bookings.conversion * 100)}%`}
                </p>
                <p className="text-ink-faint mt-1 text-xs">
                  zapytań staje się wynajmem
                </p>
              </div>
              <div className="bg-void p-6">
                <p className="label-tight text-ink-faint text-[10px]">Odpada</p>
                <p className="font-heading text-red mt-3 text-2xl font-bold tabular-nums">
                  {bookings.dropOff == null
                    ? "—"
                    : `${Math.round(bookings.dropOff * 100)}%`}
                </p>
                <p className="text-ink-faint mt-1 text-xs">
                  anulowane i odrzucone
                </p>
              </div>
              <div className="bg-void p-6">
                <p className="label-tight text-ink-faint text-[10px]">
                  Wyprzedzenie
                </p>
                <p className="font-heading text-ink mt-3 text-2xl font-bold tabular-nums">
                  {bookings.leadTime.median == null
                    ? "—"
                    : `${Math.round(bookings.leadTime.median)} dni`}
                </p>
                <p className="text-ink-faint mt-1 text-xs">
                  mediana; połowa mieści się w{" "}
                  {bookings.leadTime.p25 == null
                    ? "—"
                    : `${Math.round(bookings.leadTime.p25)}–${Math.round(bookings.leadTime.p75 ?? 0)} dni`}
                </p>
              </div>
              <div className="bg-void p-6">
                <p className="label-tight text-ink-faint text-[10px]">
                  Długość wynajmu
                </p>
                <p className="font-heading text-ink mt-3 text-2xl font-bold tabular-nums">
                  {bookings.length.median == null
                    ? "—"
                    : `${Math.round(bookings.length.median)} dni`}
                </p>
                <p className="text-ink-faint mt-1 text-xs">
                  mediana; średnia{" "}
                  {bookings.length.average == null
                    ? "—"
                    : bookings.length.average.toFixed(1)}
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-3">
              <div className="border-line border p-5">
                <p className="label-tight text-ink-faint mb-3 text-[10px]">
                  Statusy
                </p>
                <ul className="space-y-1 text-xs">
                  {bookings.byStatus.map((s) => (
                    <li
                      key={s.status}
                      className="text-silver flex justify-between"
                    >
                      <span>{statusLabel(s.status)}</span>
                      <span className="tabular-nums">{s.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="border-line border p-5">
                <p className="label-tight text-ink-faint mb-3 text-[10px]">
                  Dodatki (w potwierdzonych)
                </p>
                <ul className="space-y-1 text-xs">
                  {bookings.addOns.map((a) => (
                    <li
                      key={a.key}
                      className="text-silver flex justify-between"
                    >
                      <span>{a.label}</span>
                      <span className="tabular-nums">
                        {a.count} · {Math.round(a.share * 100)}%
                      </span>
                    </li>
                  ))}
                  <li className="text-silver flex justify-between">
                    <span>Bez kaucji</span>
                    <span className="tabular-nums">
                      {bookings.deposit.noDeposit}
                    </span>
                  </li>
                </ul>
              </div>
              <div className="border-line border p-5">
                <p className="label-tight text-ink-faint mb-3 text-[10px]">
                  Miejsce odbioru
                </p>
                <ul className="space-y-1 text-xs">
                  {bookings.locations.map((l) => (
                    <li
                      key={l.name}
                      className="text-silver flex justify-between"
                    >
                      <span className="truncate pr-2">{l.name}</span>
                      <span className="tabular-nums">
                        {l.count} · {Math.round(l.share * 100)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        )}
      </section>

      <section className="mt-14">
        <h2 className="label text-ink text-xs">Przypomnienia</h2>
        <p className="text-ink-faint mt-1 mb-4 text-xs">
          Ubezpieczenie i przegląd — po terminie lub kończące się w ciągu 30
          dni.
        </p>
        <DocumentAlerts alerts={alerts} />
      </section>

      <section className="mt-14">
        <h2 className="label text-ink text-xs">
          Przegląd, ubezpieczenie i serwis
        </h2>
        <p className="text-ink-faint mt-1 mb-4 text-xs">
          Stan dokumentów i planowanych serwisów każdego egzemplarza. Daty
          edytujesz przy egzemplarzu w zakładce Flota. Na 5 dni przed każdą z
          nich wychodzi jedno przypomnienie na {REMINDER_MAILBOX}.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-line text-ink-faint border-y">
                <th className="label-tight py-3 pr-6 text-[10px]">
                  Egzemplarz
                </th>
                <th className="label-tight py-3 pr-6 text-[10px]">Przegląd</th>
                <th className="label-tight py-3 pr-6 text-[10px]">
                  Ubezpieczenie
                </th>
                <th className="label-tight py-3 pr-6 text-[10px]">Serwis</th>
                <th className="label-tight py-3 text-[10px]">Przebieg</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((c) => (
                <tr key={c.carId} className="border-line border-b">
                  <td className="py-4 pr-6">
                    <Link
                      href={{
                        pathname: "/admin/fleet/[id]",
                        params: { id: c.modelId },
                      }}
                      className="text-ink tap-area -my-1.5 inline-block py-1.5 underline-offset-4 hover:underline"
                    >
                      {c.plate}
                    </Link>
                    <span className="text-ink-faint ml-2 text-xs">
                      {c.carName}
                    </span>
                  </td>
                  <td className="py-4 pr-6">
                    <DocumentCell
                      date={c.inspection.date}
                      daysLeft={c.inspection.daysLeft}
                    />
                  </td>
                  <td className="py-4 pr-6">
                    <DocumentCell
                      date={c.insurance.date}
                      daysLeft={c.insurance.daysLeft}
                    />
                  </td>
                  <td className="py-4 pr-6">
                    <DocumentCell
                      date={c.service.date}
                      daysLeft={c.service.daysLeft}
                      missingLabel="Nie zaplanowano"
                    />
                  </td>
                  <td className="text-silver py-4 whitespace-nowrap tabular-nums">
                    {c.mileageKm.toLocaleString("pl-PL")} km
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {documents.length === 0 && (
          <p className="border-line text-silver mt-4 border px-5 py-6 text-center text-sm">
            Brak egzemplarzy.
          </p>
        )}
      </section>

      <section className="mt-14">
        <h2 className="label text-ink text-xs">Auta</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-line text-ink-faint border-y">
                <th className="label-tight py-3 pr-6 text-[10px]">Model</th>
                <th className="label-tight py-3 pr-6 text-[10px]">Egz.</th>
                <th className="label-tight py-3 pr-6 text-[10px]">Wynajmy</th>
                <th className="label-tight py-3 pr-6 text-[10px]">Dni</th>
                <th className="label-tight py-3 pr-6 text-[10px]">Przychód</th>
                <th className="label-tight py-3 pr-6 text-[10px]">
                  Wykorzystanie
                </th>
                <th className="label-tight py-3 text-[10px]">Nadchodzące</th>
              </tr>
            </thead>
            <tbody>
              {analytics.models.map((m) => (
                <tr key={m.modelId} className="border-line border-b">
                  <td className="py-4 pr-6">
                    <Link
                      href={{
                        pathname: "/admin/fleet/[id]",
                        params: { id: m.modelId },
                      }}
                      className="text-ink tap-area -my-1.5 inline-block py-1.5 underline-offset-4 hover:underline"
                    >
                      {m.name}
                    </Link>
                  </td>
                  <td className="text-silver py-4 pr-6 tabular-nums">
                    {m.units}
                  </td>
                  <td className="text-silver py-4 pr-6 tabular-nums">
                    {m.rentals}
                  </td>
                  <td className="text-silver py-4 pr-6 tabular-nums">
                    {m.daysRented}
                  </td>
                  <td className="text-ink py-4 pr-6 tabular-nums">
                    {formatPln(m.revenueGrosze, "pl")}
                  </td>
                  <td className="text-silver py-4 pr-6">
                    <UtilisationBar value={m.utilisation} />
                  </td>
                  <td className="text-silver py-4 tabular-nums">
                    {m.upcoming}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {analytics.models.length === 0 && (
          <p className="border-line text-silver mt-4 border px-5 py-6 text-center text-sm">
            Brak modeli.
          </p>
        )}
      </section>
    </div>
  );
}
