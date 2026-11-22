import { getTranslations, setRequestLocale } from "next-intl/server";
import { guardPage } from "@/lib/auth/guard";
import { Link } from "@/i18n/navigation";
import {
  DAMAGE_STATUSES,
  DAMAGE_STATUS_TONE,
  listCarChoices,
  listDamages,
  listReservationChoices,
  ourCostGrosze,
  type DamageStatus,
} from "@/lib/admin/damages";
import { DamageForm } from "./DamageForm";
import { formatPln, formatPlnPrecise } from "@/lib/format";
import { formatIsoDate } from "../finanse/date-format";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin.damages" });
  return { title: t("title") };
}

function asStatus(v: unknown): DamageStatus | undefined {
  return typeof v === "string" && DAMAGE_STATUSES.includes(v as DamageStatus)
    ? (v as DamageStatus)
    : undefined;
}

/**
 * Wszystkie szkody floty w jednym miejscu.
 *
 * Kolumna „Nasz koszt" jest osobną liczbą od kosztu naprawy i to jest cała
 * treść tej strony: z ubezpieczycielem firma płaci udział własny, bez niego —
 * całość. Sumowanie kosztu naprawy pokazywałoby stratę, której nie było.
 */
export default async function DamagesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await guardPage("wydania.prowadz");
  const t = await getTranslations("Admin.damages");

  const sp = await searchParams;
  const status = asStatus(sp.status);
  const nowa = sp.nowa === "1";

  const [all, cars, reservations] = await Promise.all([
    listDamages(),
    listCarChoices(),
    listReservationChoices(),
  ]);
  const rows = status ? all.filter((d) => d.status === status) : all;
  const open = all.filter((d) => d.status !== "closed");
  const openOurs = open.reduce((a, d) => a + ourCostGrosze(d), 0);

  return (
    <div>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-ink text-2xl">{t("title")}</h1>
          <p className="text-silver mt-1 text-sm">
            {t("subtitle", {
              count: open.length,
              amount: formatPlnPrecise(openOurs, locale),
            })}
          </p>
        </div>
        <Link
          href={
            nowa
              ? { pathname: "/admin/szkody" }
              : { pathname: "/admin/szkody", query: { nowa: "1" } }
          }
          className="label bg-red hover:bg-red-hover tap inline-flex h-12 items-center px-6 text-xs text-white transition-colors"
        >
          {nowa ? t("newForm.close") : t("newForm.open")}
        </Link>
      </header>

      {nowa && (
        <section className="border-line bg-graphite/40 mb-8 border p-6">
          <h2 className="label-tight text-ink-faint mb-4 text-[10px]">
            {t("newForm.title")}
          </h2>
          <DamageForm cars={cars} reservations={reservations} existing={null} />
        </section>
      )}

      <div className="mb-6 flex flex-wrap gap-2">
        <Link
          href="/admin/szkody"
          className={`label-tight tap inline-flex h-10 items-center border px-4 text-[10px] transition-colors ${
            status
              ? "border-line-strong text-ink-faint hover:border-ink hover:text-ink"
              : "border-ink text-ink"
          }`}
        >
          {t("filter.all", { count: all.length })}
        </Link>
        {DAMAGE_STATUSES.map((s) => (
          <Link
            key={s}
            href={{ pathname: "/admin/szkody", query: { status: s } }}
            className={`label-tight tap inline-flex h-10 items-center border px-4 text-[10px] transition-colors ${
              status === s
                ? "border-ink text-ink"
                : "border-line-strong text-ink-faint hover:border-ink hover:text-ink"
            }`}
          >
            {t(`status.${s}`)} ({all.filter((d) => d.status === s).length})
          </Link>
        ))}
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
                <Th>{t("columns.date")}</Th>
                <Th>{t("columns.car")}</Th>
                <Th>{t("columns.what")}</Th>
                <Th>{t("columns.customer")}</Th>
                <Th className="text-right">{t("columns.repair")}</Th>
                <Th className="text-right">{t("columns.ours")}</Th>
                <Th>{t("columns.status")}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr
                  key={d.id}
                  className="border-line/60 hover:bg-ink/5 border-b transition-colors last:border-0"
                >
                  <Td className="text-silver whitespace-nowrap">
                    {formatIsoDate(d.occurredOn, locale)}
                  </Td>
                  <Td>
                    <span className="text-ink">{d.car}</span>
                    {d.plate && (
                      <span className="text-ink-faint ml-2">{d.plate}</span>
                    )}
                  </Td>
                  <Td>
                    <Link
                      href={{ pathname: "/admin/szkody/[id]", params: { id: d.id } }}
                      className="text-ink tap-area -my-2 inline-block py-2 underline-offset-4 hover:underline"
                    >
                      {d.title}
                    </Link>
                    {d.photos.length > 0 && (
                      <span className="text-ink-faint ml-2 text-xs">
                        {t("photoCount", { count: d.photos.length })}
                      </span>
                    )}
                  </Td>
                  <Td className="text-silver">
                    {d.customerName ?? "—"}
                    {d.reference && (
                      <span className="text-ink-faint ml-2 font-mono text-xs">
                        {d.reference}
                      </span>
                    )}
                  </Td>
                  <Td className="text-silver text-right whitespace-nowrap">
                    {formatPln(d.repairCostGrosze, locale)}
                  </Td>
                  <Td className="text-ink text-right whitespace-nowrap">
                    {formatPln(ourCostGrosze(d), locale)}
                  </Td>
                  <Td>
                    <span
                      className={`label-tight border px-2 py-1 text-[10px] ${DAMAGE_STATUS_TONE[d.status]}`}
                    >
                      {t(`status.${d.status}`)}
                    </span>
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
