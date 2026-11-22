import { useLocale, useTranslations } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
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
import { EXPENSE_GROUP_OF } from "@/lib/admin/expense-options";
import { getSetting } from "@/lib/admin/settings";
import { PrintButton } from "@/components/admin/PrintButton";
import {
  formatDay,
  intlLocale,
} from "@/components/admin/economics-charts";
import { formatPln, formatPlnPrecise } from "@/lib/format";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MONTHS = 12;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin.analytics" });
  return { title: t("report.metaTitle") };
}

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

function monthLabel(month: string, locale: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(intlLocale(locale), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
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
  const t = useTranslations("Admin.analytics");
  const locale = useLocale();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
        <thead>
          <tr className="text-ink-faint">
            <th className={th}>{t("monthly.col.month")}</th>
            <th className={th}>{t("monthly.col.revenue")}</th>
            <th className={th}>{t("monthly.col.expenses")}</th>
            <th className={th}>{t("monthly.col.margin")}</th>
            <th className={th}>{t("monthly.col.daysRented")}</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <tr key={m.month}>
              <td className={td}>{monthLabel(m.month, locale)}</td>
              <td className={`${td} tabular-nums`}>
                {formatPln(m.revenueGrosze, locale)}
              </td>
              <td className={`${td} tabular-nums`}>
                {formatPln(m.expenseGrosze, locale)}
              </td>
              <td className={`${td} tabular-nums`}>
                {formatPln(m.marginGrosze, locale)}
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
  const t = useTranslations("Admin.analytics");
  const locale = useLocale();
  const money = (grosze: number) => formatPln(grosze, locale);
  return (
    <>
      <section className="mt-8">
        <h2 className="label text-xs">{t("report.summary")}</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Figure
            label={t("sections.revenue")}
            value={money(e.revenueGrosze)}
            hint={t("units.rentals", { count: e.rentals })}
          />
          <Figure
            label={t("sections.costs")}
            value={money(e.expensesGrosze)}
            hint={t("perDay", { amount: money(e.costPerDayGrosze) })}
          />
          <Figure
            label={t("cards.margin")}
            value={money(e.marginGrosze)}
            hint={t("report.ofRevenue", { percent: pct(e.marginPct) })}
          />
          <Figure
            label={t("report.netPerDay")}
            value={money(e.netPerDayGrosze)}
            hint={t("report.daysInCompany", {
              days: t("units.days", { count: e.daysOwned }),
            })}
          />
        </div>
      </section>

      <section className="mt-8" data-print-keep>
        <h2 className="label text-xs">{t("report.recovery")}</h2>
        <div className="overflow-x-auto">
          <table className="mt-3 w-full min-w-[34rem] border-collapse text-left text-sm">
            <tbody>
              <tr>
                <td className={`${td} w-72`}>{t("report.purchasePrice")}</td>
                <td className={`${td} tabular-nums`}>
                  {e.purchasePriceGrosze == null
                    ? t("report.notEntered")
                    : `${money(e.purchasePriceGrosze)}${e.purchasedOn ? ` (${formatDay(e.purchasedOn, locale)})` : ""}`}
                </td>
              </tr>
              <tr>
                <td className={td}>{t("report.recoveredFromPurchase")}</td>
                <td className={td}>
                  {e.recoveredPct == null ? (
                    t("report.noPurchasePrice")
                  ) : (
                    <Bar value={e.recoveredPct} />
                  )}
                </td>
              </tr>
              <tr>
                <td className={td}>{t("report.expectedPayback")}</td>
                <td className={`${td} tabular-nums`}>
                  {e.purchasePriceGrosze == null
                    ? "—"
                    : e.marginGrosze >= e.purchasePriceGrosze
                      ? t("economics.returned")
                      : e.paybackOn
                        ? formatDay(e.paybackOn, locale)
                        : t("report.notAtCurrentPace")}
                </td>
              </tr>
              <tr>
                <td className={td}>{t("report.daysRented")}</td>
                <td className={`${td} tabular-nums`}>
                  {e.daysRented} <Bar value={e.utilisation} />
                </td>
              </tr>
              <tr>
                <td className={td}>{t("report.daysFreeFull")}</td>
                <td className={`${td} tabular-nums`}>{e.daysFree}</td>
              </tr>
              <tr>
                <td className={td}>{t("report.daysBlockedFull")}</td>
                <td className={`${td} tabular-nums`}>{e.daysBlocked}</td>
              </tr>
              <tr>
                <td className={td}>{t("report.idleCost")}</td>
                <td className={`${td} tabular-nums`}>
                  {money(e.idleCostGrosze)}
                </td>
              </tr>
              <tr>
                <td className={td}>{t("report.depreciationToDate")}</td>
                <td className={`${td} tabular-nums`}>
                  {e.depreciationToDateGrosze == null
                    ? t("report.noDepreciationSettings")
                    : money(e.depreciationToDateGrosze)}
                </td>
              </tr>
              <tr>
                <td className={td}>{t("report.marginAfterDepreciation")}</td>
                <td className={`${td} tabular-nums`}>
                  {e.tcoMarginGrosze == null
                    ? "—"
                    : money(e.tcoMarginGrosze)}
                </td>
              </tr>
              <tr>
                <td className={td}>{t("report.costRevenuePerKm")}</td>
                <td className={`${td} tabular-nums`}>
                  {e.costPerKmGrosze == null
                    ? t("report.noOdometer")
                    : t("report.kmBasis", {
                        cost: formatPlnPrecise(e.costPerKmGrosze, locale),
                        revenue: formatPlnPrecise(
                          e.revenuePerKmGrosze ?? 0,
                          locale,
                        ),
                        km: e.kmDriven,
                        withKm: e.rentalsWithKm,
                        rentalsLabel: t("units.rentals", { count: e.rentals }),
                      })}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="label text-xs">{t("report.expenses")}</h2>
        {expenses.length === 0 ? (
          <p className="text-ink-faint mt-3 text-sm">{t("empty.expenses")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="mt-3 w-full min-w-[34rem] border-collapse text-left text-sm">
              <thead>
                <tr className="text-ink-faint">
                  <th className={th}>{t("col.date")}</th>
                  <th className={th}>{t("col.group")}</th>
                  <th className={th}>{t("col.kind")}</th>
                  <th className={th}>{t("col.amount")}</th>
                  <th className={th}>{t("col.mileage")}</th>
                  <th className={th}>{t("col.note")}</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((x) => (
                  <tr key={x.id}>
                    <td className={`${td} whitespace-nowrap tabular-nums`}>
                      {formatDay(x.incurredOn, locale)}
                    </td>
                    <td className={td}>
                      {t(`expense.group.${EXPENSE_GROUP_OF[x.category]}`)}
                    </td>
                    <td className={td}>
                      {t(`expense.category.${x.category}`)}
                    </td>
                    <td className={`${td} whitespace-nowrap tabular-nums`}>
                      {money(x.amountGrosze)}
                    </td>
                    <td className={`${td} tabular-nums`}>
                      {x.odometerKm != null
                        ? t("units.km", { km: x.odometerKm })
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
  const t = await getTranslations("Admin.analytics");

  const carId = (await searchParams).auto;
  if (carId && !UUID_RE.test(carId)) notFound();

  const company = await getSetting("company");
  const today = formatDay(new Date().toISOString().slice(0, 10), locale);

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
          subtitle={t("report.periodSince", {
            date: formatDay(e.since, locale),
          })}
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
          <h2 className="label text-xs">
            {t("report.lastMonths", { count: MONTHS })}
          </h2>
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
  const money = (grosze: number) => formatPln(grosze, locale);

  return (
    <div data-print="report" className="mx-auto max-w-5xl">
      <Header
        title={t("report.fleetTitle")}
        subtitle={t("units.cars", { count: totals.cars })}
        company={company.email}
        today={today}
        xlsxHref="/api/admin/report"
        backHref="/admin/analytics"
      />

      <section className="mt-8">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Figure label={t("sections.revenue")} value={money(totals.revenueGrosze)} />
          <Figure label={t("sections.costs")} value={money(totals.expensesGrosze)} />
          <Figure
            label={t("cards.margin")}
            value={money(totals.marginGrosze)}
            hint={t("report.ofRevenue", { percent: pct(totals.marginPct) })}
          />
          <Figure
            label={t("report.capitalRecovery")}
            value={pct(totals.recoveredPct)}
            hint={t("cards.recoveredOf", {
              recovered: money(totals.recoveredGrosze),
              invested: money(totals.investedGrosze),
            })}
          />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="label text-xs">{t("economics.title")}</h2>
        <div className="overflow-x-auto">
          <table className="mt-3 w-full min-w-[34rem] border-collapse text-left text-sm">
            <thead>
              <tr className="text-ink-faint">
                <th className={th}>{t("economics.col.unit")}</th>
                <th className={th}>{t("economics.col.revenue")}</th>
                <th className={th}>{t("economics.col.expenses")}</th>
                <th className={th}>{t("economics.col.margin")}</th>
                <th className={th}>{t("report.col.utilisation")}</th>
                <th className={th}>{t("report.col.free")}</th>
                <th className={th}>{t("report.col.blocked")}</th>
                <th className={th}>{t("report.col.recovery")}</th>
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
                    {money(c.revenueGrosze)}
                  </td>
                  <td className={`${td} whitespace-nowrap tabular-nums`}>
                    {money(c.expensesGrosze)}
                  </td>
                  <td className={`${td} whitespace-nowrap tabular-nums`}>
                    {money(c.marginGrosze)}
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
        <h2 className="label text-xs">
          {t("report.lastMonths", { count: MONTHS })}
        </h2>
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
  const t = useTranslations("Admin.analytics");
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3 print:hidden">
        <Link
          href={backHref}
          className="label-tight text-ink-faint hover:text-ink -my-2 inline-flex min-h-11 items-center text-[10px]"
        >
          {t("report.back")}
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
          {t("actions.excel")}
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
          <p>{t("report.generated", { date: today })}</p>
        </div>
      </div>
    </>
  );
}

function Footer() {
  const t = useTranslations("Admin.analytics");
  return (
    <p className="border-line text-ink-faint mt-10 border-t pt-4 text-[11px]">
      {t("report.footer")}
    </p>
  );
}
