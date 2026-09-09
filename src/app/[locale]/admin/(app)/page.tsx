import { setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth/config";
import {
  getDashboardKpi,
  getMonthFinance,
  getTodayOperations,
  getFleetCalendar,
  getAttentionItems,
  type FleetState,
  type TodayOperation,
} from "@/lib/admin/dashboard";
import { listReservations } from "@/lib/admin/reservations";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { type ReservationStatus } from "@/lib/admin/reservation-status";
import { TodayActions } from "./TodayActions";
import { PublicStatusToggle } from "./PublicStatusToggle";
import { getSetting } from "@/lib/admin/settings";
import { Link, type AppHref } from "@/i18n/navigation";
import { STATUS_LABEL } from "@/lib/admin/reservation-status";
import { formatPln, formatDatePl, pluralPl } from "@/lib/format";

/**
 * The dashboard answers three questions, in this order: what has to happen
 * today, where is every car, and what needs a decision. Anything that cannot
 * change what the operator does in the next hour belongs on another page.
 */

/** "16:00" or an em dash — an unagreed handover time is information too. */
function timeCell(time: string | null): string {
  return time ?? "—";
}

/**
 * The five states, as the operator names them: 🟢 dostępny · 🔵 wynajęty ·
 * 🟠 zarezerwowany · ⚪ zablokowany · 🔴 serwis.
 *
 * Grey for blocked rather than the reserved amber: a block is a car taken OUT
 * of the fleet, nearer to service than to a booking, and sharing a colour made
 * the legend claim a distinction the grid did not draw. Deeper steps than the
 * -400s used before so the circles hold their colour on a white background as
 * well as a black one.
 */
const FLEET_DOT: Record<FleetState, string> = {
  available: "bg-emerald-500",
  rented: "bg-sky-500",
  reserved: "bg-orange-400",
  blocked: "bg-zinc-400",
  service: "bg-red",
};

const FLEET_LABEL: Record<FleetState, string> = {
  available: "Dostępny",
  rented: "Wynajęty",
  reserved: "Rezerwacja",
  blocked: "Zablokowany",
  service: "Serwis",
};

/** The operation itself, as an arrow — the direction the car is moving. */
function OperationCell({ kind }: { kind: TodayOperation["kind"] }) {
  const out = kind === "pickup";
  return (
    <span
      className={`flex items-center gap-2 whitespace-nowrap ${
        out ? "text-sky-400" : "text-emerald-400"
      }`}
    >
      <span aria-hidden>{out ? "↗" : "↙"}</span>
      {out ? "Wydanie" : "Zwrot"}
    </span>
  );
}

export default async function AdminDashboard({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [
    session,
    kpi,
    finance,
    operations,
    calendar,
    attention,
    recent,
    publicStatus,
  ] = await Promise.all([
    auth(),
    getDashboardKpi(),
    getMonthFinance(),
    getTodayOperations(),
    getFleetCalendar(21),
    getAttentionItems(),
    listReservations({ page: 1 }),
    getSetting("publicStatus"),
  ]);

  const cards = [
    {
      label: "Rezerwacje dziś",
      value: String(kpi.reservationsToday),
      hint: "wpłynęły dzisiaj",
      href: "/admin/reservations" as AppHref,
    },
    {
      label: "Do potwierdzenia",
      value: String(kpi.pending),
      hint: kpi.pending > 0 ? "czekają na decyzję" : "wszystko rozpatrzone",
      href: {
        pathname: "/admin/reservations",
        query: { status: "pending" },
      } as AppHref,
      urgent: kpi.pending > 0,
    },
    {
      label: "Wynajęte auta",
      value: String(kpi.carsRented),
      hint: "w rękach klientów",
      href: "/admin/fleet" as AppHref,
    },
    {
      label: "Dostępne auta",
      value: String(kpi.carsAvailable),
      hint: "gotowe do wydania teraz",
      href: "/admin/fleet" as AppHref,
    },
    {
      label: "Zwroty dzisiaj",
      value: String(kpi.returnsToday),
      hint: `wydania: ${kpi.pickupsToday}`,
      href: "/admin/reservations" as AppHref,
    },
    {
      label: "Przychód miesiąca",
      value: formatPln(kpi.revenueMonthGrosze, "pl"),
      hint: "narastająco, z dni najmu",
      href: "/admin/analytics" as AppHref,
    },
  ];

  return (
    <div>
      {/* Header with the actions. The primary one is deliberately the biggest
          thing on the page: the phone rings, and everything else can wait. */}
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <h1 className="font-heading text-3xl font-bold">Pulpit</h1>
          <p className="text-ink-muted mt-2 text-sm">
            Witaj, {session?.user?.name}.
          </p>
        </div>

        <div className="flex flex-col items-start gap-3 sm:items-end">
          <Link
            href="/admin/reservations/new"
            className="label bg-red hover:bg-red-hover inline-flex h-14 items-center px-8 text-sm text-white transition-colors"
          >
            + Nowa rezerwacja
          </Link>
          <div className="flex flex-wrap gap-2">
            {/* Three shortcuts to where the work actually happens. They land on
                the page that owns the thing rather than opening a half-form
                the operator would have to finish somewhere else anyway. */}
            <Link
              href="/admin/customers"
              className="label-tight border-line-strong text-ink hover:border-ink hover:bg-ink/5 tap inline-flex h-10 items-center border px-4 text-[10px] transition-colors"
            >
              + Dodaj klienta
            </Link>
            <Link
              href="/admin/fleet"
              className="label-tight border-line-strong text-ink hover:border-ink hover:bg-ink/5 tap inline-flex h-10 items-center border px-4 text-[10px] transition-colors"
            >
              + Dodaj wydatek
            </Link>
            <Link
              href="/admin/fleet"
              className="label-tight border-line-strong text-ink hover:border-ink hover:bg-ink/5 tap inline-flex h-10 items-center border px-4 text-[10px] transition-colors"
            >
              + Blokuj auto
            </Link>
            <Link
              href="/admin/fleet/new"
              className="label-tight border-line-strong text-ink hover:border-ink hover:bg-ink/5 tap inline-flex h-10 items-center border px-4 text-[10px] transition-colors"
            >
              + Dodaj auto
            </Link>
          </div>
        </div>
      </div>

      {/* ── Six numbers ─────────────────────────────────────────────────── */}
      <div className="border-line bg-line mt-8 grid grid-cols-2 gap-px border lg:grid-cols-3 xl:grid-cols-6">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="group bg-void hover:bg-graphite/60 p-4 transition-colors sm:p-5"
          >
            <p className="label-tight text-ink-faint text-[10px]">{c.label}</p>
            <p
              className={`font-heading mt-3 text-2xl font-bold tabular-nums ${
                c.urgent ? "text-red" : "text-ink"
              }`}
            >
              {c.value}
            </p>
            <p className="text-ink-faint mt-1 text-[11px]">{c.hint}</p>
          </Link>
        ))}
      </div>

      {/* ── Today, hour by hour ─────────────────────────────────────────── */}
      <section className="mt-12">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="label text-ink text-xs">Dzisiaj</h2>
          <span className="text-ink-faint text-[11px]">
            {kpi.pickupsToday} wydań · {kpi.returnsToday} zwrotów
          </span>
        </div>

        {operations.length === 0 ? (
          <p className="border-line bg-graphite/40 text-silver border p-8 text-center text-sm">
            Dziś nie ma zaplanowanych wydań ani zwrotów.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-line text-ink-faint border-y">
                  <th className="label-tight py-3 pr-6 text-[10px]">Godzina</th>
                  <th className="label-tight py-3 pr-6 text-[10px]">Klient</th>
                  <th className="label-tight py-3 pr-6 text-[10px]">
                    Samochód
                  </th>
                  <th className="label-tight py-3 pr-6 text-[10px]">
                    Operacja
                  </th>
                  <th className="label-tight py-3 pr-6 text-[10px]">Miejsce</th>
                  <th className="label-tight py-3 pr-6 text-[10px]">Status</th>
                  <th className="label-tight py-3 text-[10px]">Akcja</th>
                </tr>
              </thead>
              <tbody>
                {operations.map((o) => (
                  <tr
                    key={`${o.reservationId}-${o.kind}`}
                    className="border-line border-b"
                  >
                    <td className="text-ink py-3 pr-6 font-bold whitespace-nowrap tabular-nums">
                      {timeCell(o.time)}
                    </td>
                    <td className="py-3 pr-6">
                      <Link
                        href={{
                          pathname: "/admin/reservations/[id]",
                          params: { id: o.reservationId },
                        }}
                        className="text-ink tap-area -my-1.5 inline-block py-1.5 underline-offset-4 hover:underline"
                      >
                        {o.customerName}
                      </Link>
                      {/* Numer obok nazwiska na liście „dziś" jest tym, w co
                          operator celuje palcem najczęściej w całym panelu.
                          `.tap-area` daje 44 px pola trafienia, a `text-xs`
                          i układ wiersza zostają nietknięte. */}
                      <a
                        href={`tel:${o.customerPhone.replace(/[^\d+]/g, "")}`}
                        className="text-ink-faint hover:text-red tap-area ml-3 text-xs whitespace-nowrap transition-colors"
                      >
                        {o.customerPhone}
                      </a>
                    </td>
                    <td className="text-silver py-3 pr-6">
                      {o.carName}
                      <span className="text-ink-faint ml-2 text-xs">
                        {o.plate}
                      </span>
                    </td>
                    <td className="py-3 pr-6">
                      <OperationCell kind={o.kind} />
                    </td>
                    <td className="text-silver py-3 pr-6 whitespace-nowrap">
                      {o.locationName}
                    </td>
                    <td className="py-3 pr-6 whitespace-nowrap">
                      <span
                        className={
                          o.status === "pending"
                            ? "label-tight border-red/50 text-red border px-2 py-1 text-[10px]"
                            : "label-tight border-line text-silver border px-2 py-1 text-[10px]"
                        }
                      >
                        {o.status === "confirmed"
                          ? "Gotowe"
                          : o.status === "pending"
                            ? "Do potwierdzenia"
                            : STATUS_LABEL[o.status]}
                      </span>
                    </td>
                    <td className="py-3 whitespace-nowrap">
                      {o.status === "confirmed" ? (
                        <TodayActions
                          reservationId={o.reservationId}
                          kind={o.kind}
                        />
                      ) : (
                        <span className="text-ink-faint text-[10px]">
                          najpierw potwierdź
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Fleet calendar, three weeks ─────────────────────────────────── */}
      <section className="mt-12">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="label text-ink text-xs">Kalendarz floty — 21 dni</h2>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {(
              [
                ["available", "dostępny"],
                ["rented", "wynajęty"],
                ["reserved", "zarezerwowany"],
                ["blocked", "zablokowany"],
                ["service", "serwis"],
              ] as [FleetState, string][]
            ).map(([state, label]) => (
              <li
                key={state}
                className="text-ink-faint flex items-center gap-1.5 text-[10px]"
              >
                <span
                  aria-hidden
                  className={`rounded-pill h-2 w-2 ${FLEET_DOT[state]}`}
                />
                {label}
              </li>
            ))}
          </ul>
        </div>

        {calendar.length === 0 ? (
          <p className="border-line bg-graphite/40 text-silver border p-8 text-center text-sm">
            Brak egzemplarzy we flocie.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="border-collapse text-left text-sm">
              <thead>
                <tr className="text-ink-faint">
                  <th className="label-tight bg-void sticky left-0 z-10 py-2 pr-4 text-[10px]">
                    Auto
                  </th>
                  {calendar[0].cells.map((c) => {
                    const [, m, d] = c.date.split("-");
                    // Weekends get a heavier label: a Saturday return and a
                    // Saturday handover are the two things most often missed.
                    const dow = new Date(`${c.date}T00:00:00Z`).getUTCDay();
                    return (
                      <th
                        key={c.date}
                        className={`label-tight w-7 px-0 py-2 text-center text-[9px] ${
                          dow === 0 || dow === 6 ? "text-silver" : ""
                        }`}
                      >
                        {d}
                        <span className="text-ink-faint block text-[8px]">
                          {m}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {calendar.map((row) => (
                  <tr key={row.carId} className="border-line border-t">
                    <td className="bg-void sticky left-0 z-10 py-2 pr-4 whitespace-nowrap">
                      <Link
                        href={{
                          pathname: "/admin/fleet/[id]",
                          params: { id: row.modelId },
                        }}
                        className="text-ink tap-area -my-2 inline-block py-2 text-xs underline-offset-4 hover:underline"
                      >
                        {row.carName}
                      </Link>
                      <span className="text-ink-faint ml-2 text-[10px]">
                        {row.plate}
                      </span>
                    </td>
                    {row.cells.map((c) => (
                      <td key={c.date} className="px-1 py-1.5">
                        {/* Circles, not blocks. A free day is a soft dot so the
                            days that need attention are the ones that carry
                            colour; a wall of solid green reads as busy. */}
                        <span
                          title={`${c.date} — ${FLEET_LABEL[c.state]}`}
                          className={`mx-auto block h-4 w-4 rounded-full ${FLEET_DOT[c.state]} ${
                            c.state === "available" ? "opacity-35" : ""
                          }`}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Public vehicle statuses: on / off ───────────────────────────── */}
      {/*
        Stoi bezpośrednio pod kalendarzem floty, bo to ten sam obraz oglądany
        z drugiej strony: wyżej operator widzi, gdzie są auta, tutaj decyduje,
        czy widzi to również klient.
      */}
      <section className="mt-12">
        <h2 className="label text-ink mb-4 text-xs">
          Publiczny status samochodów
        </h2>
        <div className="max-w-3xl">
          <PublicStatusToggle enabled={publicStatus.enabled} />
        </div>
      </section>

      {/* ── Needs attention ─────────────────────────────────────────────── */}
      <section className="mt-12">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="label text-ink text-xs">Wymaga uwagi</h2>
          <span className="text-ink-faint text-[11px]">
            {attention.filter((a) => a.urgent).length} pilnych ·{" "}
            {attention.length} łącznie
          </span>
        </div>

        {attention.length === 0 ? (
          <p className="border-line bg-graphite/40 text-silver border p-8 text-center text-sm">
            Nic nie wymaga uwagi: zwroty, płatności, dokumenty i serwisy są na
            bieżąco.
          </p>
        ) : (
          <ul className="border-line divide-line divide-y border">
            {attention.slice(0, 12).map((a, i) => {
              const body = (
                <span className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <span className="flex items-center gap-3">
                    <span aria-hidden className="text-sm">
                      {a.urgent ? "⚠️" : "•"}
                    </span>
                    <span className="text-ink text-sm">{a.subject}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <span
                      className={`text-xs ${a.urgent ? "text-red" : "text-ink-faint"}`}
                    >
                      {a.detail}
                    </span>
                    <span className="label-tight border-line text-ink border px-2 py-0.5 text-[10px]">
                      {a.action}
                    </span>
                  </span>
                </span>
              );
              return (
                <li key={`${a.kind}-${a.subject}-${i}`}>
                  {a.href ? (
                    <Link
                      href={a.href as AppHref}
                      className="hover:bg-ink/5 block transition-colors"
                    >
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── This month, in management terms ─────────────────────────────── */}
      <section className="mt-10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="label text-ink text-xs">Ten miesiąc</h2>
          <span className="text-ink-faint text-[11px]">
            {finance.daysElapsed}{" "}
            {pluralPl(finance.daysElapsed, "dzień", "dni", "dni")} miesiąca ·{" "}
            {finance.daysRented}{" "}
            {pluralPl(finance.daysRented, "dzień", "dni", "dni")} najmu
          </span>
        </div>
        <div className="border-line bg-line grid grid-cols-2 gap-px border lg:grid-cols-3 xl:grid-cols-6">
          <div className="bg-void p-4 sm:p-5">
            <p className="label-tight text-ink-faint text-[10px]">Przychód</p>
            <p className="font-heading text-ink mt-3 text-xl font-bold tabular-nums">
              {formatPln(finance.revenueGrosze, "pl")}
            </p>
          </div>
          <div className="bg-void p-4 sm:p-5">
            <p className="label-tight text-ink-faint text-[10px]">Koszty</p>
            <p className="font-heading text-ink mt-3 text-xl font-bold tabular-nums">
              {formatPln(finance.expenseGrosze, "pl")}
            </p>
          </div>
          <div className="bg-void p-4 sm:p-5">
            <p className="label-tight text-ink-faint text-[10px]">Wynik</p>
            <p
              className={`font-heading mt-3 text-xl font-bold tabular-nums ${
                finance.marginGrosze >= 0 ? "text-emerald-400" : "text-red"
              }`}
            >
              {formatPln(finance.marginGrosze, "pl")}
            </p>
          </div>
          <div className="bg-void p-4 sm:p-5">
            <p className="label-tight text-ink-faint text-[10px]">
              Obłożenie floty
            </p>
            <p className="font-heading text-ink mt-3 text-xl font-bold tabular-nums">
              {/* A fleet that was rented for one day out of two hundred
                  available is not at 0% — it is at almost nothing, which is a
                  different statement from "nothing happened". */}
              {finance.occupancy > 0 && finance.occupancy < 0.005
                ? "<1%"
                : `${Math.round(finance.occupancy * 100)}%`}
            </p>
            {/* Measured against days elapsed, not the whole month — otherwise
                every month looks like a disaster until about the 20th. */}
            <div className="bg-line mt-3 h-1.5 w-full">
              <div
                className="bg-red h-full"
                style={{
                  width: `${Math.max(finance.occupancy * 100, finance.occupancy > 0 ? 2 : 0)}%`,
                }}
              />
            </div>
          </div>
          <div className="bg-void p-4 sm:p-5">
            <p className="label-tight text-ink-faint text-[10px]">
              Średnia cena wynajmu
            </p>
            <p className="font-heading text-ink mt-3 text-xl font-bold tabular-nums">
              {finance.avgDailyRateGrosze == null
                ? "—"
                : `${formatPln(finance.avgDailyRateGrosze, "pl")}/dzień`}
            </p>
          </div>
          <div className="bg-void p-4 sm:p-5">
            <p className="label-tight text-ink-faint text-[10px]">
              Średnia długość wynajmu
            </p>
            <p className="font-heading text-ink mt-3 text-xl font-bold tabular-nums">
              {finance.avgRentalDays == null
                ? "—"
                : (() => {
                    const v = Math.round(finance.avgRentalDays * 10) / 10;
                    const label = Number.isInteger(v)
                      ? pluralPl(v, "dzień", "dni", "dni")
                      : "dnia";
                    return `${v.toLocaleString("pl-PL", {
                      maximumFractionDigits: 1,
                    })} ${label}`;
                  })()}
            </p>
          </div>
        </div>
      </section>

      {/* ── Latest bookings ─────────────────────────────────────────────── */}
      <section className="mt-12">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="label text-ink text-xs">Ostatnie rezerwacje</h2>
          <Link
            href="/admin/reservations"
            className="label-tight text-silver hover:text-ink -my-2 inline-flex min-h-11 items-center text-[10px] transition-colors"
          >
            Wszystkie →
          </Link>
        </div>
        {recent.items.length === 0 ? (
          <p className="border-line bg-graphite/40 text-silver border p-8 text-center text-sm">
            Brak rezerwacji.
          </p>
        ) : (
          <ul className="divide-line border-line divide-y border">
            {recent.items.slice(0, 8).map((r) => (
              <li key={r.id}>
                <Link
                  href={{
                    pathname: "/admin/reservations/[id]",
                    params: { id: r.id },
                  }}
                  className="hover:bg-ink/5 flex flex-wrap items-center justify-between gap-3 p-4 transition-colors"
                >
                  <span className="flex items-center gap-3">
                    <span className="text-ink font-mono text-sm">
                      {r.reference}
                    </span>
                    <StatusBadge status={r.status as ReservationStatus} />
                  </span>
                  <span className="text-silver text-sm">
                    {r.brand} {r.model}
                  </span>
                  <span className="text-ink-faint text-sm whitespace-nowrap">
                    {formatDatePl(r.startDate)} – {formatDatePl(r.endDate)}
                  </span>
                  <span className="text-ink text-sm whitespace-nowrap">
                    {formatPln(r.totalGrosze, locale)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
