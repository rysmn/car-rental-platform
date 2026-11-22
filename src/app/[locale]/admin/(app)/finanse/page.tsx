import { getTranslations, setRequestLocale } from "next-intl/server";
import { guardPage } from "@/lib/auth/guard";
import { Link } from "@/i18n/navigation";
import { formatPln } from "@/lib/format";
import {
  PERIODS,
  resolveWindow,
  previousWindow,
  delta,
  type PeriodKey,
  type Window,
} from "@/lib/admin/insights";
import {
  getBusinessCostStructure,
  getBusinessMonthlySeries,
  getCompanyResult,
} from "@/lib/admin/business-economics";
import {
  listBusinessExpenses,
  listBusinessRecurring,
} from "@/lib/admin/business-expenses";
import { ExpenseManager } from "./ExpenseManager";
import { RecurringManager } from "./RecurringManager";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin.finance" });
  return { title: t("title") };
}

/** "2026-08" → "Aug 2026" / "sie 2026", in the request locale. */
function monthLabel(month: string, locale: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "pl-PL", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

function pct(v: number | null): string {
  if (v == null) return "—";
  const rounded = Math.round(v);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

/** The period bar, as a plain GET form — a chosen period is a shareable link. */
async function PeriodFilters({
  period,
  window,
}: {
  period: PeriodKey;
  window: Window;
}) {
  const t = await getTranslations("Admin.finance");
  const field =
    "h-9 border border-line-strong bg-surface-1 px-2 text-xs text-ink";
  return (
    <form
      method="get"
      className="border-line bg-void flex flex-wrap items-end gap-3 border p-4"
    >
      <label className="flex flex-col gap-1">
        <span className="label-tight text-ink-faint text-[10px]">
          {t("period.label")}
        </span>
        <select name="period" defaultValue={period} className={field}>
          {PERIODS.map((p) => (
            <option key={p.key} value={p.key}>
              {t(`periods.${p.key}`)}
            </option>
          ))}
          <option value="custom">{t("period.custom")}</option>
        </select>
      </label>
      {/* Always visible, not hidden behind "custom": they double as a readout
          of what the chosen preset actually resolved to. */}
      <label className="flex flex-col gap-1">
        <span className="label-tight text-ink-faint text-[10px]">
          {t("period.from")}
        </span>
        <input
          type="date"
          name="from"
          defaultValue={window.from}
          className={field}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="label-tight text-ink-faint text-[10px]">
          {t("period.to")}
        </span>
        <input
          type="date"
          name="to"
          defaultValue={window.to}
          className={field}
        />
      </label>
      <button
        type="submit"
        className="label bg-red hover:bg-red-hover inline-flex h-9 items-center px-5 text-xs text-white transition-colors"
      >
        {t("period.submit")}
      </button>
    </form>
  );
}

function Tile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="bg-void p-6">
      <p className="label-tight text-ink-faint text-[10px]">{label}</p>
      <p
        className={`font-heading mt-3 text-2xl font-bold tabular-nums ${
          tone === "good"
            ? "text-emerald-400"
            : tone === "bad"
              ? "text-red"
              : "text-ink"
        }`}
      >
        {value}
      </p>
      {hint && <p className="text-ink-faint mt-2 text-xs">{hint}</p>}
    </div>
  );
}

/**
 * Finanse — the money side of the business.
 *
 * Analityka answers "which car earns"; this page answers "what was left". The
 * two read the same revenue definition from the same modules, deliberately: a
 * panel where two pages report a different August is a panel nobody believes.
 */
export default async function FinancePage({
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
  await guardPage("finanse.podglad");

  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Admin.finance");

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
  const prev = previousWindow(win);

  const [result, before, structure, months, expenses, recurring] =
    await Promise.all([
      getCompanyResult(win.from, win.to),
      getCompanyResult(prev.from, prev.to),
      getBusinessCostStructure(win.from, win.to),
      getBusinessMonthlySeries(12),
      listBusinessExpenses(win.from, win.to),
      listBusinessRecurring(),
    ]);

  const maxMonth = Math.max(...months.map((m) => m.expenseGrosze), 1);
  const costTotal = result.carCostGrosze + result.businessCostGrosze;
  // How much of every złoty of cost is the company rather than the cars. The
  // interesting number when marketing starts climbing.
  const businessSharePct =
    costTotal > 0 ? (result.businessCostGrosze / costTotal) * 100 : null;

  return (
    <div>
      <h1 className="font-heading text-3xl font-bold">{t("title")}</h1>
      <p className="text-ink-muted mt-2 text-sm">
        {t.rich("intro", {
          link: (chunks) => (
            <Link
              href="/admin/fleet"
              className="text-silver hover:text-ink tap-area underline underline-offset-2"
            >
              {chunks}
            </Link>
          ),
        })}
      </p>

      <div className="mt-8">
        <PeriodFilters period={period} window={win} />
      </div>

      {/* ── Wynik firmy ──────────────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="label text-ink text-xs">{t("result.title")}</h2>
        <p className="text-ink-faint mt-1 mb-4 text-xs">
          {t("result.description", { from: prev.from, to: prev.to })}
        </p>
        <div className="border-line bg-line grid gap-px border sm:grid-cols-2 lg:grid-cols-4">
          <Tile
            label={t("tiles.revenue")}
            value={formatPln(result.revenueGrosze, locale)}
            hint={t("result.previously", {
              value: formatPln(before.revenueGrosze, locale),
              delta: pct(delta(result.revenueGrosze, before.revenueGrosze)),
            })}
          />
          <Tile
            label={t("tiles.carCosts")}
            value={formatPln(result.carCostGrosze, locale)}
            hint={t("tiles.carCostsHint")}
          />
          <Tile
            label={t("tiles.businessCosts")}
            value={formatPln(result.businessCostGrosze, locale)}
            hint={t("result.previously", {
              value: formatPln(before.businessCostGrosze, locale),
              delta: pct(
                delta(result.businessCostGrosze, before.businessCostGrosze),
              ),
            })}
          />
          <Tile
            label={t("tiles.left")}
            value={formatPln(result.resultGrosze, locale)}
            tone={result.resultGrosze >= 0 ? "good" : "bad"}
            hint={
              result.marginPct == null
                ? t("result.noRevenue")
                : t("result.margin", {
                    margin: Math.round(result.marginPct),
                    share:
                      businessSharePct == null
                        ? "—"
                        : `${Math.round(businessSharePct)}%`,
                  })
            }
          />
        </div>
      </section>

      {/* ── Na co idą pieniądze ──────────────────────────────────────────── */}
      <section className="mt-14">
        <h2 className="label text-ink text-xs">{t("structure.title")}</h2>
        <p className="text-ink-faint mt-1 mb-4 text-xs">
          {t("structure.description", {
            total: formatPln(structure.totalGrosze, locale),
          })}
        </p>

        {structure.groups.length === 0 ? (
          <p className="border-line text-silver border px-5 py-6 text-center text-sm">
            {t("structure.empty")}
          </p>
        ) : (
          <div className="border-line border">
            {structure.groups.map((g) => (
              <div
                key={g.group}
                className="border-line/60 border-b p-4 last:border-0"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <span className="text-ink text-sm">
                    {t(`groups.${g.group}`)}
                  </span>
                  <span className="flex items-baseline gap-3">
                    <span className="text-ink text-sm tabular-nums">
                      {formatPln(g.amountGrosze, locale)}
                    </span>
                    <span className="text-ink-faint w-10 text-right text-xs tabular-nums">
                      {Math.round(g.sharePct)}%
                    </span>
                  </span>
                </div>
                <div className="bg-line mt-2 h-1.5 w-full">
                  <div
                    className="bg-red h-full"
                    style={{ width: `${Math.max(g.sharePct, 1)}%` }}
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
                  {g.categories.map((c) => (
                    <span
                      key={c.category}
                      className="text-ink-faint text-xs tabular-nums"
                    >
                      {t(`categories.${c.category}`)}{" "}
                      <span className="text-silver">
                        {formatPln(c.amountGrosze, locale)}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── 12 miesięcy ──────────────────────────────────────────────────── */}
      <section className="mt-14">
        <h2 className="label text-ink text-xs">{t("months.title")}</h2>
        <p className="text-ink-faint mt-1 mb-4 text-xs">
          {t("months.description")}
        </p>
        {/* Dwanaście słupków z podpisami potrzebuje ~34rem. Na telefonie nie
            ma tyle miejsca, więc przewija się wykres, a nie cała strona. */}
        <div className="border-line overflow-x-auto border p-4">
          <div className="flex min-w-[32rem] items-end gap-1">
            {months.map((m, i) => (
              <div key={m.month} className="flex flex-1 flex-col items-center">
                <div
                  className={`w-full ${
                    i === months.length - 1 ? "bg-red/50" : "bg-red"
                  }`}
                  style={{
                    height: `${Math.max((m.expenseGrosze / maxMonth) * 120, m.expenseGrosze > 0 ? 2 : 0)}px`,
                  }}
                  title={t("months.barTitle", {
                    month: monthLabel(m.month, locale),
                    amount: formatPln(m.expenseGrosze, locale),
                  })}
                />
                <span className="text-ink-faint mt-2 text-[9px] whitespace-nowrap">
                  {monthLabel(m.month, locale)}
                </span>
                <span className="text-silver text-[9px] tabular-nums">
                  {Math.round(m.expenseGrosze / 100).toLocaleString(
                    locale === "en" ? "en-GB" : "pl-PL",
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Abonamenty ───────────────────────────────────────────────────── */}
      <section className="mt-14">
        <RecurringManager items={recurring} />
      </section>

      {/* ── Lista kosztów ────────────────────────────────────────────────── */}
      <section className="mt-14">
        <h2 className="label text-ink mb-4 text-xs">{t("list.title")}</h2>
        <ExpenseManager expenses={expenses} />
      </section>
    </div>
  );
}
