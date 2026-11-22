import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { guardPage } from "@/lib/auth/guard";
import { Link } from "@/i18n/navigation";
import { getReservation } from "@/lib/admin/reservations";
import { getHandover, lastKnownOdometer } from "@/lib/admin/handovers";
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
  return { title: t("pickupTitle") };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Wydanie auta, wypełniane telefonem przy aucie.
 *
 * Osobna strona, nie sekcja na stronie rezerwacji: to jest robota wykonywana
 * na parkingu, a nie przy biurku, i ma zajmować cały ekran telefonu bez
 * przewijania przez wycenę, płatności i kaucję.
 */
export default async function PickupProtocolPage({
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

  const [existing, lastKm] = await Promise.all([
    getHandover(id, "pickup"),
    lastKnownOdometer(data.r.carId),
  ]);

  const intl = locale === "en" ? "en-GB" : "pl-PL";
  const startDay = new Intl.DateTimeFormat(intl, {
    timeZone: "UTC",
    dateStyle: "short",
  }).format(new Date(`${String(data.r.startDate).slice(0, 10)}T00:00:00Z`));
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
        <h1 className="font-heading text-ink text-2xl">{t("pickupTitle")}</h1>
        <p className="text-silver mt-1 text-sm">
          {t("pickupSubtitle", {
            car: `${car}${data.plate ? ` · ${data.plate}` : ""}`,
            customer: data.r.customerName,
            date: startDay,
          })}
        </p>
        {existing && (
          <p className="text-ink-faint mt-2 text-xs">{t("alreadyExists")}</p>
        )}
      </header>

      <HandoverForm
        reservationId={id}
        kind="pickup"
        existing={existing}
        suggestedOdometer={existing ? null : lastKm}
      />
    </div>
  );
}
