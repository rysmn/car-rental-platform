import { setRequestLocale } from "next-intl/server";
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
import {
  BUSINESS_EXPENSE_LABEL,
  BUSINESS_GROUP_LABEL,
} from "@/lib/admin/business-expense-options";
import { ExpenseManager } from "./ExpenseManager";
import { RecurringManager } from "./RecurringManager";

export const metadata = { title: "Finanse" };

/** "2026-08" → "sie 2026". Panel is Polish-only, so no locale argument. */
function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const names = [
    "sty",
    "lut",
    "mar",
    "kwi",
    "maj",
    "cze",
    "lip",
    "sie",
    "wrz",
    "paź",
    "lis",
    "gru",
  ];
  return `${names[m - 1] ?? m} ${y}`;
}

function pct(v: number | null): string {
  if (v == null) return "—";
  const rounded = Math.round(v);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

/** The period bar, as a plain GET form — a chosen period is a shareable link. */
function PeriodFilters({
  period,
  window,
}: {
  period: PeriodKey;
  window: Window;
}) {
  const field =
    "h-9 border border-line-strong bg-surface-1 px-2 text-xs text-ink";
  return (
    <form
      method="get"
      className="border-line bg-void flex flex-wrap items-end gap-3 border p-4"
    >
      <label className="flex flex-col gap-1">
        <span className="label-tight text-ink-faint text-[10px]">Okres</span>
        <select name="period" defaultValue={period} className={field}>
          {PERIODS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
          <option value="custom">Własny zakres</option>
        </select>
      </label>
      {/* Always visible, not hidden behind "custom": they double as a readout
          of what the chosen preset actually resolved to. */}
      <label className="flex flex-col gap-1">
        <span className="label-tight text-ink-faint text-[10px]">Od</span>
        <input
          type="date"
          name="from"
          defaultValue={window.from}
          className={field}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="label-tight text-ink-faint text-[10px]">Do</span>
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
        Pokaż
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
      <h1 className="font-heading text-3xl font-bold">Finanse</h1>
      <p className="text-ink-muted mt-2 text-sm">
        Koszty firmy — reklama, biuro, księgowość, telefony, domena. Wszystko,
        czego nie da się przypisać do jednego auta. Koszty konkretnego
        egzemplarza (serwis, OC, opony) wpisujesz przy aucie w zakładce{" "}
        <Link
          href="/admin/fleet"
          className="text-silver hover:text-ink tap-area underline underline-offset-2"
        >
          Flota
        </Link>{" "}
        — inaczej jego marża będzie zawyżona. Przychód liczony tak samo jak w
        Analityce: tylko rezerwacje potwierdzone i zakończone, rozłożone na dni
        najmu.
      </p>

      <div className="mt-8">
        <PeriodFilters period={period} window={win} />
      </div>

      {/* ── Wynik firmy ──────────────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="label text-ink text-xs">Wynik za wybrany okres</h2>
        <p className="text-ink-faint mt-1 mb-4 text-xs">
          Przychód minus koszty aut minus koszty firmy. Porównanie do
          poprzedniego, równie długiego okresu ({prev.from} – {prev.to}).
        </p>
        <div className="border-line bg-line grid gap-px border sm:grid-cols-2 lg:grid-cols-4">
          <Tile
            label="Przychód"
            value={formatPln(result.revenueGrosze, "pl")}
            hint={`poprzednio ${formatPln(before.revenueGrosze, "pl")} · ${pct(
              delta(result.revenueGrosze, before.revenueGrosze),
            )}`}
          />
          <Tile
            label="Koszty aut"
            value={formatPln(result.carCostGrosze, "pl")}
            hint="serwis, paliwo, OC, leasing — z zakładki Flota"
          />
          <Tile
            label="Koszty firmy"
            value={formatPln(result.businessCostGrosze, "pl")}
            hint={`poprzednio ${formatPln(
              before.businessCostGrosze,
              "pl",
            )} · ${pct(
              delta(result.businessCostGrosze, before.businessCostGrosze),
            )}`}
          />
          <Tile
            label="Zostało"
            value={formatPln(result.resultGrosze, "pl")}
            tone={result.resultGrosze >= 0 ? "good" : "bad"}
            hint={
              result.marginPct == null
                ? "brak przychodu w tym okresie"
                : `marża ${Math.round(result.marginPct)}% · koszty firmy to ${
                    businessSharePct == null
                      ? "—"
                      : `${Math.round(businessSharePct)}%`
                  } wszystkich kosztów`
            }
          />
        </div>
      </section>

      {/* ── Na co idą pieniądze ──────────────────────────────────────────── */}
      <section className="mt-14">
        <h2 className="label text-ink text-xs">Na co idą pieniądze firmy</h2>
        <p className="text-ink-faint mt-1 mb-4 text-xs">
          Koszt PRZYPADAJĄCY na wybrany okres: kwota rozłożona na dni, które
          kupuje. Rok hostingu zapłacony w styczniu to jedna dwunasta na
          miesiąc, a nie styczniowa katastrofa i jedenaście darmowych miesięcy.
          Razem {formatPln(structure.totalGrosze, "pl")}.
        </p>

        {structure.groups.length === 0 ? (
          <p className="border-line text-silver border px-5 py-6 text-center text-sm">
            Brak kosztów firmowych w tym okresie. Dodaj pierwszy niżej — albo
            wpisz to, co płacisz co miesiąc, jako abonament.
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
                    {BUSINESS_GROUP_LABEL[g.group]}
                  </span>
                  <span className="flex items-baseline gap-3">
                    <span className="text-ink text-sm tabular-nums">
                      {formatPln(g.amountGrosze, "pl")}
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
                      {BUSINESS_EXPENSE_LABEL[c.category]}{" "}
                      <span className="text-silver">
                        {formatPln(c.amountGrosze, "pl")}
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
        <h2 className="label text-ink text-xs">Koszty firmy — 12 miesięcy</h2>
        <p className="text-ink-faint mt-1 mb-4 text-xs">
          Niezależne od filtra powyżej — odpowiada na pytanie, czy koszty stałe
          rosną. Ostatni słupek to miesiąc w toku i z natury jest niepełny.
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
                title={`${monthLabel(m.month)}: ${formatPln(m.expenseGrosze, "pl")}`}
              />
              <span className="text-ink-faint mt-2 text-[9px] whitespace-nowrap">
                {monthLabel(m.month)}
              </span>
              <span className="text-silver text-[9px] tabular-nums">
                {Math.round(m.expenseGrosze / 100).toLocaleString("pl-PL")}
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
        <h2 className="label text-ink mb-4 text-xs">
          Koszty wpisane w tym okresie
        </h2>
        <ExpenseManager expenses={expenses} />
      </section>
    </div>
  );
}
