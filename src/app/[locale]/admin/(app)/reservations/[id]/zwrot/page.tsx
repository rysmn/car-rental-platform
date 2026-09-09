import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
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
import { formatDatePl } from "@/lib/format";

export const metadata = { title: "Protokół zwrotu" };

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

  if (!UUID_RE.test(id)) notFound();
  const data = await getReservation(id);
  if (!data) notFound();

  const both = await getBothHandovers(id);
  const differences =
    both.pickup && both.return
      ? compareHandovers(both.pickup, both.return)
      : [];

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={{ pathname: "/admin/reservations/[id]", params: { id } }}
        className="label-tight text-ink-faint hover:text-ink -my-2 inline-flex min-h-11 items-center text-[10px] transition-colors"
      >
        ← Rezerwacja {data.r.reference}
      </Link>

      <header className="mt-4 mb-6">
        <h1 className="font-heading text-ink text-2xl">Protokół zwrotu</h1>
        <p className="text-silver mt-1 text-sm">
          {`${data.brand ?? ""} ${data.model ?? ""}`.trim()}
          {data.plate ? ` · ${data.plate}` : ""} · {data.r.customerName} · do{" "}
          {formatDatePl(data.r.endDate)}
        </p>
      </header>

      {!both.pickup && (
        <p className="border-line bg-graphite/40 text-silver mb-6 border p-5 text-sm">
          Nie ma protokołu wydania tego auta, więc nie będzie z czym porównywać
          zwrotu. Spisz, co widzisz — to i tak jest jedyny zapis, jaki po tym
          najmie zostanie.
        </p>
      )}

      {both.pickup && both.return && (
        <section className="border-line bg-graphite/40 mb-6 border p-5">
          <h2 className="label-tight text-ink-faint mb-4 text-[10px]">
            Różnice wobec wydania
          </h2>
          {isCleanReturn(differences) ? (
            <p className="text-sm text-emerald-400">
              Auto wróciło w takim stanie, w jakim wyjechało — nie ma czego
              rozliczać.
            </p>
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
