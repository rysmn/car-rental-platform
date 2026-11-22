import { useLocale, useTranslations } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
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
import {
  SalesTrend,
  formatDay,
  formatPct,
  intlLocale,
} from "@/components/admin/economics-charts";
import { formatPln, formatPlnPrecise } from "@/lib/format";
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
import { pick } from "@/lib/i18n-pick";

/** Segments that have a translated label under `segments.*`. */
const TRANSLATED_SEGMENTS = new Set<string>(FLEET_SEGMENTS);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin.analytics" });
  return { title: t("metaTitle") };
}

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

/** "2026-08" → "August 2026" / "sierpień 2026". */
function monthLabel(month: string, locale: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(intlLocale(locale), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
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
  missing = "noDate",
}: {
  date: string | null;
  daysLeft: number | null;
  missing?: "noDate" | "notScheduled";
}) {
  const t = useTranslations("Admin.analytics");
  const locale = useLocale();

  if (!date || daysLeft === null) {
    return (
      <span className="text-ink-faint text-xs">
        {t(`documents.${missing}`)}
        <span className="border-line text-ink-faint ml-2 border px-1.5 py-0.5 text-[10px]">
          {t("documents.fillIn")}
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
      <span className="text-silver tabular-nums">{formatDay(date, locale)}</span>
      <span className={`label-tight px-1.5 py-0.5 text-[10px] ${tone}`}>
        {daysLeft < 0
          ? t("documents.overdue", {
              duration: t("units.days", { count: Math.abs(daysLeft) }),
            })
          : daysLeft === 0
            ? t("documents.expiresToday")
            : t("units.days", { count: daysLeft })}
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
  const t = await getTranslations("Admin.analytics");

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

  const money = (grosze: number) => formatPln(grosze, locale);

  const cards = [
    {
      label: t("cards.revenueTotal"),
      value: money(totals.revenueGrosze),
      hint: t("units.rentals", { count: analytics.totals.rentals }),
    },
    {
      label: t("cards.expensesTotal"),
      value: money(totals.expensesGrosze),
      hint: t("cards.expensesHint"),
    },
    {
      label: t("cards.margin"),
      value: money(totals.marginGrosze),
      hint:
        totals.marginPct == null
          ? t("cards.noRevenue")
          : t("cards.marginOfRevenue", {
              percent: Math.round(totals.marginPct * 100),
            }),
      tone: totals.marginGrosze >= 0 ? "good" : "bad",
    },
    {
      label: t("cards.fleetRecovery"),
      value:
        totals.recoveredPct == null
          ? "—"
          : `${Math.round(totals.recoveredPct * 100)}%`,
      hint:
        totals.investedGrosze === 0
          ? t("cards.noPurchasePrices")
          : t("cards.recoveredOf", {
              recovered: money(totals.recoveredGrosze),
              invested: money(totals.investedGrosze),
            }),
    },
  ] satisfies {
    label: string;
    value: string;
    hint: string;
    tone?: "good" | "bad";
  }[];

  return (
    <div>
      <h1 className="font-heading text-3xl font-bold">{t("title")}</h1>
      <p className="text-ink-muted mt-2 text-sm">{t("intro")}</p>

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
          label: TRANSLATED_SEGMENTS.has(key)
            ? t(`segments.${key}`)
            : key,
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
          {t("actions.report")}
        </Link>
        {/* A plain anchor: this is a file download from a route handler, and
            the client router would try to navigate to it instead. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a file
            download, not a page: next/link would client-navigate and never save it */}
        <a
          href="/api/admin/report"
          className="label border-line-strong text-ink hover:border-ink hover:bg-ink/5 tap inline-flex h-9 items-center border px-4 text-xs transition-colors"
        >
          {t("actions.excel")}
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
          <p className="label-tight text-ink-faint text-[10px]">
            {t("cards.depreciation")}
          </p>
          <p className="font-heading text-ink mt-3 text-2xl font-bold tabular-nums">
            {money(totals.depreciationToDateGrosze)}
          </p>
          <p className="text-ink-faint mt-1 text-xs">
            {totals.carsWithoutDepreciation > 0
              ? t("cards.depreciationMissing", {
                  count: totals.carsWithoutDepreciation,
                })
              : t("cards.allSettled")}
          </p>
        </div>
        <div className="bg-void p-6">
          <p className="label-tight text-ink-faint text-[10px]">
            {t("cards.tcoMargin")}
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
              : money(totals.tcoMarginGrosze)}
          </p>
          <p className="text-ink-faint mt-1 text-xs">{t("cards.fullCost")}</p>
        </div>
        <div className="bg-void p-6">
          <p className="label-tight text-ink-faint text-[10px]">
            {t("cards.costPerKm")}
          </p>
          <p className="font-heading text-ink mt-3 text-2xl font-bold tabular-nums">
            {totals.costPerKmGrosze == null
              ? "—"
              : formatPlnPrecise(totals.costPerKmGrosze, locale)}
          </p>
          <p className="text-ink-faint mt-1 text-xs">
            {totals.kmDriven > 0
              ? t("cards.odometer", { km: totals.kmDriven })
              : t("cards.noOdometer")}
          </p>
        </div>
        <div className="bg-void p-6">
          <p className="label-tight text-ink-faint text-[10px]">
            {t("cards.revenuePerKm")}
          </p>
          <p className="font-heading text-ink mt-3 text-2xl font-bold tabular-nums">
            {totals.revenuePerKmGrosze == null
              ? "—"
              : formatPlnPrecise(totals.revenuePerKmGrosze, locale)}
          </p>
          <p className="text-ink-faint mt-1 text-xs">{t("cards.perKmBasis")}</p>
        </div>
      </div>

      {totals.carsWithoutPrice > 0 && (
        <p className="border-line text-ink-faint mt-4 border border-dashed px-4 py-3 text-xs">
          {t("notice.noPrice", { count: totals.carsWithoutPrice })}
        </p>
      )}

      <section className="mt-14">
        <h2 className="label text-ink text-xs">{t("economics.title")}</h2>
        <p className="text-ink-faint mt-1 mb-4 text-xs">
          {t.rich("economics.intro", {
            strong: (chunks) => (
              <strong className="text-silver font-normal">{chunks}</strong>
            ),
            freeDays: totals.daysFree,
            blockedDays: totals.daysBlocked,
            idleCost: money(totals.idleCostGrosze),
          })}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-line text-ink-faint border-y">
                <th className="label-tight py-3 pr-6 text-[10px]">
                  {t("economics.col.unit")}
                </th>
                <th className="label-tight py-3 pr-6 text-[10px]">
                  {t("economics.col.revenue")}
                </th>
                <th className="label-tight py-3 pr-6 text-[10px]">
                  {t("economics.col.expenses")}
                </th>
                <th className="label-tight py-3 pr-6 text-[10px]">
                  {t("economics.col.margin")}
                </th>
                <th className="label-tight py-3 pr-6 text-[10px]">
                  {t("economics.col.perDay")}
                </th>
                <th className="label-tight py-3 pr-6 text-[10px]">
                  {t("economics.col.free")}
                </th>
                <th className="label-tight py-3 pr-6 text-[10px]">
                  {t("economics.col.blocked")}
                </th>
                <th className="label-tight py-3 pr-6 text-[10px]">
                  {t("economics.col.recovery")}
                </th>
                <th className="label-tight py-3 text-[10px]">
                  {t("economics.col.recoveryOn")}
                </th>
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
                    {money(c.revenueGrosze)}
                  </td>
                  <td className="text-silver py-4 pr-6 whitespace-nowrap tabular-nums">
                    {money(c.expensesGrosze)}
                  </td>
                  <td
                    className={`py-4 pr-6 whitespace-nowrap tabular-nums ${
                      c.marginGrosze >= 0 ? "text-emerald-400" : "text-red"
                    }`}
                  >
                    {money(c.marginGrosze)}
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
                    {money(c.netPerDayGrosze)}
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
                      <span className="text-ink-faint text-xs">
                        {t("economics.noPrice")}
                      </span>
                    ) : (
                      <RecoveryBar value={c.recoveredPct} />
                    )}
                  </td>
                  <td className="text-silver py-4 text-xs whitespace-nowrap tabular-nums">
                    {c.purchasePriceGrosze == null
                      ? "—"
                      : c.marginGrosze >= c.purchasePriceGrosze
                        ? t("economics.returned")
                        : c.paybackOn
                          ? formatDay(c.paybackOn, locale)
                          : t("economics.notAtPace")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {fleetEconomics.length === 0 && (
          <p className="border-line text-silver mt-4 border px-5 py-6 text-center text-sm">
            {t("empty.cars")}
          </p>
        )}
      </section>

      <section className="mt-14">
        <h2 className="label text-ink text-xs">{t("sales.title")}</h2>
        <p className="text-ink-faint mt-1 mb-4 text-xs">{t("sales.intro")}</p>

        <div className="border-line bg-line grid gap-px border sm:grid-cols-2 lg:grid-cols-4">
          <div className="bg-void p-6">
            <p className="label-tight text-ink-faint text-[10px]">
              {lastClosed
                ? t("sales.lastClosedTitle", {
                    month: monthLabel(lastClosed.month, locale),
                  })
                : t("sales.plain")}
            </p>
            <p className="font-heading text-ink mt-3 text-2xl font-bold tabular-nums">
              {lastClosed ? money(lastClosed.revenueGrosze) : "—"}
            </p>
            <p className="text-ink-faint mt-1 text-xs">
              {t("sales.lastClosedHint")}
            </p>
          </div>

          <div className="bg-void p-6">
            <p className="label-tight text-ink-faint text-[10px]">
              {t("sales.momTitle")}
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
              {formatPct(lastClosed?.momPct ?? null, locale)}
            </p>
            <p className="text-ink-faint mt-1 text-xs">
              {lastClosed?.prevMonthGrosze != null
                ? t("sales.vsPrevMonth", {
                    amount: money(lastClosed.prevMonthGrosze),
                  })
                : t("sales.noPrevMonth")}
            </p>
          </div>

          <div className="bg-void p-6">
            <p className="label-tight text-ink-faint text-[10px]">
              {t("sales.yoyTitle")}
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
              {formatPct(lastClosed?.yoyPct ?? null, locale)}
            </p>
            <p className="text-ink-faint mt-1 text-xs">
              {lastClosed?.prevYearGrosze != null
                ? t("sales.vsPrevYear", {
                    amount: money(lastClosed.prevYearGrosze),
                  })
                : t("sales.noPrevYear")}
            </p>
          </div>

          <div className="bg-void p-6">
            <p className="label-tight text-ink-faint text-[10px]">
              {t("sales.inProgress")}
            </p>
            <p className="font-heading text-ink mt-3 text-2xl font-bold tabular-nums">
              {running ? money(running.revenueGrosze) : "—"}
            </p>
            <p className="text-ink-faint mt-1 text-xs">
              {running
                ? t("sales.runningHint", {
                    month: monthLabel(running.month, locale),
                  })
                : t("sales.noData")}
            </p>
          </div>
        </div>

        <SalesTrend months={sales} />
      </section>

      <section className="mt-14">
        <h2 className="label text-ink text-xs">{t("monthly.title")}</h2>
        <p className="text-ink-faint mt-1 mb-4 text-xs">{t("monthly.intro")}</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-line text-ink-faint border-y">
                <th className="label-tight py-3 pr-6 text-[10px]">
                  {t("monthly.col.month")}
                </th>
                <th className="label-tight py-3 pr-6 text-[10px]">
                  {t("monthly.col.revenue")}
                </th>
                <th className="label-tight py-3 pr-6 text-[10px]">m/m</th>
                <th className="label-tight py-3 pr-6 text-[10px]">r/r</th>
                <th className="label-tight py-3 pr-6 text-[10px]">
                  {t("monthly.col.expenses")}
                </th>
                <th className="label-tight py-3 pr-6 text-[10px]">
                  {t("monthly.col.margin")}
                </th>
                <th className="label-tight py-3 text-[10px]">
                  {t("monthly.col.daysRented")}
                </th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => {
                const m = monthByKey.get(s.month);
                if (!m) return null;
                return (
                  <tr key={m.month} className="border-line border-b">
                    <td className="text-ink py-3 pr-6">
                      {monthLabel(m.month, locale)}
                      {s.partial && (
                        <span className="text-ink-faint">
                          {" "}
                          {t("monthly.partial")}
                        </span>
                      )}
                    </td>
                    <td className="text-silver py-3 pr-6 whitespace-nowrap tabular-nums">
                      {money(m.revenueGrosze)}
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
                      {formatPct(s.momPct, locale)}
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
                      {formatPct(s.yoyPct, locale)}
                    </td>
                    <td className="text-silver py-3 pr-6 whitespace-nowrap tabular-nums">
                      {money(m.expenseGrosze)}
                    </td>
                    <td
                      className={`py-3 pr-6 whitespace-nowrap tabular-nums ${
                        m.marginGrosze >= 0 ? "text-silver" : "text-red"
                      }`}
                    >
                      {money(m.marginGrosze)}
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
        <h2 className="label text-ink text-xs">{t("bookings.title")}</h2>
        <p className="text-ink-faint mt-1 mb-4 text-xs">
          {t("bookings.intro", {
            days: bookings.windowDays,
            total: bookings.total,
          })}
        </p>

        {bookings.total === 0 ? (
          <p className="border-line text-silver border px-5 py-6 text-center text-sm">
            {t("empty.bookings")}
          </p>
        ) : (
          <>
            <div className="border-line bg-line grid gap-px border sm:grid-cols-2 lg:grid-cols-4">
              <div className="bg-void p-6">
                <p className="label-tight text-ink-faint text-[10px]">
                  {t("bookings.conversion")}
                </p>
                <p className="font-heading text-ink mt-3 text-2xl font-bold tabular-nums">
                  {bookings.conversion == null
                    ? "—"
                    : `${Math.round(bookings.conversion * 100)}%`}
                </p>
                <p className="text-ink-faint mt-1 text-xs">
                  {t("bookings.conversionHint")}
                </p>
              </div>
              <div className="bg-void p-6">
                <p className="label-tight text-ink-faint text-[10px]">
                  {t("bookings.dropOff")}
                </p>
                <p className="font-heading text-red mt-3 text-2xl font-bold tabular-nums">
                  {bookings.dropOff == null
                    ? "—"
                    : `${Math.round(bookings.dropOff * 100)}%`}
                </p>
                <p className="text-ink-faint mt-1 text-xs">
                  {t("bookings.dropOffHint")}
                </p>
              </div>
              <div className="bg-void p-6">
                <p className="label-tight text-ink-faint text-[10px]">
                  {t("bookings.leadTime")}
                </p>
                <p className="font-heading text-ink mt-3 text-2xl font-bold tabular-nums">
                  {bookings.leadTime.median == null
                    ? "—"
                    : t("units.days", {
                        count: Math.round(bookings.leadTime.median),
                      })}
                </p>
                <p className="text-ink-faint mt-1 text-xs">
                  {t("bookings.leadTimeHint")}{" "}
                  {bookings.leadTime.p25 == null
                    ? "—"
                    : t("bookings.leadRange", {
                        from: Math.round(bookings.leadTime.p25),
                        to: Math.round(bookings.leadTime.p75 ?? 0),
                      })}
                </p>
              </div>
              <div className="bg-void p-6">
                <p className="label-tight text-ink-faint text-[10px]">
                  {t("bookings.rentalLength")}
                </p>
                <p className="font-heading text-ink mt-3 text-2xl font-bold tabular-nums">
                  {bookings.length.median == null
                    ? "—"
                    : t("units.days", {
                        count: Math.round(bookings.length.median),
                      })}
                </p>
                <p className="text-ink-faint mt-1 text-xs">
                  {t("bookings.rentalLengthHint")}{" "}
                  {bookings.length.average == null
                    ? "—"
                    : bookings.length.average.toLocaleString(
                        intlLocale(locale),
                        {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 1,
                        },
                      )}
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-3">
              <div className="border-line border p-5">
                <p className="label-tight text-ink-faint mb-3 text-[10px]">
                  {t("bookings.statuses")}
                </p>
                <ul className="space-y-1 text-xs">
                  {bookings.byStatus.map((s) => (
                    <li
                      key={s.status}
                      className="text-silver flex justify-between"
                    >
                      <span>{statusLabel(s.status, locale)}</span>
                      <span className="tabular-nums">{s.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="border-line border p-5">
                <p className="label-tight text-ink-faint mb-3 text-[10px]">
                  {t("bookings.addOns")}
                </p>
                <ul className="space-y-1 text-xs">
                  {bookings.addOns.map((a) => (
                    <li
                      key={a.key}
                      className="text-silver flex justify-between"
                    >
                      <span>{pick(a.label, locale)}</span>
                      <span className="tabular-nums">
                        {a.count} · {Math.round(a.share * 100)}%
                      </span>
                    </li>
                  ))}
                  <li className="text-silver flex justify-between">
                    <span>{t("bookings.noDeposit")}</span>
                    <span className="tabular-nums">
                      {bookings.deposit.noDeposit}
                    </span>
                  </li>
                </ul>
              </div>
              <div className="border-line border p-5">
                <p className="label-tight text-ink-faint mb-3 text-[10px]">
                  {t("bookings.pickup")}
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
        <h2 className="label text-ink text-xs">{t("reminders.title")}</h2>
        <p className="text-ink-faint mt-1 mb-4 text-xs">
          {t("reminders.intro")}
        </p>
        <DocumentAlerts alerts={alerts} />
      </section>

      <section className="mt-14">
        <h2 className="label text-ink text-xs">{t("documents.title")}</h2>
        <p className="text-ink-faint mt-1 mb-4 text-xs">
          {t("documents.intro", { mailbox: REMINDER_MAILBOX })}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-line text-ink-faint border-y">
                <th className="label-tight py-3 pr-6 text-[10px]">
                  {t("documents.col.unit")}
                </th>
                <th className="label-tight py-3 pr-6 text-[10px]">
                  {t("documents.col.inspection")}
                </th>
                <th className="label-tight py-3 pr-6 text-[10px]">
                  {t("documents.col.insurance")}
                </th>
                <th className="label-tight py-3 pr-6 text-[10px]">
                  {t("documents.col.service")}
                </th>
                <th className="label-tight py-3 text-[10px]">
                  {t("documents.col.mileage")}
                </th>
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
                      missing="notScheduled"
                    />
                  </td>
                  <td className="text-silver py-4 whitespace-nowrap tabular-nums">
                    {t("units.km", { km: c.mileageKm })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {documents.length === 0 && (
          <p className="border-line text-silver mt-4 border px-5 py-6 text-center text-sm">
            {t("empty.cars")}
          </p>
        )}
      </section>

      <section className="mt-14">
        <h2 className="label text-ink text-xs">{t("models.title")}</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-line text-ink-faint border-y">
                <th className="label-tight py-3 pr-6 text-[10px]">
                  {t("models.col.model")}
                </th>
                <th className="label-tight py-3 pr-6 text-[10px]">
                  {t("models.col.units")}
                </th>
                <th className="label-tight py-3 pr-6 text-[10px]">
                  {t("models.col.rentals")}
                </th>
                <th className="label-tight py-3 pr-6 text-[10px]">
                  {t("models.col.days")}
                </th>
                <th className="label-tight py-3 pr-6 text-[10px]">
                  {t("models.col.revenue")}
                </th>
                <th className="label-tight py-3 pr-6 text-[10px]">
                  {t("models.col.utilisation")}
                </th>
                <th className="label-tight py-3 text-[10px]">
                  {t("models.col.upcoming")}
                </th>
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
                    {money(m.revenueGrosze)}
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
            {t("empty.models")}
          </p>
        )}
      </section>
    </div>
  );
}
