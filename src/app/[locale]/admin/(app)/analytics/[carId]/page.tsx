import { notFound } from "next/navigation";
import { pick } from "@/lib/i18n-pick";
import { useLocale, useTranslations } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import {
  getCarEconomics,
  getCarDailySeries,
  getMonthlySeries,
  type CarEconomics,
} from "@/lib/admin/economics";
import { listCarExpenses } from "@/lib/admin/expenses";
import { CAR_STATUS_LABEL, isCarStatus } from "@/lib/admin/fleet-options";
import {
  PaybackMeter,
  NetCurve,
  DailyFlow,
  OccupancyStrip,
  CostBreakdown,
  formatDay,
  intlLocale,
} from "@/components/admin/economics-charts";
import { formatPln, formatPlnPrecise } from "@/lib/format";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Windows the charts can be drawn over. Anything else falls back to 180 days. */
const WINDOWS = [90, 180, 365] as const;
const DEFAULT_WINDOW = 180;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin.analytics" });
  return { title: t("car.metaTitle") };
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
  const t = useTranslations("Admin.analytics");
  const locale = useLocale();
  const money = (grosze: number) => formatPln(grosze, locale);
  const fleetLink = (chunks: React.ReactNode, modelId: string) => (
    <Link
      href={{
        pathname: "/admin/fleet/[id]",
        params: { id: modelId },
      }}
      className="text-ink tap-area underline underline-offset-4"
    >
      {chunks}
    </Link>
  );

  if (e.purchasePriceGrosze == null) {
    return (
      <div className="border-line border border-dashed p-6">
        <p className="label-tight text-ink-faint text-[10px]">
          {t("car.payback.title")}
        </p>
        <p className="text-silver mt-3 text-sm">
          {t.rich("car.payback.noPrice", {
            link: (chunks) => fleetLink(chunks, e.modelId),
          })}
        </p>
      </div>
    );
  }

  const paidBack = e.marginGrosze >= e.purchasePriceGrosze;

  return (
    <div className="border-line border p-6">
      <p className="label-tight text-ink-faint text-[10px]">
        {t("car.payback.title")}
      </p>
      <div className="mt-4">
        <PaybackMeter
          recoveredGrosze={e.recoveredGrosze ?? 0}
          purchaseGrosze={e.purchasePriceGrosze}
        />
      </div>
      <div className="mt-5 space-y-1 text-xs">
        {paidBack ? (
          <p className="text-emerald-400">
            {t("car.payback.paidBack")}{" "}
            <span className="tabular-nums">
              {money(e.marginGrosze - e.purchasePriceGrosze)}
            </span>
          </p>
        ) : (
          <>
            <p className="text-silver">
              {t("car.payback.remaining")}{" "}
              <span className="tabular-nums">
                {money(e.remainingGrosze ?? 0)}
              </span>
            </p>
            {e.paybackOn ? (
              <p className="text-silver">
                {t("car.payback.onPace", {
                  perDay: t("perDay", { amount: money(e.netPerDayGrosze) }),
                })}{" "}
                <span className="text-ink tabular-nums">
                  {formatDay(e.paybackOn, locale)}
                </span>{" "}
                <span className="text-ink-faint">
                  {t("car.payback.daysLeft", {
                    duration: t("units.days", {
                      count: e.paybackDaysLeft ?? 0,
                    }),
                  })}
                </span>
              </p>
            ) : (
              <p className="text-red">
                {e.netPerDayGrosze > 0
                  ? t("car.payback.overTwentySeven")
                  : t("car.payback.never")}
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
  const t = await getTranslations("Admin.analytics");
  const money = (grosze: number) => formatPln(grosze, locale);

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

  const fleetLink = (chunks: React.ReactNode) => (
    <Link
      href={{
        pathname: "/admin/fleet/[id]",
        params: { id: e.modelId },
      }}
      className="text-ink tap-area underline underline-offset-4"
    >
      {chunks}
    </Link>
  );

  return (
    <div>
      <Link
        href="/admin/analytics"
        className="-my-2 inline-flex min-h-11 items-center label-tight text-ink-faint text-[10px] transition-colors hover:text-ink"
      >
        {t("car.back")}
      </Link>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="font-heading text-3xl font-bold">{e.plate}</h1>
        <span className="text-silver text-sm">{e.carName}</span>
        <span className="border-line text-ink-faint border px-2 py-0.5 text-[10px]">
          {isCarStatus(e.status) ? pick(CAR_STATUS_LABEL[e.status], locale) : e.status}
        </span>
      </div>
      <p className="text-ink-muted mt-2 text-sm">
        {t("car.since", {
          date: formatDay(e.since, locale),
          days: t("units.days", { count: e.daysOwned }),
        })}
      </p>

      {/* Filters in one row above the charts. */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <span className="label-tight text-ink-faint text-[10px]">
          {t("car.period")}
        </span>
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
            {t("units.days", { count: w })}
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
          {t("car.report")}
        </Link>
        {/* Plain anchor — a file download, not a client-side navigation. */}
        {}
        <a
          href={`/api/admin/report?auto=${carId}`}
          className="label border-line-strong tap inline-flex h-9 items-center border px-4 text-xs text-ink transition-colors hover:border-ink hover:bg-ink/5"
        >
          {t("car.excel")}
        </a>
      </div>

      <div className="border-line bg-line mt-6 grid gap-px border sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={t("car.stat.revenue")}
          value={money(e.revenueGrosze)}
          hint={`${t("units.rentals", { count: e.rentals })} · ${t("units.days", { count: e.daysRented })}`}
        />
        <Stat
          label={t("car.stat.expenses")}
          value={money(e.expensesGrosze)}
          hint={t("perDay", { amount: money(e.costPerDayGrosze) })}
        />
        <Stat
          label={t("car.stat.margin")}
          value={money(e.marginGrosze)}
          hint={
            e.marginPct == null
              ? t("cards.noRevenue")
              : t("cards.marginOfRevenue", {
                  percent: Math.round(e.marginPct * 100),
                })
          }
          tone={e.marginGrosze >= 0 ? "good" : "bad"}
        />
        <Stat
          label={t("car.stat.netPerDay")}
          value={money(e.netPerDayGrosze)}
          hint={
            e.netPerDayGrosze >= 0
              ? t("car.stat.netPositive")
              : t("car.stat.netNegative")
          }
          tone={e.netPerDayGrosze >= 0 ? "good" : "bad"}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Payback e={e} />

        <div className="border-line border p-6">
          <p className="label-tight text-ink-faint text-[10px]">
            {t("car.idle.title")}
          </p>
          <p className="font-heading mt-3 text-2xl font-bold text-ink tabular-nums">
            {t("units.days", { count: e.daysIdle })}
          </p>
          <p className="text-ink-faint mt-1 text-xs">
            {t("car.idle.share", {
              percent: Math.round((1 - e.utilisation) * 100),
            })}
          </p>
          <div className="border-line mt-4 space-y-1 border-t pt-4 text-xs">
            <p className="text-silver">
              {t("car.idle.free")}{" "}
              <span className="tabular-nums">{e.daysFree}</span> —{" "}
              <span className="text-ink-faint">{t("car.idle.freeNote")}</span>
            </p>
            <p className="text-silver">
              {t("car.idle.blocked")}{" "}
              <span className="tabular-nums">{e.daysBlocked}</span> —{" "}
              <span className="text-ink-faint">{t("car.idle.blockedNote")}</span>
            </p>
          </div>
          <div className="border-line mt-4 space-y-1 border-t pt-4 text-xs">
            <p className="text-silver">
              {t("car.idle.standing")}{" "}
              <span className="tabular-nums">
                {t("perDay", { amount: money(e.standingPerDayGrosze) })}
              </span>
            </p>
            <p className="text-silver">
              {t("car.idle.idleCost")}{" "}
              <span className="text-red tabular-nums">
                {money(e.idleCostGrosze)}
              </span>
            </p>
            <p className="text-ink-faint">{t("car.idle.explain")}</p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="border-line border p-6">
          <p className="label-tight text-ink-faint text-[10px]">
            {t("car.dep.title")}
          </p>
          {e.depreciationToDateGrosze == null ? (
            <p className="text-silver mt-3 text-sm">
              {t.rich("car.dep.missing", {
                link: fleetLink,
              })}
            </p>
          ) : (
            <>
              <p className="font-heading mt-3 text-2xl font-bold text-ink tabular-nums">
                {money(e.depreciationToDateGrosze)}
              </p>
              <div className="border-line mt-4 space-y-1 border-t pt-4 text-xs">
                <p className="text-silver">
                  {t("car.dep.bookValue")}{" "}
                  <span className="tabular-nums">
                    {money(e.bookValueGrosze ?? 0)}
                  </span>
                </p>
                <p
                  className={
                    (e.tcoMarginGrosze ?? 0) >= 0
                      ? "text-emerald-400"
                      : "text-red"
                  }
                >
                  {t("car.dep.marginAfter")}{" "}
                  <span className="tabular-nums">
                    {money(e.tcoMarginGrosze ?? 0)}
                  </span>
                </p>
                <p className="text-ink-faint">{t("car.dep.explain")}</p>
              </div>
            </>
          )}
        </div>

        <div className="border-line border p-6">
          <p className="label-tight text-ink-faint text-[10px]">
            {t("car.km.title")}
          </p>
          {e.costPerKmGrosze == null ? (
            <p className="text-silver mt-3 text-sm">{t("car.km.missing")}</p>
          ) : (
            <>
              <p className="font-heading mt-3 text-2xl font-bold text-ink tabular-nums">
                {t("perKm", {
                  amount: formatPlnPrecise(e.costPerKmGrosze, locale),
                })}
              </p>
              <div className="border-line mt-4 space-y-1 border-t pt-4 text-xs">
                <p className="text-silver">
                  {t("car.km.revenue")}{" "}
                  <span className="tabular-nums">
                    {t("perKm", {
                      amount: formatPlnPrecise(
                        e.revenuePerKmGrosze ?? 0,
                        locale,
                      ),
                    })}
                  </span>
                </p>
                <p className="text-silver">
                  {t("car.km.driven")}{" "}
                  <span className="tabular-nums">
                    {t("units.km", { km: e.kmDriven })}
                  </span>
                </p>
                <p className="text-ink-faint">
                  {t("car.km.basis", {
                    withKm: e.rentalsWithKm,
                    rentalsLabel: t("units.rentals", { count: e.rentals }),
                  })}
                  {e.rentalsWithKm < e.rentals && ` ${t("car.km.lowData")}`}
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      <section className="mt-14">
        <h2 className="label text-xs text-ink">{t("car.net.title")}</h2>
        <p className="text-ink-faint mt-1 text-xs">{t("car.net.intro")}</p>
        <NetCurve days={days} targetGrosze={e.purchasePriceGrosze} />
      </section>

      <section className="mt-14">
        <h2 className="label text-xs text-ink">{t("car.day.title")}</h2>
        <p className="text-ink-faint mt-1 text-xs">
          {t("car.day.intro", {
            days: windowDays,
            revenue: money(windowRevenue),
            expenses: money(windowExpense),
          })}
        </p>
        <DailyFlow days={days} />
      </section>

      <section className="mt-14">
        <h2 className="label text-xs text-ink">{t("car.strip.title")}</h2>
        <p className="text-ink-faint mt-1 text-xs">{t("car.strip.intro")}</p>
        <OccupancyStrip days={days} />
      </section>

      <section className="mt-14">
        <h2 className="label text-xs text-ink">{t("car.costs.title")}</h2>
        <p className="text-ink-faint mt-1 text-xs">{t("car.costs.intro")}</p>
        <CostBreakdown byGroup={e.byGroup} byCategory={e.byCategory} />
      </section>

      <section className="mt-14">
        <h2 className="label text-xs text-ink">{t("car.months.title")}</h2>
        <p className="text-ink-faint mt-1 mb-4 text-xs">
          {t("car.months.intro")}
        </p>
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
              {months.map((m) => (
                <tr key={m.month} className="border-line border-b">
                  <td className="py-3 pr-6 text-ink">
                    {monthLabel(m.month, locale)}
                  </td>
                  <td className="text-silver py-3 pr-6 whitespace-nowrap tabular-nums">
                    {money(m.revenueGrosze)}
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
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-14">
        <h2 className="label text-xs text-ink">{t("car.expenses.title")}</h2>
        <p className="text-ink-faint mt-1 mb-4 text-xs">
          {t.rich("car.expenses.intro", {
            link: fleetLink,
          })}
        </p>
        {expenses.length === 0 ? (
          <p className="border-line text-silver border px-5 py-6 text-center text-sm">
            {t("empty.expenses")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-line text-ink-faint border-y">
                  <th className="label-tight py-3 pr-6 text-[10px]">
                    {t("col.date")}
                  </th>
                  <th className="label-tight py-3 pr-6 text-[10px]">
                    {t("col.kind")}
                  </th>
                  <th className="label-tight py-3 pr-6 text-[10px]">
                    {t("col.amount")}
                  </th>
                  <th className="label-tight py-3 pr-6 text-[10px]">
                    {t("col.mileage")}
                  </th>
                  <th className="label-tight py-3 text-[10px]">
                    {t("col.note")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((x) => (
                  <tr key={x.id} className="border-line border-b">
                    <td className="text-silver py-3 pr-6 whitespace-nowrap tabular-nums">
                      {formatDay(x.incurredOn, locale)}
                    </td>
                    <td className="py-3 pr-6 text-ink">
                      {t(`expense.category.${x.category}`)}
                    </td>
                    <td className="py-3 pr-6 text-ink tabular-nums">
                      {money(x.amountGrosze)}
                    </td>
                    <td className="text-silver py-3 pr-6 tabular-nums">
                      {x.odometerKm != null
                        ? t("units.km", { km: x.odometerKm })
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
