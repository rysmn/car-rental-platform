import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { formatPln } from "@/lib/format";
import {
  CostBreakdown,
  intlLocale,
} from "@/components/admin/economics-charts";
import {
  EXPENSE_GROUP_OF,
  type ExpenseCategory,
  type ExpenseGroup,
} from "@/lib/admin/expense-options";
import type {
  CarOccupancy,
  CostSlice,
  CustomerMix,
  Highlight,
  SeasonRow,
  WeekdayRow,
  Window,
  WindowMetrics,
} from "@/lib/admin/insights";
import { delta } from "@/lib/admin/insights";
import { pick } from "@/lib/i18n-pick";

/** "+12,4%" against the previous period, coloured by direction, or nothing. */
function Delta({
  now,
  before,
  invert = false,
}: {
  now: number;
  before: number | null;
  /** Costs going up is bad news; revenue going up is good. */
  invert?: boolean;
}) {
  const locale = useLocale();
  if (before == null) return null;
  const d = delta(now, before);
  if (d == null) return <span className="text-ink-faint text-[11px]">—</span>;
  const good = invert ? d <= 0 : d >= 0;
  const rounded = Math.round(d * 10) / 10;
  return (
    <span
      className={`text-[11px] tabular-nums ${good ? "text-emerald-400" : "text-red"}`}
    >
      {rounded > 0 ? "+" : rounded < 0 ? "−" : ""}
      {Math.abs(rounded).toLocaleString(intlLocale(locale), {
        maximumFractionDigits: 1,
      })}
      %
    </span>
  );
}

function Tile({
  label,
  value,
  hint,
  children,
}: {
  label: string;
  value: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-void p-4 sm:p-5">
      <p className="label-tight text-ink-faint text-[10px]">{label}</p>
      <p className="font-heading text-ink mt-3 text-xl font-bold tabular-nums">
        {value}
      </p>
      <p className="mt-1 flex items-center gap-2">
        {children}
        {hint && <span className="text-ink-faint text-[11px]">{hint}</span>}
      </p>
    </div>
  );
}

const OCCUPANCY_DOT: Record<CarOccupancy["level"], string> = {
  good: "bg-emerald-400",
  watch: "bg-amber-400",
  bad: "bg-red",
};

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** "2026-08" → "Aug" / "sie" — twelve of these have to fit on one line. */
function shortMonth(month: string, locale: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(intlLocale(locale), {
    month: "short",
    timeZone: "UTC",
  })
    .format(new Date(Date.UTC(y, m - 1, 1)))
    .replace(".", "");
}

export function InsightSections({
  window,
  metrics,
  before,
  cars,
  costs,
  weekdays,
  season,
  mix,
  highlights,
}: {
  window: Window;
  metrics: WindowMetrics;
  before: WindowMetrics | null;
  cars: CarOccupancy[];
  costs: CostSlice[];
  weekdays: WeekdayRow[];
  season: SeasonRow[];
  mix: CustomerMix;
  highlights: Highlight[];
}) {
  const t = useTranslations("Admin.analytics");
  const locale = useLocale();
  const money = (grosze: number) => formatPln(grosze, locale);

  const byCategory: Partial<Record<ExpenseCategory, number>> = {};
  const byGroup: Record<ExpenseGroup, number> = {
    wear: 0,
    standing: 0,
    running: 0,
  };
  for (const c of costs) {
    const cat = c.category as ExpenseCategory;
    byCategory[cat] = (byCategory[cat] ?? 0) + c.amountGrosze;
    const g = EXPENSE_GROUP_OF[cat];
    if (g) byGroup[g] += c.amountGrosze;
  }

  const peakSeason = Math.max(0.0001, ...season.map((s) => s.occupancy));
  const peakWeekday = Math.max(0.0001, ...weekdays.map((d) => d.occupancy));

  return (
    <>
      {/* ── Headline, with the comparison ────────────────────────────────── */}
      <div className="border-line bg-line mt-6 grid grid-cols-2 gap-px border lg:grid-cols-4">
        <Tile label={t("sections.revenue")} value={money(metrics.revenueGrosze)}>
          <Delta
            now={metrics.revenueGrosze}
            before={before?.revenueGrosze ?? null}
          />
        </Tile>
        <Tile label={t("sections.costs")} value={money(metrics.expenseGrosze)}>
          <Delta
            now={metrics.expenseGrosze}
            before={before?.expenseGrosze ?? null}
            invert
          />
        </Tile>
        <Tile label={t("sections.result")} value={money(metrics.marginGrosze)}>
          <Delta
            now={metrics.marginGrosze}
            before={before?.marginGrosze ?? null}
          />
        </Tile>
        <Tile
          label={t("sections.occupancy")}
          value={pct(metrics.occupancy)}
          hint={t("sections.daysOfTotal", {
            rented: metrics.daysRented,
            total: metrics.carDays,
          })}
        >
          <Delta now={metrics.occupancy} before={before?.occupancy ?? null} />
        </Tile>
      </div>

      <div className="border-line bg-line mt-px grid grid-cols-2 gap-px border lg:grid-cols-4">
        <Tile
          label={t("sections.rentals")}
          value={metrics.rentals.toLocaleString(intlLocale(locale))}
          hint={t("sections.rentalsHint")}
        >
          <Delta now={metrics.rentals} before={before?.rentals ?? null} />
        </Tile>
        <Tile
          label={t("sections.avgBooking")}
          value={
            metrics.avgBookingValueGrosze == null
              ? "—"
              : money(metrics.avgBookingValueGrosze)
          }
        >
          {metrics.avgBookingValueGrosze != null && (
            <Delta
              now={metrics.avgBookingValueGrosze}
              before={before?.avgBookingValueGrosze ?? null}
            />
          )}
        </Tile>
        <Tile
          label={t("sections.avgDailyRate")}
          value={
            metrics.avgDailyRateGrosze == null
              ? "—"
              : money(metrics.avgDailyRateGrosze)
          }
        >
          {metrics.avgDailyRateGrosze != null && (
            <Delta
              now={metrics.avgDailyRateGrosze}
              before={before?.avgDailyRateGrosze ?? null}
            />
          )}
        </Tile>
        <Tile
          label={t("sections.avgLength")}
          value={
            metrics.avgRentalDays == null
              ? "—"
              : t("units.days", {
                  count:
                    Math.round(metrics.avgRentalDays * 10) / 10,
                })
          }
        />
      </div>

      <div className="border-line bg-line mt-px grid grid-cols-2 gap-px border lg:grid-cols-4">
        <Tile
          label={t("sections.daysRented")}
          value={String(metrics.daysRented)}
          hint={t("sections.idleHint", { count: metrics.daysIdle })}
        />
        <Tile
          label={t("sections.daysBlocked")}
          value={String(metrics.daysBlocked)}
          hint={t("sections.blockedHint")}
        />
        <Tile
          label={t("sections.driven")}
          value={
            metrics.kmDriven > 0
              ? t("units.km", { km: metrics.kmDriven })
              : "—"
          }
          hint={
            metrics.kmDriven > 0 ? undefined : t("sections.noOdometer")
          }
        />
        <Tile
          label={t("sections.profitPerKm")}
          value={
            metrics.profitPerKmGrosze == null
              ? "—"
              : money(metrics.profitPerKmGrosze)
          }
          hint={
            metrics.revenuePerKmGrosze == null
              ? undefined
              : t("sections.perKmHint", {
                  revenue: money(metrics.revenuePerKmGrosze),
                  cost: money(metrics.costPerKmGrosze ?? 0),
                })
          }
        />
      </div>

      {/* ── Best and worst ───────────────────────────────────────────────── */}
      {highlights.length > 0 && (
        <section className="mt-12">
          <h2 className="label text-ink text-xs">{t("sections.highlights")}</h2>
          <div className="border-line bg-line mt-4 grid grid-cols-2 gap-px border lg:grid-cols-5">
            {highlights.map((h) => (
              <div key={h.label.en} className="bg-void p-5">
                <p className="label-tight text-ink-faint text-[10px]">
                  {pick(h.label, locale)}
                </p>
                <p className="text-ink mt-3 text-sm">{h.subject}</p>
                <p className="font-heading text-ink mt-1 text-lg font-bold tabular-nums">
                  {pick(h.value, locale)}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Occupancy per car ────────────────────────────────────────────── */}
      <section className="mt-12">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="label text-ink text-xs">{t("sections.fleetOccupancy")}</h2>
          <span className="text-ink-faint flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="rounded-pill h-2 w-2 bg-emerald-400" />
              {t("sections.legendGood")}
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="rounded-pill h-2 w-2 bg-amber-400" />
              {t("sections.legendWatch")}
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="rounded-pill bg-red h-2 w-2" />
              {t("sections.legendBad")}
            </span>
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-line text-ink-faint border-y">
                <th className="label-tight py-3 pr-6 text-[10px]">{t("sections.col.car")}</th>
                <th className="label-tight py-3 pr-6 text-[10px]">{t("sections.col.occupancy")}</th>
                <th className="label-tight py-3 pr-6 text-[10px]">
                  {t("sections.col.daysRented")}
                </th>
                <th className="label-tight py-3 pr-6 text-[10px]">{t("sections.col.revenue")}</th>
                <th className="label-tight py-3 pr-6 text-[10px]">{t("sections.col.costs")}</th>
                <th className="label-tight py-3 text-[10px]">{t("sections.col.result")}</th>
              </tr>
            </thead>
            <tbody>
              {cars.map((c) => (
                <tr key={c.carId} className="border-line border-b">
                  <td className="py-3 pr-6">
                    <span className="flex items-center gap-3">
                      <span
                        aria-hidden
                        className={`rounded-pill h-2.5 w-2.5 shrink-0 ${OCCUPANCY_DOT[c.level]}`}
                      />
                      <Link
                        href={{
                          pathname: "/admin/analytics/[carId]",
                          params: { carId: c.carId },
                        }}
                        className="text-ink tap-area -my-1.5 inline-block py-1.5 underline-offset-4 hover:underline"
                      >
                        {c.carName}
                      </Link>
                      <span className="text-ink-faint text-xs">{c.plate}</span>
                    </span>
                  </td>
                  <td className="py-3 pr-6 tabular-nums">
                    <span className="flex items-center gap-3">
                      <span className="bg-line h-1.5 w-20 shrink-0">
                        <span
                          className={`block h-full ${OCCUPANCY_DOT[c.level]}`}
                          style={{
                            width: `${Math.max(c.occupancy * 100, c.occupancy > 0 ? 2 : 0)}%`,
                          }}
                        />
                      </span>
                      <span className="text-ink">{pct(c.occupancy)}</span>
                    </span>
                  </td>
                  <td className="text-silver py-3 pr-6 tabular-nums">
                    {c.daysRented} / {window.days}
                  </td>
                  <td className="text-silver py-3 pr-6 whitespace-nowrap tabular-nums">
                    {money(c.revenueGrosze)}
                  </td>
                  <td className="text-silver py-3 pr-6 whitespace-nowrap tabular-nums">
                    {money(c.expenseGrosze)}
                  </td>
                  <td
                    className={`py-3 whitespace-nowrap tabular-nums ${
                      c.marginGrosze >= 0 ? "text-silver" : "text-red"
                    }`}
                  >
                    {money(c.marginGrosze)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Where the money goes ─────────────────────────────────────────── */}
      <section className="mt-12">
        <h2 className="label text-ink text-xs">{t("sections.costsTitle")}</h2>
        <p className="text-ink-faint mt-1 text-xs">{t("sections.costsIntro")}</p>
        <CostBreakdown byGroup={byGroup} byCategory={byCategory} />
      </section>

      {/* ── Rhythm ───────────────────────────────────────────────────────── */}
      <section className="mt-12 grid gap-10 lg:grid-cols-2">
        <div>
          <h2 className="label text-ink text-xs">{t("sections.weekdays")}</h2>
          <p className="text-ink-faint mt-1 mb-4 text-xs">
            {t("sections.weekdaysIntro")}
          </p>
          <ul className="flex flex-col gap-2">
            {weekdays.map((d) => (
              <li key={d.weekday} className="flex items-center gap-3">
                <span className="text-ink-faint w-24 shrink-0 text-xs">
                  {pick(d.label, locale)}
                </span>
                <span className="bg-line h-3 flex-1">
                  <span
                    className="bg-red block h-full"
                    style={{
                      width: `${(d.occupancy / peakWeekday) * 100}%`,
                    }}
                  />
                </span>
                <span className="text-ink w-12 shrink-0 text-right text-xs tabular-nums">
                  {pct(d.occupancy)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="label text-ink text-xs">{t("sections.season")}</h2>
          <p className="text-ink-faint mt-1 mb-4 text-xs">
            {t("sections.seasonIntro")}
          </p>
          <ul className="flex h-40 items-end gap-1">
            {season.map((s) => (
              <li
                key={s.month}
                className="flex flex-1 flex-col items-center gap-1"
              >
                <span
                  title={t("sections.seasonTooltip", {
                    month: s.month,
                    occupancy: pct(s.occupancy),
                    revenue: money(s.revenueGrosze),
                  })}
                  className="bg-red w-full"
                  style={{
                    height: `${Math.max((s.occupancy / peakSeason) * 100, s.occupancy > 0 ? 3 : 1)}%`,
                  }}
                />
                <span className="text-ink-faint text-[9px]">
                  {shortMonth(s.month, locale)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Who is renting ───────────────────────────────────────────────── */}
      <section className="mt-12">
        <h2 className="label text-ink text-xs">{t("sections.mix")}</h2>
        <div className="border-line bg-line mt-4 grid gap-px border sm:grid-cols-3">
          <Tile
            label={t("sections.newCustomers")}
            value={String(mix.newCustomers)}
            hint={t("sections.newCustomersHint")}
          />
          <Tile
            label={t("sections.returning")}
            value={String(mix.returning)}
            hint={
              mix.newCustomers + mix.returning > 0
                ? t("sections.returningHint", {
                    percent: Math.round(
                      (mix.returning / (mix.newCustomers + mix.returning)) * 100,
                    ),
                  })
                : undefined
            }
          />
          <Tile
            label={t("sections.unknown")}
            value={String(mix.unknown)}
            hint={t("sections.unknownHint")}
          />
        </div>
        <p className="text-ink-faint mt-3 text-[11px]">{t("sections.mixNote")}</p>
      </section>
    </>
  );
}
