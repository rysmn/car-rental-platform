import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { guardPage } from "@/lib/auth/guard";
import { Link } from "@/i18n/navigation";
import { getCustomerCard } from "@/lib/admin/customer-card";
import {
  CUSTOMER_FLAG_LABEL,
  CUSTOMER_FLAG_TONE,
} from "@/lib/admin/customer-flags";
import { listDamages, DAMAGE_STATUS_LABEL, ourCostGrosze } from "@/lib/admin/damages";
import { pickFrom } from "@/lib/i18n-pick";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { type ReservationStatus } from "@/lib/admin/reservation-status";
import { FlagForm } from "../FlagForm";
import { ContactForm } from "../ContactForm";
import { domainToUnicode } from "node:url";

/** Punycode-Domain für Anzeige zurück in Unicode: müller.de statt xn--mller-kva.de. */
function showEmail(email: string | null): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at < 0) return email;
  return `${email.slice(0, at + 1)}${domainToUnicode(email.slice(at + 1))}`;
}
import { formatDatePl, formatPln, formatPlnPrecise } from "@/lib/format";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin.customers" });
  return { title: t("metaCustomerTitle") };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Karta klienta — punkt 9 zamówienia „Pulpit i operacje".
 *
 * Każda liczba na tej stronie jest sumą po płatnościach, kaucjach albo
 * szkodach, czyli po modułach z punktów 1, 3 i 6. Dlatego ta strona jest
 * ostatnia w kolejności, a nie pierwsza: wcześniej trzeba by ją było wypełnić
 * liczbami, których nikt nie mierzył.
 *
 * „Wydane" to suma WPŁAT, nie suma wycen — człowiek, który zarezerwował za
 * 10 000 zł i nie zapłacił, nie jest klientem, który wydał 10 000 zł.
 */
export default async function CustomerCardPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await guardPage("klienci.podglad");
  const t = await getTranslations("Admin.customers");

  if (!UUID_RE.test(id)) notFound();
  const [card, damages] = await Promise.all([
    getCustomerCard(id),
    listDamages({ customerId: id }),
  ]);
  if (!card) notFound();

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/admin/customers"
        className="label-tight text-ink-faint hover:text-ink -my-2 inline-flex min-h-11 items-center text-[10px] transition-colors"
      >
        {t("back")}
      </Link>

      <header className="mt-4 mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-ink text-2xl">{card.name}</h1>
          <p className="text-silver mt-1 text-sm">
            {/* Oba odnośniki są tym, po co operator otwiera kartę na telefonie:
                zadzwonić albo napisać. `.tap-area` daje im 44 px pola trafienia
                bez ruszania układu akapitu — oba są szersze niż 44 px, więc
                rośnie wyłącznie wysokość i sąsiadujące pola się nie nakładają. */}
            <a
              href={`tel:${card.phone}`}
              className="hover:text-ink tap-area transition-colors"
            >
              {card.phoneDisplay}
            </a>
            {card.email && (
              <>
                {" · "}
                <a
                  href={`mailto:${card.email}`}
                  className="hover:text-ink tap-area transition-colors"
                >
                  {card.email}
                </a>
              </>
            )}
          </p>
        </div>
        {card.flag !== "none" && (
          <span
            className={`label-tight border px-2 py-1 text-[10px] ${CUSTOMER_FLAG_TONE[card.flag]}`}
          >
            {pickFrom(CUSTOMER_FLAG_LABEL, card.flag, locale)}
          </span>
        )}
      </header>

      <section className="mb-6 grid gap-4 sm:grid-cols-3">
        <Figure label={t("figRentals")} value={String(card.rentals.length)} />
        <Figure
          label={t("figSpent")}
          value={formatPlnPrecise(card.spentGrosze, locale)}
          hint={t("figSpentHint")}
        />
        <Figure
          label={t("figOutstanding")}
          value={formatPlnPrecise(card.outstandingGrosze, locale)}
          tone={card.outstandingGrosze > 0 ? "text-red" : undefined}
          hint={t("figOutstandingHint")}
        />
        <Figure
          label={t("figDamages")}
          value={
            card.damagesOpen
              ? t("damagesWithOpen", {
                  total: card.damagesTotal,
                  open: card.damagesOpen,
                })
              : String(card.damagesTotal)
          }
          tone={card.damagesOpen > 0 ? "text-red" : undefined}
          hint={
            card.damagesOursGrosze > 0
              ? t("figDamagesOurCost", {
                  amount: formatPlnPrecise(card.damagesOursGrosze, locale),
                })
              : undefined
          }
        />
        <Figure
          label={t("figDeposits")}
          value={formatPlnPrecise(card.depositSecuredGrosze, locale)}
          tone={card.depositToReturnCount > 0 ? "text-amber-400" : undefined}
          hint={
            card.depositToReturnCount > 0
              ? t("figDepositsToReturn", { count: card.depositToReturnCount })
              : t("figDepositsSecured")
          }
        />
        <Figure
          label={t("figLateReturns")}
          value={String(card.lateReturns)}
          tone={card.lateReturns > 0 ? "text-amber-400" : undefined}
          hint={t("figLateReturnsHint")}
        />
      </section>

      <section className="border-line bg-graphite/40 mb-6 border p-6">
        <h2 className="label-tight text-ink-faint mb-4 text-[10px]">
          {t("contactSection")}
        </h2>
        <ContactForm customerId={card.id} name={card.name} phone={card.phoneDisplay} email={card.email} emailShown={showEmail(card.email)} />
      </section>

      <section className="border-line bg-graphite/40 mb-6 border p-6">
        <h2 className="label-tight text-ink-faint mb-4 text-[10px]">
          {t("flagInternal")}
        </h2>
        <FlagForm customerId={card.id} flag={card.flag} notes={card.notes} />
        <p className="text-ink-faint mt-4 text-[11px]">
          {t("flagInternalNote")}
        </p>
      </section>

      <section className="border-line bg-graphite/40 mb-6 border p-6">
        <h2 className="label-tight text-ink-faint mb-4 text-[10px]">
          {t("sectionRentals")}
        </h2>
        {card.rentals.length === 0 ? (
          <p className="text-ink-faint text-sm">{t("noRentals")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <tbody>
                {card.rentals.map((r) => (
                  <tr key={r.id} className="border-line/60 border-b last:border-0">
                    <td className="py-3 pr-4">
                      <Link
                        href={{
                          pathname: "/admin/reservations/[id]",
                          params: { id: r.id },
                        }}
                        className="text-ink tap-area -my-2 inline-block py-2 font-mono underline-offset-4 hover:underline"
                      >
                        {r.reference}
                      </Link>
                    </td>
                    <td className="text-silver py-3 pr-4">{r.car}</td>
                    <td className="text-silver py-3 pr-4 whitespace-nowrap">
                      {formatDatePl(r.startDate)} – {formatDatePl(r.endDate)}
                      {r.lateReturn && (
                        <span className="ml-2 text-amber-400">
                          {t("lateReturn")}
                        </span>
                      )}
                    </td>
                    <td className="text-silver py-3 pr-4 text-right whitespace-nowrap tabular-nums">
                      {formatPln(r.paidGrosze, locale)} /{" "}
                      {formatPln(r.totalGrosze, locale)}
                    </td>
                    <td className="py-3">
                      <StatusBadge status={r.status as ReservationStatus} locale={locale} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="border-line bg-graphite/40 border p-6">
        <h2 className="label-tight text-ink-faint mb-4 text-[10px]">
          {t("sectionDamages")}
        </h2>
        {damages.length === 0 ? (
          <p className="text-ink-faint text-sm">{t("noDamages")}</p>
        ) : (
          <ul className="divide-line divide-y">
            {damages.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <Link
                  href={{ pathname: "/admin/szkody/[id]", params: { id: d.id } }}
                  className="text-ink tap-area -my-2 inline-block py-2 text-sm underline-offset-4 hover:underline"
                >
                  {d.title}
                </Link>
                <span className="flex items-center gap-3 text-sm">
                  <span className="text-silver tabular-nums">
                    {formatPln(ourCostGrosze(d), locale)}
                  </span>
                  <span className="text-ink-faint text-xs">
                    {pickFrom(DAMAGE_STATUS_LABEL, d.status, locale)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Figure({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className="border-line bg-graphite/40 border p-5">
      <p className="label-tight text-ink-faint text-[10px]">{label}</p>
      <p className={`font-heading mt-1 text-lg tabular-nums ${tone ?? "text-ink"}`}>
        {value}
      </p>
      {hint && <p className="text-ink-faint mt-1 text-[11px]">{hint}</p>}
    </div>
  );
}
