import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { guardPage } from "@/lib/auth/guard";
import { Link } from "@/i18n/navigation";
import { getReservation } from "@/lib/admin/reservations";
import { getHandover, lastKnownOdometer } from "@/lib/admin/handovers";
import { HandoverForm } from "../../HandoverForm";
import { formatDatePl } from "@/lib/format";

export const metadata = { title: "Protokół wydania" };

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

  if (!UUID_RE.test(id)) notFound();
  const data = await getReservation(id);
  if (!data) notFound();

  const [existing, lastKm] = await Promise.all([
    getHandover(id, "pickup"),
    lastKnownOdometer(data.r.carId),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={{ pathname: "/admin/reservations/[id]", params: { id } }}
        className="label-tight text-ink-faint hover:text-ink -my-2 inline-flex min-h-11 items-center text-[10px] transition-colors"
      >
        ← Rezerwacja {data.r.reference}
      </Link>

      <header className="mt-4 mb-6">
        <h1 className="font-heading text-ink text-2xl">Protokół wydania</h1>
        <p className="text-silver mt-1 text-sm">
          {`${data.brand ?? ""} ${data.model ?? ""}`.trim()}
          {data.plate ? ` · ${data.plate}` : ""} · {data.r.customerName} · od{" "}
          {formatDatePl(data.r.startDate)}
        </p>
        {existing && (
          <p className="text-ink-faint mt-2 text-xs">
            Protokół już istnieje — zapis go poprawi. Poprzednia treść zostaje w
            dzienniku zdarzeń.
          </p>
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
