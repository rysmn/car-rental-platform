import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { guardPage } from "@/lib/auth/guard";
import { Link } from "@/i18n/navigation";
import { getReservation } from "@/lib/admin/reservations";
import {
  compareHandovers,
  getBothHandovers,
  isCleanReturn,
  type Difference,
} from "@/lib/admin/handovers";
import { HandoverForm } from "../../HandoverForm";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: "Admin.reservations.protocol",
  });
  return { title: t("returnTitle") };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TONE: Record<Difference["tone"], string> = {
  neutral: "border-line text-ink-faint",
  charge: "border-amber-400/50 text-amber-400",
  problem: "bg-red text-white",
};

/**
 * Zwrot auta — ten sam formularz co przy wydaniu, plus RÓŻNICE.
 *
 * Różnice są tu całym powodem, dla którego protokół wydania w ogóle powstaje:
 * paliwo, kilometry, czystość i brakujące wyposażenie to rzeczy, za które ktoś
 * płaci albo nie płaci, a bez dwóch odczytów spisanych tak samo różnica jest
 * kłótnią, nie liczbą.
 */
export default async function ReturnProtocolPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await guardPage("wydania.prowadz");
  const t = await getTranslations("Admin.reservations.protocol");

  if (!UUID_RE.test(id)) notFound();
  const data = await getReservation(id);
  if (!data) notFound();

  const both = await getBothHandovers(id);
  const differences =
    both.pickup && both.return
      ? compareHandovers(both.pickup, both.return, locale)
      : [];

  const intl = locale === "en" ? "en-GB" : "pl-PL";
  const endDay = new Intl.DateTimeFormat(intl, {
    timeZone: "UTC",
    dateStyle: "short",
  }).format(new Date(`${String(data.r.endDate).slice(0, 10)}T00:00:00Z`));
  const car = `${data.brand ?? ""} ${data.model ?? ""}`.trim();

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={{ pathname: "/admin/reservations/[id]", params: { id } }}
        className="label-tight text-ink-faint hover:text-ink -my-2 inline-flex min-h-11 items-center text-[10px] transition-colors"
      >
        {t("backToBooking", { reference: data.r.reference })}
      </Link>

      <header className="mt-4 mb-6">
        <h1 className="font-heading text-ink text-2xl">{t("returnTitle")}</h1>
        <p className="text-silver mt-1 text-sm">
          {t("returnSubtitle", {
            car: `${car}${data.plate ? ` · ${data.plate}` : ""}`,
            customer: data.r.customerName,
            date: endDay,
          })}
        </p>
      </header>

      {!both.pickup && (
        <p className="border-line bg-graphite/40 text-silver mb-6 border p-5 text-sm">
          {t("noPickup")}
        </p>
      )}

      {both.pickup && both.return && (
        <section className="border-line bg-graphite/40 mb-6 border p-5">
          <h2 className="label-tight text-ink-faint mb-4 text-[10px]">
            {t("differences")}
          </h2>
          {isCleanReturn(differences) ? (
            <p className="text-sm text-emerald-400">{t("cleanReturn")}</p>
          ) : (
            <ul className="divide-line divide-y">
              {differences.map((d, i) => (
                <li key={`${d.label}-${i}`} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-ink text-sm">{d.label}</span>
                    <span
                      className={`label-tight border px-2 py-1 text-[10px] ${TONE[d.tone]}`}
                    >
                      {d.from} → {d.to}
                    </span>
                  </div>
                  {d.action && (
                    <p className="text-ink-faint mt-1 text-xs">{d.action}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <HandoverForm
        reservationId={id}
        kind="return"
        existing={both.return}
        suggestedOdometer={both.pickup?.odometerKm ?? null}
      />
    </div>
  );
}
