import { getTranslations, setRequestLocale } from "next-intl/server";
import { guardPage } from "@/lib/auth/guard";
import { Link } from "@/i18n/navigation";
import { listDeposits } from "@/lib/admin/deposits";
import {
  DEPOSIT_STATUSES,
  DEPOSIT_STATUS_TONE,
  type DepositStatus,
} from "@/lib/admin/deposit-options";
import { formatPln, formatPlnPrecise } from "@/lib/format";
import { formatIsoDate } from "../finanse/date-format";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin.deposits" });
  return { title: t("title") };
}

function asStatus(v: unknown): DepositStatus | undefined {
  return typeof v === "string" && DEPOSIT_STATUSES.includes(v as DepositStatus)
    ? (v as DepositStatus)
    : undefined;
}

/**
 * Every deposit in one list, because a deposit is the customer's money.
 *
 * The panel already shows one deposit at a time on the reservation it belongs
 * to; this page answers the question nobody can answer from there — how much
 * of other people's money is the firm holding right now, and which of it is
 * overdue back. The two headline numbers at the top are exactly that, and the
 * "kto ruszył" column is the one the owner asked for: a deposit released with
 * nobody's name against it is the failure this whole module exists to prevent.
 */
export default async function DepositsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await guardPage("kaucje.prowadz");
  const t = await getTranslations("Admin.deposits");

  const sp = await searchParams;
  const status = asStatus(sp.status);

  const all = await listDeposits();
  const rows = status ? all.filter((r) => r.summary.status === status) : all;

  const secured = all.reduce((a, r) => a + r.summary.securedGrosze, 0);
  const toReturn = all.filter((r) => r.summary.status === "to_return");
  const toReturnGrosze = toReturn.reduce(
    (a, r) => a + (r.summary.securedGrosze || r.summary.dueGrosze),
    0,
  );

  return (
    <div>
      <header className="mb-8">
        <h1 className="font-heading text-ink text-2xl">{t("title")}</h1>
        <p className="text-silver mt-1 text-sm">{t("subtitle")}</p>
      </header>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <div className="border-line bg-graphite/40 border p-6">
          <p className="label-tight text-ink-faint text-[10px]">
            {t("summary.securedLabel")}
          </p>
          <p className="font-heading text-ink mt-2 text-2xl tabular-nums">
            {formatPlnPrecise(secured, locale)}
          </p>
          <p className="text-ink-faint mt-1 text-xs">
            {t("summary.securedNote")}
          </p>
        </div>
        <div className="border-line bg-graphite/40 border p-6">
          <p className="label-tight text-ink-faint text-[10px]">
            {t("summary.toReturnLabel")}
          </p>
          <p
            className={`font-heading mt-2 text-2xl tabular-nums ${
              toReturn.length > 0 ? "text-red" : "text-ink"
            }`}
          >
            {toReturn.length} / {formatPlnPrecise(toReturnGrosze, locale)}
          </p>
          <p className="text-ink-faint mt-1 text-xs">
            {t("summary.toReturnNote")}
          </p>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <Link
          href="/admin/kaucje"
          className={`label-tight tap inline-flex h-10 items-center border px-4 text-[10px] transition-colors ${
            status
              ? "border-line-strong text-ink-faint hover:border-ink hover:text-ink"
              : "border-ink text-ink"
          }`}
        >
          {t("filter.all", { count: all.length })}
        </Link>
        {DEPOSIT_STATUSES.map((s) => {
          const n = all.filter((r) => r.summary.status === s).length;
          return (
            <Link
              key={s}
              href={{ pathname: "/admin/kaucje", query: { status: s } }}
              className={`label-tight tap inline-flex h-10 items-center border px-4 text-[10px] transition-colors ${
                status === s
                  ? "border-ink text-ink"
                  : "border-line-strong text-ink-faint hover:border-ink hover:text-ink"
              }`}
            >
              {t(`status.${s}`)} ({n})
            </Link>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <p className="border-line bg-graphite/40 text-silver border p-10 text-center text-sm">
          {status ? t("empty.filtered") : t("empty.none")}
        </p>
      ) : (
        <div className="border-line overflow-x-auto border">
          <table className="w-full min-w-3xl border-collapse text-sm">
            <thead>
              <tr className="border-line bg-graphite/60 border-b text-left">
                <Th>{t("columns.reservation")}</Th>
                <Th>{t("columns.customer")}</Th>
                <Th>{t("columns.car")}</Th>
                <Th>{t("columns.term")}</Th>
                <Th className="text-right">{t("columns.deposit")}</Th>
                <Th className="text-right">{t("columns.secured")}</Th>
                <Th>{t("columns.state")}</Th>
                <Th>{t("columns.by")}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.reservationId}
                  className="border-line/60 hover:bg-ink/5 border-b transition-colors last:border-0"
                >
                  <Td>
                    <Link
                      href={{
                        pathname: "/admin/reservations/[id]",
                        params: { id: r.reservationId },
                      }}
                      className="text-ink tap-area -my-2 inline-block py-2 font-mono underline-offset-4 hover:underline"
                    >
                      {r.reference}
                    </Link>
                  </Td>
                  <Td className="text-silver">{r.customerName}</Td>
                  <Td>
                    <span className="text-ink">{r.car}</span>
                    {r.plate && (
                      <span className="text-ink-faint ml-2">{r.plate}</span>
                    )}
                  </Td>
                  <Td className="text-silver whitespace-nowrap">
                    {formatIsoDate(r.startDate, locale)} –{" "}
                    {formatIsoDate(r.endDate, locale)}
                  </Td>
                  <Td className="text-silver text-right whitespace-nowrap">
                    {formatPln(r.summary.dueGrosze, locale)}
                  </Td>
                  <Td
                    className={`text-right whitespace-nowrap ${
                      r.summary.securedGrosze > 0 ? "text-amber-400" : "text-ink-faint"
                    }`}
                  >
                    {formatPln(r.summary.securedGrosze, locale)}
                  </Td>
                  <Td>
                    {r.summary.status && (
                      <span
                        className={`label-tight border px-2 py-1 text-[10px] ${DEPOSIT_STATUS_TONE[r.summary.status]}`}
                      >
                        {t(`status.${r.summary.status}`)}
                      </span>
                    )}
                  </Td>
                  <Td className="text-ink-faint whitespace-nowrap">
                    {r.lastBy ?? "—"}
                    {r.lastAt && (
                      <span className="ml-2">
                        {formatIsoDate(String(r.lastAt), locale)}
                      </span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`label-tight text-ink-faint px-4 py-3 text-[10px] font-normal ${className}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-4 py-3 align-top ${className}`}>{children}</td>;
}
